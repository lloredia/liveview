"""
Continuous Match Verification Engine.
Pulls live match snapshots, fetches from ESPN (and optional sources), compares, reconciles.
"""
from __future__ import annotations

import asyncio
import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from shared.models.domain import LeagueRef, TeamRef
from shared.models.enums import Sport
from shared.models.orm import LeagueORM, MatchORM, MatchStateORM, ProviderMappingORM, SportORM, TeamORM
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger
from shared.utils.redis_manager import RedisManager

from verifier.circuit_breaker import CircuitBreaker
from verifier.confidence import CurrentState, compute_confidence, current_matches_recommended, delta
from verifier.config import VerifierSettings, get_verifier_settings
from verifier.rate_limiter import DomainRateLimiter
from verifier.metrics import record_correction, record_dispute, record_mismatch, record_rate_limit_hit
from verifier.reconciliation import apply_correction, flag_dispute, set_confidence, set_last_checked
from verifier.sources.base import CanonicalMatchState
from verifier.sources.espn import ESPNVerificationSource

logger = get_logger(__name__)

# ESPN league path by provider_id (from provider_mappings for league)
ESPN_LEAGUE_PATHS: dict[str, str] = {
    "eng.1": "soccer/eng.1", "eng.2": "soccer/eng.2", "eng.fa": "soccer/eng.fa",
    "eng.league_cup": "soccer/eng.league_cup", "usa.1": "soccer/usa.1",
    "esp.1": "soccer/esp.1", "ger.1": "soccer/ger.1", "ita.1": "soccer/ita.1",
    "fra.1": "soccer/fra.1", "ned.1": "soccer/ned.1", "por.1": "soccer/por.1",
    "nba": "basketball/nba", "nhl": "hockey/nhl", "mlb": "baseball/mlb", "nfl": "football/nfl",
}


@dataclass
class LiveMatchSnapshot:
    match_id: uuid.UUID
    home_name: str
    away_name: str
    league_id: uuid.UUID
    league_name: str
    sport_type: str
    espn_league_path: Optional[str] = None
    score_home: int = 0
    score_away: int = 0
    phase: str = "scheduled"
    clock: Optional[str] = None
    period: Optional[str] = None
    version: int = 0
    league_orm: Any = None
    home_team_orm: Any = None
    away_team_orm: Any = None
    start_time: Optional[datetime] = None


class ContinuousMatchVerificationEngine:
    """Runs verification loop: load live matches -> fetch from sources -> compare -> reconcile."""

    def __init__(
        self,
        db: DatabaseManager,
        redis: RedisManager,
        settings: Optional[VerifierSettings] = None,
    ) -> None:
        self._db = db
        self._redis = redis
        self._settings = settings or get_verifier_settings()
        self._rate_limiter = DomainRateLimiter(self._settings)
        self._circuit = CircuitBreaker(self._settings)
        self._espn = ESPNVerificationSource(timeout_s=self._settings.fetch_timeout_s)
        self._sem = asyncio.Semaphore(self._settings.max_concurrent_requests)

    async def get_live_matches(self) -> list[LiveMatchSnapshot]:
        """Load live matches from Postgres with league and teams."""
        async with self._db.read_session() as session:
            stmt = (
                select(MatchORM, MatchStateORM)
                .outerjoin(MatchStateORM, MatchORM.id == MatchStateORM.match_id)
                .where(
                    (MatchORM.phase.like("live%")) | (MatchORM.phase == "break")
                )
            )
            result = await session.execute(stmt)
            rows = result.all()
            if not rows:
                return []

            match_ids = [r[0].id for r in rows]
            # Load league, sport, home_team, away_team
            match_stmt = (
                select(MatchORM)
                .options(
                    selectinload(MatchORM.league).selectinload(LeagueORM.sport),
                    selectinload(MatchORM.home_team),
                    selectinload(MatchORM.away_team),
                )
                .where(MatchORM.id.in_(match_ids))
            )
            match_result = await session.execute(match_stmt)
            matches_by_id = {m.id: m for m in match_result.scalars().unique()}

            # ESPN league mapping: league_id -> espn provider_id
            league_ids = list({r[0].league_id for r in rows})
            map_stmt = select(ProviderMappingORM.canonical_id, ProviderMappingORM.provider_id).where(
                ProviderMappingORM.entity_type == "league",
                ProviderMappingORM.provider == "espn",
                ProviderMappingORM.canonical_id.in_(league_ids),
            )
            map_result = await session.execute(map_stmt)
            league_to_espn = {r[0]: r[1] for r in map_result.all()}

            snapshots: list[LiveMatchSnapshot] = []
            for match_orm, state_orm in rows:
                m = matches_by_id.get(match_orm.id)
                if not m or not m.league:
                    continue
                state = state_orm or MatchStateORM(match_id=match_orm.id, score_home=0, score_away=0, phase="scheduled")
                espn_id = league_to_espn.get(match_orm.league_id)
                path = ESPN_LEAGUE_PATHS.get(espn_id, "") if espn_id else None
                sport_type = (m.league.sport.sport_type or "soccer") if m.league.sport else "soccer"
                snapshots.append(LiveMatchSnapshot(
                    match_id=match_orm.id,
                    home_name=m.home_team.name if m.home_team else "",
                    away_name=m.away_team.name if m.away_team else "",
                    league_id=match_orm.league_id,
                    league_name=m.league.name or "",
                    sport_type=sport_type,
                    espn_league_path=path,
                    score_home=state.score_home or 0,
                    score_away=state.score_away or 0,
                    phase=state.phase or "scheduled",
                    clock=state.clock,
                    period=state.period,
                    version=state.version or 0,
                    league_orm=m.league,
                    home_team_orm=m.home_team,
                    away_team_orm=m.away_team,
                    start_time=match_orm.start_time,
                ))
            return snapshots

    def _match_team_names(self, home: str, away: str, espn_home: str, espn_away: str) -> bool:
        """Loose match on team names (primary comparison)."""
        def norm(s: str) -> str:
            return (s or "").strip().lower()[:30]
        return (norm(home) == norm(espn_home) and norm(away) == norm(espn_away)) or (
            norm(home) in norm(espn_home) and norm(away) in norm(espn_away)
        )

    async def _fetch_espn_for_league(
        self,
        sport_league_path: str,
        sport: str,
    ) -> list[tuple[str, str, str, CanonicalMatchState]]:
        url = self._espn._scoreboard_url(sport_league_path)
        if not await self._rate_limiter.allow_request(url):
            record_rate_limit_hit()
            await self._rate_limiter.wait_for_slot(url, timeout_s=15.0)
        if not await self._circuit.allow_request(url):
            return []
        base_delay = self._settings.retry_base_delay_s
        max_attempts = self._settings.retry_max_attempts
        last_exc = None
        for attempt in range(max_attempts + 1):
            try:
                async with self._sem:
                    result = await self._espn.fetch_league_scoreboard(sport_league_path, sport)
                await self._circuit.record_success(url)
                return result
            except Exception as e:
                last_exc = e
                await self._circuit.record_failure(url)
                if attempt < max_attempts:
                    delay = base_delay * (2 ** attempt)
                    logger.debug("espn_fetch_retry", path=sport_league_path, attempt=attempt + 1, delay_s=delay)
                    await asyncio.sleep(delay)
        logger.debug("espn_league_fetch_error", path=sport_league_path, error=str(last_exc))
        return []

    async def verify_one(self, snap: LiveMatchSnapshot) -> None:
        """Verify a single match: gather sources, compare, reconcile or flag."""
        current = CurrentState(
            score_home=snap.score_home,
            score_away=snap.score_away,
            phase=snap.phase,
            clock=snap.clock,
            period=snap.period,
            version=snap.version,
        )
        verified_list: list[CanonicalMatchState] = []

        if snap.espn_league_path:
            events = await self._fetch_espn_for_league(snap.espn_league_path, snap.sport_type)
            for espn_home, espn_away, _eid, state in events:
                if self._match_team_names(snap.home_name, snap.away_name, espn_home, espn_away):
                    verified_list.append(state)
                    break

        if not verified_list:
            await set_last_checked(self._redis, str(snap.match_id))
            return

        conf, _disposition, recommended = compute_confidence(current, verified_list)
        await set_confidence(self._redis, str(snap.match_id), conf)
        await set_last_checked(self._redis, str(snap.match_id))

        if recommended is None:
            return

        if current_matches_recommended(current, recommended):
            return

        record_mismatch()
        delta_dict = delta(current, recommended)

        if conf >= self._settings.confidence_high:
            try:
                league_ref = _league_ref_from_orm(snap.league_orm)
                home_ref = _team_ref_from_orm(snap.home_team_orm)
                away_ref = _team_ref_from_orm(snap.away_team_orm)
                if league_ref and home_ref and away_ref and snap.start_time:
                    async with self._db.write_session() as session:
                        applied = await apply_correction(
                            session, self._redis, snap.match_id,
                            league_ref, home_ref, away_ref, snap.start_time, recommended, self._settings,
                        )
                        if applied:
                            record_correction()
            except Exception as e:
                logger.exception("verification_apply_error", match_id=str(snap.match_id), error=str(e))
        elif conf >= self._settings.confidence_medium:
            logger.warning(
                "verification_medium_confidence",
                match_id=str(snap.match_id),
                confidence=conf,
                delta=delta_dict,
            )
        else:
            record_dispute()
            await flag_dispute(
                self._redis, snap.match_id,
                {"score_home": current.score_home, "score_away": current.score_away, "phase": current.phase},
                [{"source": s.source, "score_home": s.score_home, "score_away": s.score_away, "phase": s.phase} for s in verified_list],
                conf,
            )


def _league_ref_from_orm(league_orm: Any) -> Optional[LeagueRef]:
    if not league_orm:
        return None
    try:
        sport = Sport(league_orm.sport.sport_type) if league_orm.sport else Sport.SOCCER
    except ValueError:
        sport = Sport.SOCCER
    return LeagueRef(
        id=league_orm.id,
        name=league_orm.name or "",
        sport=sport,
        country=getattr(league_orm, "country", "") or "International",
        logo_url=getattr(league_orm, "logo_url", None),
    )


def _team_ref_from_orm(team_orm: Any) -> Optional[TeamRef]:
    if not team_orm:
        return None
    return TeamRef(
        id=team_orm.id,
        name=team_orm.name or "",
        short_name=getattr(team_orm, "short_name", "") or team_orm.name or "",
        logo_url=getattr(team_orm, "logo_url", None),
    )


async def run_verification_loop(
    engine: ContinuousMatchVerificationEngine,
    high_interval: tuple[float, float],
    low_interval: tuple[float, float],
    jitter: float,
) -> None:
    """Run continuous loop with jitter and per-match interval (high vs low demand)."""
    settings = engine._settings
    while True:
        try:
            matches = await engine.get_live_matches()
            if not matches:
                await asyncio.sleep(60)
                continue

            # High-demand: more subscribers or first N matches get shorter interval (handled by next run)
            interval_min, interval_max = high_interval if len(matches) <= 20 else low_interval
            base = random.uniform(interval_min, interval_max)
            j = base * jitter * (2 * random.random() - 1)
            delay = max(1.0, base + j)

            for snap in matches:
                try:
                    await engine.verify_one(snap)
                except Exception as e:
                    logger.exception("verify_one_error", match_id=str(snap.match_id), error=str(e))

            await asyncio.sleep(delay)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.exception("verification_loop_error", error=str(e))
            await asyncio.sleep(30)
