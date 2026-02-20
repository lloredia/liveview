"""
FastAPI application factory for the Live View API service.

Creates the app with:
- REST routes (leagues, matches)
- WebSocket endpoint
- Middleware stack
- Health check endpoints
- Lifespan management (startup/shutdown)
- Background phase-sync task (auto-updates match phases)
- Background live-score refresh (fetches scores from ESPN every 30s)
"""
from __future__ import annotations

import asyncio
import signal
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import httpx
from fastapi import FastAPI, WebSocket
from sqlalchemy import or_, select, text

from shared.config import get_settings
from shared.models.enums import MatchPhase
from shared.models.orm import (
    LeagueORM,
    MatchORM,
    MatchStateORM,
    MatchStatsORM,
    ProviderMappingORM,
    SportORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging
from shared.utils.metrics import start_metrics_server
from shared.utils.redis_manager import RedisManager

from api.dependencies import get_db, get_redis, init_dependencies
from api.middleware import setup_middleware
from api.routes.leagues import router as leagues_router
from shared.utils.circuit_breaker import CircuitBreaker, CircuitBreakerOpen
from api.routes.matches import router as matches_router
from api.routes.today import router as today_router
from api.ws.manager import WebSocketManager

logger = get_logger(__name__)

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
LIVE_REFRESH_INTERVAL_S = 30

ESPN_STATUS_TO_PHASE: dict[str, MatchPhase] = {
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

BASKETBALL_QUARTER_PHASE = {
    1: MatchPhase.LIVE_Q1, 2: MatchPhase.LIVE_Q2,
    3: MatchPhase.LIVE_Q3, 4: MatchPhase.LIVE_Q4,
}
HOCKEY_PERIOD_PHASE = {
    1: MatchPhase.LIVE_P1, 2: MatchPhase.LIVE_P2, 3: MatchPhase.LIVE_P3,
}

ESPN_LEAGUE_SPORT: dict[str, str] = {
    "eng.1": "soccer", "eng.2": "soccer", "eng.fa": "soccer",
    "eng.league_cup": "soccer", "usa.1": "soccer", "esp.1": "soccer",
    "ger.1": "soccer", "ita.1": "soccer", "fra.1": "soccer",
    "ned.1": "soccer", "por.1": "soccer", "tur.1": "soccer",
    "sco.1": "soccer", "sau.1": "soccer",
    "uefa.champions": "soccer", "uefa.europa": "soccer",
    "uefa.europa.conf": "soccer",
    "nba": "basketball", "wnba": "basketball",
    "mens-college-basketball": "basketball",
    "womens-college-basketball": "basketball",
    "nhl": "hockey", "mlb": "baseball",
}

ESPN_STAT_NAME_MAP: dict[str, str] = {
    "rebounds": "rebounds", "assists": "assists",
    "fieldGoalPct": "field_goal_pct", "threePointFieldGoalPct": "three_point_pct",
    "freeThrowPct": "free_throw_pct",
    "fieldGoalsMade": "field_goals_made", "fieldGoalsAttempted": "field_goals_attempted",
    "threePointFieldGoalsMade": "three_point_made",
    "threePointFieldGoalsAttempted": "three_point_attempted",
    "freeThrowsMade": "free_throws_made", "freeThrowsAttempted": "free_throws_attempted",
    "turnovers": "turnovers", "steals": "steals", "blocks": "blocks",
}

SPORT_LEAGUE_ESPN_PATHS: dict[str, str] = {
    "eng.1": "soccer/eng.1",
    "eng.2": "soccer/eng.2",
    "eng.fa": "soccer/eng.fa",
    "eng.league_cup": "soccer/eng.league_cup",
    "usa.1": "soccer/usa.1",
    "esp.1": "soccer/esp.1",
    "ger.1": "soccer/ger.1",
    "ita.1": "soccer/ita.1",
    "fra.1": "soccer/fra.1",
    "ned.1": "soccer/ned.1",
    "por.1": "soccer/por.1",
    "tur.1": "soccer/tur.1",
    "sco.1": "soccer/sco.1",
    "sau.1": "soccer/sau.1",
    "uefa.champions": "soccer/uefa.champions",
    "uefa.europa": "soccer/uefa.europa",
    "uefa.europa.conf": "soccer/uefa.europa.conf",
    "nba": "basketball/nba",
    "wnba": "basketball/wnba",
    "mens-college-basketball": "basketball/mens-college-basketball",
    "womens-college-basketball": "basketball/womens-college-basketball",
    "nhl": "hockey/nhl",
    "mlb": "baseball/mlb",
}

# Module-level reference for the WS manager (accessed by the ws endpoint)
_ws_manager: WebSocketManager | None = None

espn_circuit_breaker = CircuitBreaker(
    name="espn_api",
    failure_threshold=5,
    recovery_timeout_s=120.0,
    half_open_max=1,
)


async def live_score_refresh_loop(db: DatabaseManager, redis: RedisManager) -> None:
    """
    Background task that fetches live scores from ESPN every 30s.
    Discovers which leagues have live/recently-started matches,
    hits ESPN's scoreboard API, and updates scores + clock + phase in the DB.
    Uses a circuit breaker to avoid hammering ESPN when it's unresponsive.
    """
    await asyncio.sleep(5)  # let startup settle
    logger.info("live_score_refresh_started")

    async with httpx.AsyncClient(timeout=12.0) as client:
        while True:
            try:
                await asyncio.sleep(LIVE_REFRESH_INTERVAL_S)
                await espn_circuit_breaker.call(_refresh_live_scores, db, redis, client)
            except asyncio.CancelledError:
                logger.info("live_score_refresh_stopped")
                break
            except CircuitBreakerOpen as exc:
                logger.warning("espn_circuit_open", retry_after=exc.retry_after)
                await asyncio.sleep(min(exc.retry_after, 30))
            except Exception as exc:
                logger.error("live_score_refresh_error", error=str(exc), exc_info=True)
                await asyncio.sleep(10)


async def _refresh_live_scores(
    db: DatabaseManager, redis: RedisManager, client: httpx.AsyncClient,
) -> None:
    """One cycle of live score refresh."""
    # Find leagues that have live or recently-started matches
    async with db.read_session() as session:
        live_phases = [p.value for p in MatchPhase if p.is_live]
        live_phases.append(MatchPhase.BREAK.value)
        live_phases.append(MatchPhase.PRE_MATCH.value)
        live_phases.append(MatchPhase.SCHEDULED.value)

        stmt = (
            select(
                ProviderMappingORM.provider_id.label("espn_league_id"),
            )
            .select_from(MatchORM)
            .join(LeagueORM, MatchORM.league_id == LeagueORM.id)
            .join(
                ProviderMappingORM,
                (ProviderMappingORM.entity_type == "league")
                & (ProviderMappingORM.canonical_id == LeagueORM.id)
                & (ProviderMappingORM.provider == "espn"),
            )
            .where(MatchORM.phase.in_(live_phases))
            .distinct()
        )
        result = await session.execute(stmt)
        league_ids = [row.espn_league_id for row in result.all()]

    if not league_ids:
        return

    updated = 0
    for espn_league_id in league_ids:
        path = SPORT_LEAGUE_ESPN_PATHS.get(espn_league_id)
        if not path:
            continue
        try:
            url = f"{ESPN_BASE}/{path}/scoreboard"
            resp = await client.get(url, timeout=10.0)
            resp.raise_for_status()
            data = resp.json()
            events = data.get("events", [])
            sport = ESPN_LEAGUE_SPORT.get(espn_league_id, "soccer")
            updated += await _apply_espn_events(db, events, sport)
        except Exception as exc:
            logger.debug("live_refresh_league_error", league=espn_league_id, error=str(exc))

    if updated > 0:
        logger.info("live_scores_refreshed", matches_updated=updated)
        # Invalidate today cache so next poll gets fresh data
        today_key = f"today:{__import__('datetime').datetime.now(__import__('datetime').timezone.utc).date().isoformat()}"
        try:
            await redis.client.delete(today_key)
        except Exception:
            pass


def _resolve_phase(espn_status: str, period_num: int, sport: str) -> MatchPhase:
    """Map ESPN status + period + sport to the correct MatchPhase."""
    if espn_status in ("STATUS_FINAL", "STATUS_FULL_TIME"):
        return MatchPhase.FINISHED
    if espn_status == "STATUS_SCHEDULED":
        return MatchPhase.SCHEDULED
    if espn_status in ("STATUS_POSTPONED",):
        return MatchPhase.POSTPONED
    if espn_status in ("STATUS_CANCELED",):
        return MatchPhase.CANCELLED
    if espn_status in ("STATUS_DELAYED", "STATUS_RAIN_DELAY"):
        return MatchPhase.SUSPENDED
    if espn_status == "STATUS_HALFTIME":
        return MatchPhase.LIVE_HALFTIME
    if espn_status == "STATUS_END_PERIOD":
        return MatchPhase.BREAK

    # STATUS_IN_PROGRESS — use sport + period for specificity
    if sport == "basketball":
        if period_num > 4:
            return MatchPhase.LIVE_OT
        return BASKETBALL_QUARTER_PHASE.get(period_num, MatchPhase.LIVE_Q1)
    if sport == "hockey":
        if period_num > 3:
            return MatchPhase.LIVE_OT
        return HOCKEY_PERIOD_PHASE.get(period_num, MatchPhase.LIVE_P1)
    if sport == "baseball":
        return MatchPhase.LIVE_INNING
    # Soccer
    if period_num == 1:
        return MatchPhase.LIVE_FIRST_HALF
    if period_num == 2:
        return MatchPhase.LIVE_SECOND_HALF
    if period_num == 3:
        return MatchPhase.LIVE_EXTRA_TIME
    return MatchPhase.LIVE_FIRST_HALF


def _extract_team_stats(competitor: dict[str, Any]) -> dict[str, Any]:
    """Extract team stats from an ESPN competitor object into a flat dict."""
    raw_stats = competitor.get("statistics", [])
    stats: dict[str, Any] = {}
    for stat in raw_stats:
        name = stat.get("name", "")
        mapped = ESPN_STAT_NAME_MAP.get(name)
        if mapped:
            val = stat.get("displayValue", stat.get("value"))
            try:
                stats[mapped] = float(val) if val is not None else None
            except (ValueError, TypeError):
                stats[mapped] = val

    linescores = competitor.get("linescores", [])
    if linescores:
        stats["period_scores"] = [
            {"period": ls.get("period"), "score": ls.get("displayValue")}
            for ls in linescores
        ]

    return stats


async def _apply_espn_events(db: DatabaseManager, events: list[dict[str, Any]], sport: str = "soccer") -> int:
    """Apply ESPN scoreboard events to our database. Returns count of updated matches."""
    if not events:
        return 0

    count = 0
    async with db.write_session() as session:
        for event in events:
            espn_id = str(event.get("id", ""))
            if not espn_id:
                continue

            mapping_stmt = select(ProviderMappingORM.canonical_id).where(
                ProviderMappingORM.entity_type == "match",
                ProviderMappingORM.provider == "espn",
                ProviderMappingORM.provider_id == espn_id,
            )
            match_id = (await session.execute(mapping_stmt)).scalar_one_or_none()
            if not match_id:
                continue

            comp = event.get("competitions", [{}])[0]
            competitors = comp.get("competitors", [])

            score_home = 0
            score_away = 0
            home_stats: dict[str, Any] = {}
            away_stats: dict[str, Any] = {}

            for c in competitors:
                try:
                    sc = int(c.get("score", "0"))
                except (ValueError, TypeError):
                    sc = 0
                if c.get("homeAway") == "home":
                    score_home = sc
                    home_stats = _extract_team_stats(c)
                else:
                    score_away = sc
                    away_stats = _extract_team_stats(c)

            status_obj = comp.get("status", event.get("status", {}))
            espn_status = status_obj.get("type", {}).get("name", "STATUS_SCHEDULED")
            period_num = status_obj.get("period", 0)
            phase = _resolve_phase(espn_status, period_num, sport)
            clock = status_obj.get("displayClock")

            # Update match phase
            match_obj = (await session.execute(
                select(MatchORM).where(MatchORM.id == match_id)
            )).scalar_one_or_none()
            if match_obj:
                match_obj.phase = phase.value

            # Update match state (scores, clock, period)
            state_obj = (await session.execute(
                select(MatchStateORM).where(MatchStateORM.match_id == match_id)
            )).scalar_one_or_none()
            if state_obj:
                changed = (
                    state_obj.score_home != score_home
                    or state_obj.score_away != score_away
                    or state_obj.clock != clock
                    or state_obj.phase != phase.value
                )
                if changed:
                    state_obj.score_home = score_home
                    state_obj.score_away = score_away
                    state_obj.clock = clock
                    state_obj.phase = phase.value
                    state_obj.period = str(period_num) if period_num else state_obj.period
                    state_obj.version = (state_obj.version or 0) + 1
                    count += 1

            # Upsert team statistics
            if home_stats or away_stats:
                stats_obj = (await session.execute(
                    select(MatchStatsORM).where(MatchStatsORM.match_id == match_id)
                )).scalar_one_or_none()

                if stats_obj:
                    stats_obj.home_stats = home_stats
                    stats_obj.away_stats = away_stats
                    stats_obj.version = (stats_obj.version or 0) + 1
                else:
                    import uuid as _uuid
                    session.add(MatchStatsORM(
                        id=_uuid.uuid4(),
                        match_id=match_id,
                        home_stats=home_stats,
                        away_stats=away_stats,
                        version=1,
                        seq=0,
                    ))

    return count


async def phase_sync_loop(db: DatabaseManager) -> None:
    """
    Background task that periodically syncs match phases.

    Runs every 60 seconds and:
    1. Marks matches as 'live' if their start_time has passed (within 3 hours).
    2. Marks matches as 'finished' if they started 3+ hours ago and are still
       'scheduled' or 'live'.
    3. Syncs match_state.phase to match matches.phase.
    """
    while True:
        try:
            await asyncio.sleep(60)

            async with db.write_session() as session:
                scheduled = MatchPhase.SCHEDULED.value
                live_first_half = MatchPhase.LIVE_FIRST_HALF.value
                finished = MatchPhase.FINISHED.value

                # 1. Auto-live: matches whose start_time has passed (within 3 hours)
                kickoff_result = await session.execute(text("""
                    UPDATE matches
                    SET phase = :live_phase
                    WHERE phase = :scheduled
                      AND start_time <= NOW()
                      AND start_time > NOW() - INTERVAL '3 hours'
                    RETURNING id
                """), {"live_phase": live_first_half, "scheduled": scheduled})
                kickoff_ids = [str(row[0]) for row in kickoff_result.fetchall()]

                # 2. Auto-live: matches with scores > 0 still marked scheduled
                score_result = await session.execute(text("""
                    UPDATE matches
                    SET phase = :live_phase
                    WHERE phase = :scheduled
                      AND start_time <= NOW()
                      AND id IN (
                          SELECT match_id FROM match_state
                          WHERE score_home + score_away > 0
                      )
                    RETURNING id
                """), {"live_phase": live_first_half, "scheduled": scheduled})
                score_ids = [str(row[0]) for row in score_result.fetchall()]

                # 3. Auto-finish: matches started 3+ hours ago still not finished
                finished_result = await session.execute(text("""
                    UPDATE matches
                    SET phase = :finished
                    WHERE (phase = :scheduled OR phase LIKE 'live_%' OR phase = 'break')
                      AND start_time < NOW() - INTERVAL '3 hours'
                    RETURNING id
                """), {"finished": finished, "scheduled": scheduled})
                finished_ids = [str(row[0]) for row in finished_result.fetchall()]

                # 4. Sync match_state.phase to match matches.phase
                await session.execute(text("""
                    UPDATE match_state ms
                    SET phase = m.phase
                    FROM matches m
                    WHERE ms.match_id = m.id
                      AND ms.phase != m.phase
                """))

                # write_session auto-commits

                total_updated = len(finished_ids) + len(kickoff_ids) + len(score_ids)
                if total_updated > 0:
                    logger.info(
                        "phase_sync_completed",
                        finished=len(finished_ids),
                        live_kickoff=len(kickoff_ids),
                        live_score=len(score_ids),
                    )

        except asyncio.CancelledError:
            logger.info("phase_sync_stopped")
            break
        except Exception as exc:
            logger.error("phase_sync_error", error=str(exc), exc_info=True)
            await asyncio.sleep(10)


# Retry connection on startup (e.g. Redis/DB not ready yet on Railway)
_CONNECT_RETRY_ATTEMPTS = 10
_CONNECT_RETRY_BASE_DELAY_S = 2.0


async def _connect_with_retry(connect_fn, name: str) -> None:
    """Call async connect_fn(); retry with exponential backoff on failure."""
    last_exc: Exception | None = None
    for attempt in range(1, _CONNECT_RETRY_ATTEMPTS + 1):
        try:
            await connect_fn()
            return
        except Exception as exc:
            last_exc = exc
            if attempt == _CONNECT_RETRY_ATTEMPTS:
                raise
            delay = _CONNECT_RETRY_BASE_DELAY_S * (2 ** (attempt - 1))
            logger.warning(
                "connect_retry",
                name=name,
                attempt=attempt,
                max_attempts=_CONNECT_RETRY_ATTEMPTS,
                delay_s=delay,
                error=str(exc),
            )
            await asyncio.sleep(delay)
    if last_exc:
        raise last_exc


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Handles startup (connect to Redis/Postgres, start WS manager) and
    shutdown (graceful cleanup).
    """
    global _ws_manager

    settings = get_settings()
    setup_logging("api")
    start_metrics_server(9090)

    # Initialize infrastructure (retry so healthcheck can pass once ready)
    redis = RedisManager(settings)
    db = DatabaseManager(settings)

    await _connect_with_retry(redis.connect, "Redis")
    await _connect_with_retry(db.connect, "Database")

    # Initialize dependency injection
    init_dependencies(redis, db)

    # Start WebSocket manager
    _ws_manager = WebSocketManager(redis, settings)
    await _ws_manager.start()

    # Start background phase sync
    phase_sync_task = asyncio.create_task(phase_sync_loop(db))

    # Start live score refresh (fetches from ESPN every 30s)
    live_refresh_task = asyncio.create_task(live_score_refresh_loop(db, redis))

    logger.info(
        "api_service_started",
        host=settings.api_host,
        port=settings.api_port,
    )

    yield

    # Shutdown
    phase_sync_task.cancel()
    live_refresh_task.cancel()
    try:
        await phase_sync_task
    except asyncio.CancelledError:
        pass
    try:
        await live_refresh_task
    except asyncio.CancelledError:
        pass

    if _ws_manager:
        await _ws_manager.stop()
    await db.disconnect()
    await redis.disconnect()
    logger.info("api_service_stopped")


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    settings = get_settings()

    app = FastAPI(
        title="Live View API",
        description="Real-time sports tracking platform",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    # Middleware
    setup_middleware(app)

    # REST routes
    app.include_router(leagues_router)
    app.include_router(matches_router)
    app.include_router(today_router)

    # Health check
    @app.get("/health", tags=["system"])
    async def health() -> dict[str, str]:
        return {"status": "ok", "service": "api"}

    @app.get("/ready", tags=["system"])
    async def readiness() -> dict[str, str | bool]:
        """Readiness probe — checks downstream dependencies."""
        redis = get_redis()
        db = get_db()

        redis_ok = False
        db_ok = False

        try:
            await redis.client.ping()
            redis_ok = True
        except Exception:
            pass

        try:
            async with db.read_session() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception:
            pass

        status = "ok" if (redis_ok and db_ok) else "degraded"
        return {
            "status": status,
            "redis": redis_ok,
            "database": db_ok,
        }

    @app.get("/v1/status", tags=["system"])
    async def system_status() -> dict[str, Any]:
        """Public status endpoint showing service health and provider status."""
        redis = get_redis()
        db = get_db()

        redis_ok = False
        db_ok = False
        try:
            await redis.client.ping()
            redis_ok = True
        except Exception:
            pass
        try:
            async with db.read_session() as session:
                await session.execute(text("SELECT 1"))
                db_ok = True
        except Exception:
            pass

        return {
            "status": "ok" if (redis_ok and db_ok) else "degraded",
            "services": {
                "redis": redis_ok,
                "database": db_ok,
            },
            "providers": {
                "espn": espn_circuit_breaker.stats,
            },
        }

    # WebSocket endpoint
    @app.websocket("/v1/ws")
    async def websocket_endpoint(ws: WebSocket) -> None:
        """
        WebSocket endpoint for real-time match updates.

        Client operations:
        - subscribe: {"op": "subscribe", "match_id": "...", "tiers": [0, 1]}
        - unsubscribe: {"op": "unsubscribe", "match_id": "..."}
        - ping: {"op": "ping"}

        Server messages:
        - snapshot: Full state replay on subscribe
        - delta: Incremental update from live match
        - pong: Response to ping
        - error: Error notification
        - state: Connection state update
        """
        if _ws_manager is None:
            await ws.close(code=1013, reason="service_unavailable")
            return
        await _ws_manager.handle_connection(ws)

    return app


# For running with uvicorn directly
app = create_app()