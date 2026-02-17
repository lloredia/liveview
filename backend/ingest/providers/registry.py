"""
Provider registry with health scoring and deterministic failover cascade.
Computes health scores from rolling metrics and selects optimal providers.
"""
from __future__ import annotations

import time
from typing import Optional

from shared.config import Settings, get_settings
from shared.models.domain import ProviderHealth, ProviderSelection
from shared.models.enums import ProviderName, Sport, Tier
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from ingest.providers.base import BaseProvider

logger = get_logger(__name__)


class HealthScorer:
    """
    Computes a composite health score for each provider based on rolling metrics.

    Score formula:
        score = w_err * (1 - error_rate)
              + w_lat * (1 - min(avg_latency_ms / 5000, 1.0))
              + w_rl  * (1 - min(rate_limit_frequency / 10, 1.0))
              + w_fresh * (1 - min(freshness_lag_ms / 10000, 1.0))

    Score range: [0.0, 1.0] where 1.0 = perfectly healthy.
    """

    # Weights for each health dimension (must sum to 1.0)
    W_ERROR_RATE = 0.40
    W_LATENCY = 0.25
    W_RATE_LIMIT = 0.20
    W_FRESHNESS = 0.15

    # Normalization ceilings
    MAX_LATENCY_MS = 5000.0
    MAX_RATE_LIMIT_HITS = 10
    MAX_FRESHNESS_LAG_MS = 10000.0

    def __init__(self, redis: RedisManager, settings: Settings | None = None) -> None:
        self._redis = redis
        self._settings = settings or get_settings()

    async def compute_health(self, provider: ProviderName) -> ProviderHealth:
        """
        Compute the current health score for a provider from its rolling sample window.

        Returns:
            ProviderHealth with computed score and component metrics.
        """
        samples = await self._redis.get_provider_samples(provider.value)
        now = time.time()
        window_s = self._settings.provider_health_window_s

        # Filter to window
        recent = [s for s in samples if (now - s["ts"]) <= window_s]

        if not recent:
            # No data → assume healthy (benefit of the doubt for cold start)
            return ProviderHealth(provider=provider, score=0.8, sample_count=0)

        total = len(recent)
        errors = sum(1 for s in recent if s.get("error", False))
        rate_limits = sum(1 for s in recent if s.get("rate_limited", False))

        latencies = [s["latency_ms"] for s in recent if s.get("latency_ms") is not None]
        avg_latency = sum(latencies) / len(latencies) if latencies else 0.0

        # Freshness lag: time since last successful sample
        successful_samples = [s for s in recent if not s.get("error", False)]
        if successful_samples:
            last_success_ts = max(s["ts"] for s in successful_samples)
            freshness_lag_ms = (now - last_success_ts) * 1000
        else:
            freshness_lag_ms = self.MAX_FRESHNESS_LAG_MS

        # Compute error rate
        error_rate = errors / total if total > 0 else 0.0

        # Normalized components (all in [0,1] where 1 = good)
        err_component = 1.0 - error_rate
        lat_component = 1.0 - min(avg_latency / self.MAX_LATENCY_MS, 1.0)
        rl_component = 1.0 - min(rate_limits / self.MAX_RATE_LIMIT_HITS, 1.0)
        fresh_component = 1.0 - min(freshness_lag_ms / self.MAX_FRESHNESS_LAG_MS, 1.0)

        score = (
            self.W_ERROR_RATE * err_component
            + self.W_LATENCY * lat_component
            + self.W_RATE_LIMIT * rl_component
            + self.W_FRESHNESS * fresh_component
        )

        # Clamp to [0, 1]
        score = max(0.0, min(1.0, score))

        from shared.utils.metrics import PROVIDER_HEALTH_SCORE
        PROVIDER_HEALTH_SCORE.labels(provider=provider.value).set(score)

        last_success = None
        last_failure = None
        if successful_samples:
            from datetime import datetime, timezone
            last_success = datetime.fromtimestamp(
                max(s["ts"] for s in successful_samples), tz=timezone.utc
            )
        failed_samples = [s for s in recent if s.get("error", False)]
        if failed_samples:
            from datetime import datetime, timezone
            last_failure = datetime.fromtimestamp(
                max(s["ts"] for s in failed_samples), tz=timezone.utc
            )

        return ProviderHealth(
            provider=provider,
            error_rate=round(error_rate, 4),
            avg_latency_ms=round(avg_latency, 2),
            rate_limit_hits=rate_limits,
            freshness_lag_ms=round(freshness_lag_ms, 2),
            score=round(score, 4),
            last_success=last_success,
            last_failure=last_failure,
            sample_count=total,
        )


class ProviderRegistry:
    """
    Manages provider instances and implements deterministic failover cascade.

    Selection logic:
    1. Check if a provider is already selected (pinned) for this match+tier with TTL
    2. If not, evaluate all providers' health scores
    3. Select the highest-scoring provider that supports the sport
    4. Pin selection in Redis with flap-prevention TTL
    """

    def __init__(
        self,
        providers: dict[ProviderName, BaseProvider],
        health_scorer: HealthScorer,
        redis: RedisManager,
        settings: Settings | None = None,
    ) -> None:
        self._providers = providers
        self._scorer = health_scorer
        self._redis = redis
        self._settings = settings or get_settings()
        self._cascade_order = [
            ProviderName(p) for p in self._settings.provider_order
            if p in [pn.value for pn in providers.keys()]
        ]

    @property
    def providers(self) -> dict[ProviderName, BaseProvider]:
        return self._providers

    def get_provider(self, name: ProviderName) -> Optional[BaseProvider]:
        return self._providers.get(name)

    async def select_provider(
        self, match_id: str, tier: Tier, sport: Sport
    ) -> tuple[ProviderName, BaseProvider]:
        """
        Select the best provider for a match+tier combination.

        Implements:
        - Persistent selection with TTL (anti-flap)
        - Health-based cascade fallback
        - Sport compatibility check
        - Quota awareness

        Args:
            match_id: Canonical match UUID string.
            tier: Update tier being requested.
            sport: Sport type for compatibility filtering.

        Returns:
            Tuple of (provider_name, provider_instance).

        Raises:
            RuntimeError: If no provider is available.
        """
        # 1. Check for pinned selection
        pinned = await self._redis.get_provider_selection(match_id, tier.value)
        if pinned:
            provider_name = ProviderName(pinned)
            provider = self._providers.get(provider_name)
            if provider and provider.supports(sport):
                # Verify it's still healthy enough
                health = await self._scorer.compute_health(provider_name)
                if health.score >= self._settings.provider_health_threshold:
                    # Also check quota
                    if await provider.check_quota():
                        return provider_name, provider
                    else:
                        logger.info(
                            "provider_quota_exceeded_failover",
                            provider=pinned,
                            match_id=match_id,
                            tier=tier.value,
                        )
                else:
                    logger.info(
                        "provider_unhealthy_failover",
                        provider=pinned,
                        health_score=health.score,
                        match_id=match_id,
                        tier=tier.value,
                    )

        # 2. Evaluate all providers and select best
        candidates: list[tuple[float, ProviderName, BaseProvider]] = []

        for name in self._cascade_order:
            prov = self._providers.get(name)
            if not prov or not prov.supports(sport):
                continue

            health = await self._scorer.compute_health(name)
            if health.score < self._settings.provider_health_threshold:
                logger.debug(
                    "provider_below_threshold",
                    provider=name.value,
                    score=health.score,
                    threshold=self._settings.provider_health_threshold,
                )
                continue

            if not await prov.check_quota():
                logger.debug("provider_quota_full", provider=name.value)
                continue

            candidates.append((health.score, name, prov))

        if not candidates:
            # Desperation: use cascade order regardless of health
            logger.warning(
                "all_providers_degraded_fallback",
                match_id=match_id,
                tier=tier.value,
            )
            for name in self._cascade_order:
                prov = self._providers.get(name)
                if prov and prov.supports(sport):
                    await self._redis.set_provider_selection(
                        match_id, tier.value, name.value,
                        ttl_s=self._settings.provider_flap_ttl_s,
                    )
                    return name, prov

            raise RuntimeError(
                f"No provider available for match={match_id} tier={tier.value} sport={sport.value}"
            )

        # Sort by score descending, stable sort preserves cascade order for ties
        candidates.sort(key=lambda x: x[0], reverse=True)
        best_score, best_name, best_provider = candidates[0]

        # 3. Pin selection with anti-flap TTL
        await self._redis.set_provider_selection(
            match_id, tier.value, best_name.value,
            ttl_s=self._settings.provider_flap_ttl_s,
        )

        logger.info(
            "provider_selected",
            provider=best_name.value,
            match_id=match_id,
            tier=tier.value,
            health_score=best_score,
        )

        return best_name, best_provider

    async def get_all_health(self) -> dict[ProviderName, ProviderHealth]:
        """Get health scores for all registered providers."""
        results: dict[ProviderName, ProviderHealth] = {}
        for name in self._providers:
            results[name] = await self._scorer.compute_health(name)
        return results
