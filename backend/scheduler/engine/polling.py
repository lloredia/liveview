"""
Adaptive polling engine for the Live View scheduler.
Computes dynamic poll intervals based on match state, demand, provider health, and quotas.
"""
from __future__ import annotations

import math
import random
from typing import Optional

from shared.config import Settings, get_settings
from shared.models.enums import MatchPhase, Sport, Tier
from shared.utils.logging import get_logger
from shared.utils.metrics import SCHEDULER_INTERVAL
from shared.utils.redis_manager import RedisManager

logger = get_logger(__name__)

# ── Sport tempo profiles (base intervals per phase in seconds) ──────────
# These represent "natural" polling rates before demand/health adjustments.
SPORT_TEMPO: dict[Sport, dict[str, float]] = {
    Sport.SOCCER: {
        "live_active": 3.0,      # During active play
        "live_break": 15.0,      # Halftime, breaks
        "pre_match": 60.0,       # Before kickoff
        "scheduled": 120.0,      # Hours before
        "finished": 300.0,       # Post-match cooldown
    },
    Sport.BASKETBALL: {
        "live_active": 2.0,      # Fast-paced game
        "live_break": 10.0,      # Timeouts, quarter breaks
        "pre_match": 60.0,
        "scheduled": 120.0,
        "finished": 300.0,
    },
    Sport.HOCKEY: {
        "live_active": 3.0,
        "live_break": 12.0,
        "pre_match": 60.0,
        "scheduled": 120.0,
        "finished": 300.0,
    },
    Sport.BASEBALL: {
        "live_active": 5.0,      # Slower tempo
        "live_break": 20.0,
        "pre_match": 60.0,
        "scheduled": 120.0,
        "finished": 300.0,
    },
    Sport.FOOTBALL: {
        "live_active": 3.0,     # Quarters, plays
        "live_break": 15.0,     # Between quarters, halftime
        "pre_match": 60.0,
        "scheduled": 120.0,
        "finished": 300.0,
    },
}

# Tier multipliers: higher tiers poll less aggressively
TIER_MULTIPLIERS: dict[Tier, float] = {
    Tier.SCOREBOARD: 1.0,
    Tier.EVENTS: 1.5,
    Tier.STATS: 3.0,
}


def _phase_tempo_key(phase: MatchPhase) -> str:
    """Map a MatchPhase to a tempo profile key."""
    if phase.is_terminal:
        return "finished"
    if phase == MatchPhase.SCHEDULED:
        return "scheduled"
    if phase == MatchPhase.PRE_MATCH:
        return "pre_match"
    if phase in (
        MatchPhase.LIVE_HALFTIME,
        MatchPhase.BREAK,
    ):
        return "live_break"
    if phase.is_live:
        return "live_active"
    return "scheduled"


class AdaptivePollingEngine:
    """
    Computes optimal polling intervals for each match+tier combination.

    The interval formula:

        base = sport_tempo[phase] * tier_multiplier
        demand_factor = 1.0 / (1.0 + ln(1 + subscriber_count))
        health_factor = 1.0 + (1.0 - provider_health_score) * 2.0
        quota_factor  = 1.0 + max(0, (quota_usage / quota_limit - 0.7)) * 5.0

        interval = base * demand_factor * health_factor * quota_factor
        interval = clamp(interval, min_poll, max_poll)
        interval += jitter(interval * jitter_factor)
    """

    def __init__(self, redis: RedisManager, settings: Settings | None = None) -> None:
        self._redis = redis
        self._settings = settings or get_settings()

    async def compute_interval(
        self,
        match_id: str,
        sport: Sport,
        phase: MatchPhase,
        tier: Tier,
        provider_health_score: float = 1.0,
        quota_usage: int = 0,
        quota_limit: int = 1000,
    ) -> float:
        """
        Compute the adaptive polling interval for a match+tier.

        Args:
            match_id: Canonical match UUID string.
            sport: Sport type.
            phase: Current match phase.
            tier: Update tier.
            provider_health_score: Current provider health [0, 1].
            quota_usage: Current RPM usage.
            quota_limit: RPM limit.

        Returns:
            Polling interval in seconds (with jitter applied).
        """
        # 1. Base interval from sport tempo + phase
        tempo_key = _phase_tempo_key(phase)
        sport_tempos = SPORT_TEMPO.get(sport, SPORT_TEMPO[Sport.SOCCER])
        base_interval = sport_tempos.get(tempo_key, 30.0)

        # 2. Tier multiplier
        tier_mult = TIER_MULTIPLIERS.get(tier, 1.0)
        interval = base_interval * tier_mult

        # 3. Demand factor: more subscribers → faster polling
        # Uses logarithmic scaling to prevent extreme speedup
        subscriber_count = await self._redis.get_subscriber_count(match_id)
        if subscriber_count > 0:
            demand_factor = 1.0 / (1.0 + math.log(1.0 + subscriber_count))
        else:
            # No subscribers → significantly slower (but don't stop completely)
            demand_factor = 3.0

        interval *= demand_factor

        # 4. Health factor: degraded provider → poll slower to avoid cascading failure
        # health_score is [0, 1], lower = worse
        health_factor = 1.0 + (1.0 - provider_health_score) * 2.0
        interval *= health_factor

        # 5. Quota pressure: approaching limit → exponential backoff
        if quota_limit > 0:
            usage_ratio = quota_usage / quota_limit
            if usage_ratio > 0.7:
                # Exponential increase as we approach limit
                quota_factor = 1.0 + (usage_ratio - 0.7) * 5.0
                if usage_ratio > 0.9:
                    quota_factor *= 2.0  # Aggressive backoff near limit
                interval *= quota_factor

        # 6. Clamp to configured bounds
        min_interval = self._settings.scheduler_min_poll_interval_s
        max_interval = self._settings.scheduler_max_poll_interval_s
        interval = max(min_interval, min(max_interval, interval))

        # 7. Add jitter to prevent synchronized bursts
        jitter_range = interval * self._settings.scheduler_jitter_factor
        jitter = random.uniform(-jitter_range, jitter_range)
        interval = max(min_interval, interval + jitter)

        # Record metric
        SCHEDULER_INTERVAL.labels(
            sport=sport.value,
            phase=tempo_key,
        ).observe(interval)

        logger.debug(
            "interval_computed",
            match_id=match_id,
            sport=sport.value,
            phase=phase.value,
            tier=tier.value,
            base=base_interval,
            subscribers=subscriber_count,
            demand_factor=round(demand_factor, 3),
            health_factor=round(health_factor, 3),
            final_interval=round(interval, 2),
        )

        return interval
