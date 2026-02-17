"""
Seed script for Live View.

Fetches today's matches from ESPN's free API across all supported sports/leagues,
creates the corresponding leagues, teams, and matches in the database,
and registers provider mappings so the scheduler can start polling.

Usage:
    docker compose exec api python -m seed
"""
from __future__ import annotations

import asyncio
import json
import sys
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select, text

from shared.config import get_settings
from shared.models.enums import MatchPhase, Sport
from shared.models.orm import (
    LeagueORM,
    MatchORM,
    MatchStateORM,
    ProviderMappingORM,
    SportORM,
    TeamORM,
)
from shared.utils.database import DatabaseManager
from shared.utils.logging import get_logger, setup_logging

logger = get_logger(__name__)

# ESPN league slugs mapped to our sport types
ESPN_LEAGUES: list[dict[str, str]] = [
    # Soccer
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.1", "name": "Premier League", "country": "England"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "usa.1", "name": "MLS", "country": "USA"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "esp.1", "name": "La Liga", "country": "Spain"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ger.1", "name": "Bundesliga", "country": "Germany"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ita.1", "name": "Serie A", "country": "Italy"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "fra.1", "name": "Ligue 1", "country": "France"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.champions", "name": "Champions League", "country": "Europe"},
    # Basketball
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "nba", "name": "NBA", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "wnba", "name": "WNBA", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "mens-college-basketball", "name": "NCAAM", "country": "USA"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "womens-college-basketball", "name": "NCAAW", "country": "USA"},
    # Hockey
    {"sport": "hockey", "espn_sport": "hockey", "espn_league": "nhl", "name": "NHL", "country": "USA"},
    # Baseball
    {"sport": "baseball", "espn_sport": "baseball", "espn_league": "mlb", "name": "MLB", "country": "USA"},
]

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"

# ESPN status -> our MatchPhase
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


async def fetch_espn_scoreboard(
    client: httpx.AsyncClient, espn_sport: str, espn_league: str
) -> dict[str, Any]:
    """Fetch the current scoreboard from ESPN."""
    url = f"{ESPN_BASE}/{espn_sport}/{espn_league}/scoreboard"
    try:
        resp = await client.get(url, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("espn_fetch_failed", league=espn_league, error=str(exc))
        return {}


async def seed() -> None:
    """Main seed function."""
    setup_logging("seed")
    settings = get_settings()
    db = DatabaseManager(settings)
    await db.connect()

    async with httpx.AsyncClient() as client:
        # Load sport IDs from DB
        async with db.read_session() as session:
            result = await session.execute(select(SportORM))
            sports_db = {s.sport_type: s.id for s in result.scalars().all()}

        print(f"\n{'='*60}")
        print(f"  Live View Seed — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"{'='*60}")
        print(f"  Sports in DB: {list(sports_db.keys())}")
        print()

        total_leagues = 0
        total_teams = 0
        total_matches = 0

        for league_cfg in ESPN_LEAGUES:
            sport_type = league_cfg["sport"]
            sport_id = sports_db.get(sport_type)
            if not sport_id:
                print(f"  ⚠ Sport '{sport_type}' not found in DB, skipping {league_cfg['name']}")
                continue

            data = await fetch_espn_scoreboard(
                client, league_cfg["espn_sport"], league_cfg["espn_league"]
            )
            events = data.get("events", [])

            if not events:
                print(f"  · {league_cfg['name']:25s} — no matches today")
                continue

            async with db.write_session() as session:
                # Upsert league
                league_id = await _upsert_league(
                    session, sport_id, league_cfg["name"],
                    league_cfg["country"], league_cfg["espn_league"],
                )
                total_leagues += 1

                match_count = 0
                for event in events:
                    try:
                        teams_created = await _process_event(
                            session, league_id, sport_id, sport_type,
                            league_cfg["espn_league"], event,
                        )
                        match_count += 1
                        total_teams += teams_created
                    except Exception as exc:
                        logger.warning(
                            "event_process_error",
                            event_id=event.get("id"),
                            error=str(exc),
                        )

                total_matches += match_count
                status_summary = _summarize_statuses(events)
                print(f"  ✓ {league_cfg['name']:25s} — {match_count} matches ({status_summary})")

        print()
        print(f"  Summary: {total_leagues} leagues, {total_teams} new teams, {total_matches} matches")
        print(f"{'='*60}")
        print()
        print("  The scheduler will now discover these matches and start polling.")
        print("  Watch logs: docker compose logs scheduler --tail 20 -f")
        print()

    await db.disconnect()


async def _upsert_league(
    session: Any,
    sport_id: uuid.UUID,
    name: str,
    country: str,
    espn_league_id: str,
) -> uuid.UUID:
    """Create or get an existing league. Returns league UUID."""
    # Check if exists
    stmt = select(LeagueORM).where(
        LeagueORM.sport_id == sport_id,
        LeagueORM.name == name,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        league_id = existing.id
    else:
        league_id = uuid.uuid4()
        session.add(LeagueORM(
            id=league_id,
            sport_id=sport_id,
            name=name,
            short_name=name,
            country=country,
        ))
        await session.flush()

    # Ensure provider mapping exists
    await _ensure_provider_mapping(session, "league", league_id, "espn", espn_league_id)
    return league_id


async def _upsert_team(
    session: Any,
    sport_id: uuid.UUID,
    espn_team: dict[str, Any],
) -> uuid.UUID:
    """Create or get a team from ESPN data. Returns team UUID."""
    espn_id = str(espn_team.get("id", ""))
    name = espn_team.get("displayName", espn_team.get("name", "Unknown"))
    short_name = espn_team.get("abbreviation", name[:3].upper())
    logo_url = ""
    logos = espn_team.get("logos", espn_team.get("logo", []))
    if isinstance(logos, list) and logos:
        logo_url = logos[0].get("href", "") if isinstance(logos[0], dict) else logos[0]
    elif isinstance(logos, str):
        logo_url = logos

    # Check if mapping already exists
    mapping_stmt = select(ProviderMappingORM.canonical_id).where(
        ProviderMappingORM.entity_type == "team",
        ProviderMappingORM.provider == "espn",
        ProviderMappingORM.provider_id == espn_id,
    )
    mapping_result = await session.execute(mapping_stmt)
    existing_id = mapping_result.scalar_one_or_none()

    if existing_id:
        return existing_id

    # Create new team
    team_id = uuid.uuid4()
    session.add(TeamORM(
        id=team_id,
        sport_id=sport_id,
        name=name,
        short_name=short_name,
        logo_url=logo_url,
    ))
    await session.flush()

    await _ensure_provider_mapping(session, "team", team_id, "espn", espn_id)
    return team_id


async def _process_event(
    session: Any,
    league_id: uuid.UUID,
    sport_id: uuid.UUID,
    sport_type: str,
    espn_league_id: str,
    event: dict[str, Any],
) -> int:
    """Process a single ESPN event into match + teams. Returns number of new teams created."""
    espn_event_id = str(event.get("id", ""))
    teams_created = 0

    # Extract competition
    competitions = event.get("competitions", [])
    if not competitions:
        return 0
    comp = competitions[0]

    # Extract teams
    competitors = comp.get("competitors", [])
    home_team_id = None
    away_team_id = None
    score_home = 0
    score_away = 0

    for competitor in competitors:
        team_data = competitor.get("team", {})
        if not team_data:
            continue

        # Check if team exists before creating
        mapping_stmt = select(ProviderMappingORM.canonical_id).where(
            ProviderMappingORM.entity_type == "team",
            ProviderMappingORM.provider == "espn",
            ProviderMappingORM.provider_id == str(team_data.get("id", "")),
        )
        existing = (await session.execute(mapping_stmt)).scalar_one_or_none()
        is_new = existing is None

        team_id = await _upsert_team(session, sport_id, team_data)
        if is_new:
            teams_created += 1

        home_away = competitor.get("homeAway", "")
        score_str = competitor.get("score", "0")
        try:
            score = int(score_str)
        except (ValueError, TypeError):
            score = 0

        if home_away == "home":
            home_team_id = team_id
            score_home = score
        else:
            away_team_id = team_id
            score_away = score

    if not home_team_id or not away_team_id:
        return teams_created

    # Parse status
    status_obj = comp.get("status", event.get("status", {}))
    status_type = status_obj.get("type", {})
    espn_status = status_type.get("name", "STATUS_SCHEDULED")
    phase = ESPN_STATUS_MAP.get(espn_status, MatchPhase.SCHEDULED)

    # Parse start time
    start_time_str = event.get("date", comp.get("date", ""))
    start_time = None
    if start_time_str:
        try:
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        except ValueError:
            start_time = datetime.now(timezone.utc)

    # Parse clock
    clock = status_obj.get("displayClock", None)

    # Parse venue
    venue_obj = comp.get("venue", {})
    venue = venue_obj.get("fullName", venue_obj.get("name", None)) if venue_obj else None

    # Check if match already exists
    mapping_stmt = select(ProviderMappingORM.canonical_id).where(
        ProviderMappingORM.entity_type == "match",
        ProviderMappingORM.provider == "espn",
        ProviderMappingORM.provider_id == espn_event_id,
    )
    existing_match_id = (await session.execute(mapping_stmt)).scalar_one_or_none()

    if existing_match_id:
        # Update existing match
        match_stmt = select(MatchORM).where(MatchORM.id == existing_match_id)
        match = (await session.execute(match_stmt)).scalar_one_or_none()
        if match:
            match.phase = phase.value
        # Update state
        state_stmt = select(MatchStateORM).where(MatchStateORM.match_id == existing_match_id)
        state = (await session.execute(state_stmt)).scalar_one_or_none()
        if state:
            state.score_home = score_home
            state.score_away = score_away
            state.clock = clock
            state.phase = phase.value
            state.version += 1
        return teams_created

    # Create new match
    match_id = uuid.uuid4()
    session.add(MatchORM(
        id=match_id,
        league_id=league_id,
        home_team_id=home_team_id,
        away_team_id=away_team_id,
        start_time=start_time,
        phase=phase.value,
        venue=venue,
    ))
    await session.flush()

    # Create match state
    session.add(MatchStateORM(
        match_id=match_id,
        score_home=score_home,
        score_away=score_away,
        clock=clock,
        phase=phase.value,
    ))
    await session.flush()

    # Provider mapping for the match
    await _ensure_provider_mapping(session, "match", match_id, "espn", espn_event_id)

    return teams_created


async def _ensure_provider_mapping(
    session: Any,
    entity_type: str,
    canonical_id: uuid.UUID,
    provider: str,
    provider_id: str,
) -> None:
    """Insert a provider mapping if it doesn't already exist."""
    stmt = select(ProviderMappingORM.id).where(
        ProviderMappingORM.entity_type == entity_type,
        ProviderMappingORM.provider == provider,
        ProviderMappingORM.provider_id == provider_id,
    )
    exists = (await session.execute(stmt)).scalar_one_or_none()
    if not exists:
        session.add(ProviderMappingORM(
            id=uuid.uuid4(),
            entity_type=entity_type,
            canonical_id=canonical_id,
            provider=provider,
            provider_id=provider_id,
        ))
        await session.flush()


def _summarize_statuses(events: list[dict[str, Any]]) -> str:
    """Summarize match statuses for display."""
    counts: dict[str, int] = {}
    for event in events:
        competitions = event.get("competitions", [])
        if not competitions:
            continue
        status = competitions[0].get("status", event.get("status", {}))
        status_name = status.get("type", {}).get("state", "unknown")
        counts[status_name] = counts.get(status_name, 0) + 1

    parts = []
    for state, count in sorted(counts.items()):
        label = {"in": "🟢 live", "pre": "⏳ upcoming", "post": "✅ final"}.get(state, state)
        parts.append(f"{count} {label}")
    return ", ".join(parts) if parts else "unknown"


if __name__ == "__main__":
    asyncio.run(seed())
