"""
Scheduler service for Live View.
Manages adaptive polling tasks for all active/live matches.
Uses leader election to ensure only one scheduler instance drives polls.
Publishes poll commands to the ingest service via Redis pub/sub.
Includes automatic schedule sync that discovers new matches from ESPN.
"""
from __future__ import annotations

import asyncio
import json
import signal
import time
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional

import httpx
from sqlalchemy import or_, select

from shared.config import Settings, get_settings
from shared.models.enums import MatchPhase, ProviderName, Sport, Tier
from shared.models.orm import (
    LeagueORM,
    MatchORM,
    MatchStateORM,
    ProviderMappingORM,
    SportORM,
    TeamORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.health_server import start_health_server
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import (
    LIVE_MATCHES,
    SCHEDULER_ACTIVE_TASKS,
    start_metrics_server,
)
from shared.utils.redis_manager import RedisManager

from ingest.providers.registry import HealthScorer
from scheduler.engine.polling import AdaptivePollingEngine

logger = get_logger(__name__)

POLL_COMMAND_CHANNEL = "ingest:poll_commands"

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"

ESPN_STATUS_MAP: dict[str, MatchPhase] = {
    "STATUS_SCHEDULED": MatchPhase.SCHEDULED,
    "STATUS_IN_PROGRESS": MatchPhase.LIVE_FIRST_HALF,
    "STATUS_HALFTIME": MatchPhase.LIVE_HALFTIME,
    "STATUS_END_PERIOD": MatchPhase.BREAK,
    "STATUS_FINAL": MatchPhase.FINISHED,
    "STATUS_FULL_TIME": MatchPhase.FINISHED,
    "STATUS_POSTPONED": MatchPhase.POSTPONED,
    "STATUS_CANCELED": MatchPhase.CANCELLED,
    "STATUS_DELAYED": MatchPhase.SUSPENDED,
    "STATUS_RAIN_DELAY": MatchPhase.SUSPENDED,
}

SCHEDULE_SYNC_LEAGUES: list[dict[str, str]] = [
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.1", "name": "Premier League", "country": "England"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "usa.1", "name": "MLS", "country": "USA"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "esp.1", "name": "La Liga", "country": "Spain"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ger.1", "name": "Bundesliga", "country": "Germany"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ita.1", "name": "Serie A", "country": "Italy"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "fra.1", "name": "Ligue 1", "country": "France"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.champions", "name": "Champions League", "country": "Europe"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.europa", "name": "Europa League", "country": "Europe"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.europa.conf", "name": "Conference League", "country": "Europe"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.2", "name": "Championship", "country": "England"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.fa", "name": "FA Cup", "country": "England"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.league_cup", "name": "EFL Cup", "country": "England"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ned.1", "name": "Eredivisie", "country": "Netherlands"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "por.1", "name": "Liga Portugal", "country": "Portugal"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "tur.1", "name": "Turkish Super Lig", "country": "Turkey"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "sco.1", "name": "Scottish Premiership", "country": "Scotland"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "sau.1", "name": "Saudi Pro League", "country": "Saudi Arabia"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "nba", "name": "NBA", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "wnba", "name": "WNBA", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "mens-college-basketball", "name": "NCAAM", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "womens-college-basketball", "name": "NCAAW", "country": "USA"},
    {"sport": "hockey", "espn_sport": "hockey", "espn_league": "nhl", "name": "NHL", "country": "USA"},
    {"sport": "baseball", "espn_sport": "baseball", "espn_league": "mlb", "name": "MLB", "country": "USA"},
    {"sport": "football", "espn_sport": "football", "espn_league": "nfl", "name": "NFL", "country": "USA"},
]

SCHEDULE_SYNC_INTERVAL_S = 4 * 3600  # 4 hours

# Phases that require active polling
ACTIVE_PHASES = [p.value for p in MatchPhase if p.is_live or p == MatchPhase.PRE_MATCH]
# Include recently finished matches for final score confirmation
RECENTLY_FINISHED_WINDOW = timedelta(minutes=15)


class MatchPollTask:
    """Represents an active polling task for a single match+tier combination."""

    def __init__(
        self,
        canonical_match_id: uuid.UUID,
        sport: Sport,
        tier: Tier,
        league_provider_id: str,
        match_provider_id: str,
        provider: ProviderName,
    ) -> None:
        self.canonical_match_id = canonical_match_id
        self.sport = sport
        self.tier = tier
        self.league_provider_id = league_provider_id
        self.match_provider_id = match_provider_id
        self.provider = provider
        self.phase: MatchPhase = MatchPhase.SCHEDULED
        self.next_poll_at: float = 0.0
        self.last_polled_at: float = 0.0
        self.consecutive_errors: int = 0
        self.task_handle: Optional[asyncio.Task[None]] = None


class SchedulerService:
    """
    Main scheduler that:
    1. Acquires leadership via Redis-based leader election
    2. Discovers active matches from the database
    3. Creates/destroys poll tasks dynamically
    4. Computes adaptive intervals per task
    5. Publishes poll commands to ingest service
    """

    def __init__(
        self,
        redis: RedisManager,
        db: DatabaseManager,
        polling_engine: AdaptivePollingEngine,
        health_scorer: HealthScorer,
        settings: Settings | None = None,
    ) -> None:
        self._redis = redis
        self._db = db
        self._polling = polling_engine
        self._health_scorer = health_scorer
        self._settings = settings or get_settings()
        self._instance_id = self._settings.instance_id or str(uuid.uuid4())[:8]
        self._tasks: dict[str, MatchPollTask] = {}  # key: f"{match_id}:{tier}"
        self._is_leader = False
        self._shutdown = asyncio.Event()

    def _task_key(self, match_id: uuid.UUID, tier: Tier) -> str:
        return f"{match_id}:{tier.value}"

    # ── Leader election ─────────────────────────────────────────────────

    async def _acquire_leadership(self) -> bool:
        """Attempt to acquire or renew scheduler leadership."""
        if self._is_leader:
            renewed = await self._redis.renew_leader(
                "scheduler", self._instance_id, self._settings.scheduler_leader_ttl_s
            )
            if not renewed:
                logger.warning("leadership_lost", instance_id=self._instance_id)
                self._is_leader = False
                await self._stop_all_tasks()
            return renewed

        acquired = await self._redis.try_acquire_leader(
            "scheduler", self._instance_id, self._settings.scheduler_leader_ttl_s
        )
        if acquired:
            self._is_leader = True
            logger.info("leadership_acquired", instance_id=self._instance_id)
        return acquired

    # ── Match discovery ─────────────────────────────────────────────────

    async def _discover_active_matches(self) -> list[dict[str, Any]]:
        """
        Query the database for matches that need active polling.
        Returns match metadata needed to create poll tasks.
        """
        now = datetime.now(timezone.utc)
        recently_finished_cutoff = now - RECENTLY_FINISHED_WINDOW

        async with self._db.read_session() as session:
            # Get all matches that are live, pre-match, or recently finished
            stmt = (
                select(
                    MatchORM.id,
                    MatchORM.phase,
                    MatchORM.start_time,
                    SportORM.sport_type,
                    LeagueORM.id.label("league_id"),
                )
                .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
                .join(SportORM, LeagueORM.sport_id == SportORM.id)
                .where(
                    or_(
                        MatchORM.phase.in_(ACTIVE_PHASES),
                        # Include matches starting within next 10 minutes
                        MatchORM.start_time.between(now - timedelta(minutes=5), now + timedelta(minutes=10)),
                        # Recently finished for final confirmation
                        (MatchORM.phase == MatchPhase.FINISHED.value)
                        & (MatchORM.updated_at >= recently_finished_cutoff),
                    )
                )
            )
            result = await session.execute(stmt)
            rows = result.all()

            matches: list[dict[str, Any]] = []
            for row in rows:
                # Resolve provider IDs for primary provider
                provider_mapping_stmt = select(
                    ProviderMappingORM.provider,
                    ProviderMappingORM.provider_id,
                ).where(
                    ProviderMappingORM.entity_type == "match",
                    ProviderMappingORM.canonical_id == row.id,
                )
                mappings = (await session.execute(provider_mapping_stmt)).all()

                # Also get league provider mapping
                league_mapping_stmt = select(
                    ProviderMappingORM.provider,
                    ProviderMappingORM.provider_id,
                ).where(
                    ProviderMappingORM.entity_type == "league",
                    ProviderMappingORM.canonical_id == row.league_id,
                )
                league_mappings = (await session.execute(league_mapping_stmt)).all()

                # Build provider ID lookup
                match_pids: dict[str, str] = {m.provider: m.provider_id for m in mappings}
                league_pids: dict[str, str] = {m.provider: m.provider_id for m in league_mappings}

                matches.append({
                    "canonical_match_id": row.id,
                    "phase": row.phase,
                    "sport": row.sport_type,
                    "match_provider_ids": match_pids,
                    "league_provider_ids": league_pids,
                })

            return matches

    # ── Task management ─────────────────────────────────────────────────

    async def _reconcile_tasks(self) -> None:
        """
        Synchronize poll tasks with currently active matches.
        Creates new tasks, updates existing, removes stale.
        """
        active_matches = await self._discover_active_matches()

        active_keys: set[str] = set()
        sport_counts: dict[str, int] = {}

        for match_data in active_matches:
            match_id = match_data["canonical_match_id"]
            sport = Sport(match_data["sport"])
            phase = MatchPhase(match_data["phase"])
            match_pids = match_data["match_provider_ids"]
            league_pids = match_data["league_provider_ids"]

            sport_counts[sport.value] = sport_counts.get(sport.value, 0) + 1

            # Determine which tiers need polling
            tiers_to_poll = [Tier.SCOREBOARD]
            if phase.is_live:
                tiers_to_poll.append(Tier.EVENTS)
                tiers_to_poll.append(Tier.STATS)

            for tier in tiers_to_poll:
                key = self._task_key(match_id, tier)
                active_keys.add(key)

                if key not in self._tasks:
                    # Pick a provider mapping for this tier
                    # Use the configured cascade order
                    provider = ProviderName.ESPN  # default
                    match_pid = ""
                    league_pid = ""
                    for pname in self._settings.provider_order:
                        if pname in match_pids:
                            provider = ProviderName(pname)
                            match_pid = match_pids[pname]
                            league_pid = league_pids.get(pname, "")
                            break

                    task = MatchPollTask(
                        canonical_match_id=match_id,
                        sport=sport,
                        tier=tier,
                        league_provider_id=league_pid,
                        match_provider_id=match_pid,
                        provider=provider,
                    )
                    task.phase = phase
                    self._tasks[key] = task

                    logger.info(
                        "poll_task_created",
                        match_id=str(match_id),
                        tier=tier.value,
                        sport=sport.value,
                        phase=phase.value,
                    )
                else:
                    # Update phase
                    self._tasks[key].phase = phase

        # Remove tasks for matches no longer active
        stale_keys = set(self._tasks.keys()) - active_keys
        for key in stale_keys:
            task = self._tasks.pop(key)
            if task.task_handle and not task.task_handle.done():
                task.task_handle.cancel()
            logger.info(
                "poll_task_removed",
                match_id=str(task.canonical_match_id),
                tier=task.tier.value,
            )

        SCHEDULER_ACTIVE_TASKS.set(len(self._tasks))
        for sport_val, count in sport_counts.items():
            LIVE_MATCHES.labels(sport=sport_val).set(count)

    async def _execute_poll_cycle(self) -> None:
        """
        Execute one scheduling tick: evaluate all tasks and dispatch polls for those that are due.
        """
        now = time.monotonic()

        for key, task in list(self._tasks.items()):
            if now < task.next_poll_at:
                continue

            # Compute next interval
            health = await self._health_scorer.compute_health(task.provider)
            quota_usage = await self._redis.get_quota_usage(task.provider.value)

            # Get quota limit based on provider
            quota_limits: dict[str, int] = {
                "sportradar": self._settings.sportradar_rpm_limit,
                "espn": self._settings.espn_rpm_limit,
                "thesportsdb": self._settings.thesportsdb_rpm_limit,
                "football_data": self._settings.football_data_rpm_limit,
            }
            quota_limit = quota_limits.get(task.provider.value, 1000)

            interval = await self._polling.compute_interval(
                match_id=str(task.canonical_match_id),
                sport=task.sport,
                phase=task.phase,
                tier=task.tier,
                provider_health_score=health.score,
                quota_usage=quota_usage,
                quota_limit=quota_limit,
            )

            task.next_poll_at = now + interval
            task.last_polled_at = now

            # Publish poll command to ingest
            command = {
                "canonical_match_id": str(task.canonical_match_id),
                "tier": task.tier.value,
                "sport": task.sport.value,
                "league_provider_id": task.league_provider_id,
                "match_provider_id": task.match_provider_id,
                "provider": task.provider.value,
                "timestamp": time.time(),
            }

            await self._redis.client.publish(
                POLL_COMMAND_CHANNEL,
                json.dumps(command),
            )

            logger.debug(
                "poll_command_dispatched",
                match_id=str(task.canonical_match_id),
                tier=task.tier.value,
                next_in=round(interval, 2),
            )

    async def _stop_all_tasks(self) -> None:
        """Cancel all active poll tasks."""
        for key, task in self._tasks.items():
            if task.task_handle and not task.task_handle.done():
                task.task_handle.cancel()
        self._tasks.clear()
        SCHEDULER_ACTIVE_TASKS.set(0)

    # ── Main loop ───────────────────────────────────────────────────────

    async def run(self) -> None:
        """
        Main scheduler loop.
        Runs leader election, match discovery, and poll dispatch in a tight loop.
        """
        reconcile_counter = 0
        reconcile_every_n = 10  # Reconcile every 10 ticks (~10s)

        while not self._shutdown.is_set():
            try:
                # Leader election
                is_leader = await self._acquire_leadership()
                if not is_leader:
                    await asyncio.sleep(self._settings.scheduler_leader_renew_s)
                    continue

                # Periodically reconcile tasks with DB
                reconcile_counter += 1
                if reconcile_counter >= reconcile_every_n:
                    await self._reconcile_tasks()
                    reconcile_counter = 0

                # Execute poll cycle
                await self._execute_poll_cycle()

                # Sleep for tick interval
                await asyncio.sleep(self._settings.scheduler_tick_interval_s)

            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("scheduler_loop_error", error=str(exc), exc_info=True)
                await asyncio.sleep(2.0)

        # Release leadership on shutdown for fast failover
        if self._is_leader:
            released = await self._redis.release_leader("scheduler", self._instance_id)
            if released:
                logger.info("scheduler_leader_released", instance_id=self._instance_id)
            self._is_leader = False
        await self._stop_all_tasks()

    def request_shutdown(self) -> None:
        self._shutdown.set()


class ScheduleSyncService:
    """
    Periodically discovers new matches from ESPN and upserts them into the database.
    Runs alongside the main scheduler so the DB always has upcoming matches.
    """

    def __init__(self, db: DatabaseManager, settings: Settings | None = None) -> None:
        self._db = db
        self._settings = settings or get_settings()
        self._shutdown = asyncio.Event()
        self._sports_cache: dict[str, uuid.UUID] = {}

    async def _load_sports(self) -> dict[str, uuid.UUID]:
        if self._sports_cache:
            return self._sports_cache
        async with self._db.read_session() as session:
            result = await session.execute(select(SportORM))
            self._sports_cache = {s.sport_type: s.id for s in result.scalars().all()}
        return self._sports_cache

    async def run(self) -> None:
        """Run the schedule sync loop: fetch today + tomorrow every SCHEDULE_SYNC_INTERVAL_S."""
        # Initial sync on startup (after a short delay to let DB connect settle)
        await asyncio.sleep(10)
        await self._sync_once()

        while not self._shutdown.is_set():
            try:
                await asyncio.sleep(SCHEDULE_SYNC_INTERVAL_S)
                if self._shutdown.is_set():
                    break
                await self._sync_once()
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("schedule_sync_error", error=str(exc), exc_info=True)
                await asyncio.sleep(60)

    async def _sync_once(self) -> None:
        """Fetch the next 7 days from ESPN for all leagues and upsert matches."""
        sports_db = await self._load_sports()
        today = datetime.now(timezone.utc).date()
        dates_to_sync = [today + timedelta(days=d) for d in range(7)]

        total_new = 0
        total_updated = 0

        async with httpx.AsyncClient() as client:
            for target_date in dates_to_sync:
                date_str = target_date.strftime("%Y%m%d")
                for league_cfg in SCHEDULE_SYNC_LEAGUES:
                    sport_id = sports_db.get(league_cfg["sport"])
                    if not sport_id:
                        continue
                    try:
                        new, updated = await self._sync_league_date(
                            client, league_cfg, sport_id, date_str,
                        )
                        total_new += new
                        total_updated += updated
                    except Exception as exc:
                        logger.warning(
                            "schedule_sync_league_error",
                            league=league_cfg["name"],
                            date=date_str,
                            error=str(exc),
                        )

        logger.info(
            "schedule_sync_completed",
            new_matches=total_new,
            updated_matches=total_updated,
            dates=[d.isoformat() for d in dates_to_sync],
        )

    async def _sync_league_date(
        self,
        client: httpx.AsyncClient,
        league_cfg: dict[str, str],
        sport_id: uuid.UUID,
        date_str: str,
    ) -> tuple[int, int]:
        """Sync a single league for a single date. Returns (new, updated) counts."""
        url = f"{ESPN_BASE}/{league_cfg['espn_sport']}/{league_cfg['espn_league']}/scoreboard"
        resp = await client.get(url, params={"dates": date_str}, timeout=15.0)
        resp.raise_for_status()
        data = resp.json()
        events = data.get("events", [])
        if not events:
            return 0, 0

        new_count = 0
        updated_count = 0

        async with self._db.write_session() as session:
            # Ensure league exists
            league_id = await self._upsert_league(
                session, sport_id, league_cfg["name"],
                league_cfg["country"], league_cfg["espn_league"],
            )

            for event in events:
                try:
                    is_new = await self._upsert_match_from_event(
                        session, league_id, sport_id, league_cfg["espn_league"], event,
                    )
                    if is_new:
                        new_count += 1
                    else:
                        updated_count += 1
                except Exception as exc:
                    logger.debug(
                        "schedule_sync_event_error",
                        event_id=event.get("id"),
                        error=str(exc),
                    )

        return new_count, updated_count

    async def _upsert_league(
        self, session: Any, sport_id: uuid.UUID, name: str, country: str,
        espn_league_id: str,
    ) -> uuid.UUID:
        stmt = select(LeagueORM).where(LeagueORM.sport_id == sport_id, LeagueORM.name == name)
        result = await session.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            league_id = existing.id
        else:
            league_id = uuid.uuid4()
            session.add(LeagueORM(
                id=league_id, sport_id=sport_id, name=name,
                short_name=name, country=country,
            ))
            await session.flush()

        # Ensure provider mapping
        mapping_stmt = select(ProviderMappingORM.id).where(
            ProviderMappingORM.entity_type == "league",
            ProviderMappingORM.provider == "espn",
            ProviderMappingORM.provider_id == espn_league_id,
        )
        if not (await session.execute(mapping_stmt)).scalar_one_or_none():
            session.add(ProviderMappingORM(
                id=uuid.uuid4(), entity_type="league",
                canonical_id=league_id, provider="espn",
                provider_id=espn_league_id,
            ))
            await session.flush()
        return league_id

    async def _upsert_team(
        self, session: Any, sport_id: uuid.UUID, team_data: dict[str, Any],
        espn_league: str = "",
    ) -> uuid.UUID:
        raw_id = str(team_data.get("id", ""))
        scoped_id = f"{espn_league}:{raw_id}" if espn_league else raw_id
        mapping_stmt = select(ProviderMappingORM.canonical_id).where(
            ProviderMappingORM.entity_type == "team",
            ProviderMappingORM.provider == "espn",
            ProviderMappingORM.provider_id == scoped_id,
        )
        existing_id = (await session.execute(mapping_stmt)).scalar_one_or_none()
        if existing_id:
            return existing_id

        name = team_data.get("displayName", team_data.get("name", "Unknown"))
        short_name = team_data.get("abbreviation", name[:3].upper())
        logo_url = ""
        logo_field = team_data.get("logo")
        logos_field = team_data.get("logos")
        if isinstance(logo_field, str) and logo_field:
            logo_url = logo_field
        elif isinstance(logos_field, list) and logos_field:
            logo_url = logos_field[0].get("href", "") if isinstance(logos_field[0], dict) else str(logos_field[0])
        elif isinstance(logos_field, str) and logos_field:
            logo_url = logos_field

        team_id = uuid.uuid4()
        session.add(TeamORM(
            id=team_id, sport_id=sport_id, name=name,
            short_name=short_name, logo_url=logo_url,
        ))
        await session.flush()
        session.add(ProviderMappingORM(
            id=uuid.uuid4(), entity_type="team",
            canonical_id=team_id, provider="espn", provider_id=scoped_id,
        ))
        await session.flush()
        return team_id

    async def _upsert_match_from_event(
        self, session: Any, league_id: uuid.UUID, sport_id: uuid.UUID,
        espn_league_id: str, event: dict[str, Any],
    ) -> bool:
        """Upsert a match from an ESPN event. Returns True if newly created."""
        espn_event_id = str(event.get("id", ""))
        competitions = event.get("competitions", [])
        if not competitions:
            return False
        comp = competitions[0]

        competitors = comp.get("competitors", [])
        home_team_id = away_team_id = None
        score_home = score_away = 0
        aggregate_home: int | None = None
        aggregate_away: int | None = None

        for competitor in competitors:
            td = competitor.get("team", {})
            if not td:
                continue
            team_id = await self._upsert_team(session, sport_id, td, espn_league_id)
            score = 0
            try:
                score = int(competitor.get("score", "0"))
            except (ValueError, TypeError):
                pass
            try:
                agg = int(competitor.get("aggregateScore", 0))
            except (ValueError, TypeError):
                agg = 0
            if competitor.get("homeAway") == "home":
                home_team_id, score_home = team_id, score
                if "aggregateScore" in competitor:
                    aggregate_home = agg
            else:
                away_team_id, score_away = team_id, score
                if "aggregateScore" in competitor:
                    aggregate_away = agg

        if not home_team_id or not away_team_id:
            return False

        status_obj = comp.get("status", event.get("status", {}))
        espn_status = status_obj.get("type", {}).get("name", "STATUS_SCHEDULED")
        phase = ESPN_STATUS_MAP.get(espn_status, MatchPhase.SCHEDULED)

        start_str = event.get("date", comp.get("date", ""))
        try:
            start_time = datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            start_time = datetime.now(timezone.utc)

        clock = status_obj.get("displayClock")
        venue_obj = comp.get("venue", {})
        venue = venue_obj.get("fullName", venue_obj.get("name")) if venue_obj else None

        # Check if match exists
        mapping_stmt = select(ProviderMappingORM.canonical_id).where(
            ProviderMappingORM.entity_type == "match",
            ProviderMappingORM.provider == "espn",
            ProviderMappingORM.provider_id == espn_event_id,
        )
        existing_match_id = (await session.execute(mapping_stmt)).scalar_one_or_none()

        if existing_match_id:
            match_obj = (await session.execute(
                select(MatchORM).where(MatchORM.id == existing_match_id)
            )).scalar_one_or_none()
            if match_obj:
                match_obj.phase = phase.value
            state_obj = (await session.execute(
                select(MatchStateORM).where(MatchStateORM.match_id == existing_match_id)
            )).scalar_one_or_none()
            if state_obj:
                state_obj.score_home = score_home
                state_obj.score_away = score_away
                state_obj.clock = clock
                state_obj.phase = phase.value
                state_obj.version += 1
                extra = dict(state_obj.extra_data or {})
                if aggregate_home is not None and aggregate_away is not None:
                    extra["aggregate_home"] = aggregate_home
                    extra["aggregate_away"] = aggregate_away
                else:
                    extra.pop("aggregate_home", None)
                    extra.pop("aggregate_away", None)
                state_obj.extra_data = extra
            return False

        match_id = uuid.uuid4()
        extra_data: dict[str, Any] = {}
        if aggregate_home is not None and aggregate_away is not None:
            extra_data["aggregate_home"] = aggregate_home
            extra_data["aggregate_away"] = aggregate_away
        session.add(MatchORM(
            id=match_id, league_id=league_id, home_team_id=home_team_id,
            away_team_id=away_team_id, start_time=start_time,
            phase=phase.value, venue=venue,
        ))
        await session.flush()
        session.add(MatchStateORM(
            match_id=match_id, score_home=score_home, score_away=score_away,
            clock=clock, phase=phase.value, extra_data=extra_data,
        ))
        await session.flush()
        session.add(ProviderMappingORM(
            id=uuid.uuid4(), entity_type="match",
            canonical_id=match_id, provider="espn", provider_id=espn_event_id,
        ))
        await session.flush()
        return True

    def request_shutdown(self) -> None:
        self._shutdown.set()


async def main() -> None:
    """Scheduler service entrypoint."""
    settings = get_settings()
    setup_logging("scheduler")
    start_metrics_server(9092)
    start_health_server("scheduler")

    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await redis.connect()
    await db.connect()

    polling_engine = AdaptivePollingEngine(redis, settings)
    health_scorer = HealthScorer(redis, settings)

    service = SchedulerService(redis, db, polling_engine, health_scorer, settings)
    sync_service = ScheduleSyncService(db, settings)

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        def shutdown_all(s=sig):
            service.request_shutdown()
            sync_service.request_shutdown()
        loop.add_signal_handler(sig, shutdown_all)

    logger.info(
        "scheduler_service_started",
        instance_id=settings.instance_id,
        db=settings.database_url_safe_log,
    )

    sync_task = asyncio.create_task(sync_service.run())

    try:
        await service.run()
    finally:
        sync_service.request_shutdown()
        sync_task.cancel()
        try:
            await sync_task
        except asyncio.CancelledError:
            pass
        await service._stop_all_tasks()
        await db.disconnect()
        await redis.disconnect()
        logger.info("scheduler_service_stopped")


if __name__ == "__main__":
    asyncio.run(main())
