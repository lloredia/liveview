"""
Seed script for Live View.

Fetches matches from ESPN's free API across all supported sports/leagues,
creates the corresponding leagues, teams, and matches in the database,
and registers provider mappings so the scheduler can start polling.

Usage:
    python seed.py                    # Seed today only
    python seed.py --days-ahead 3      # Seed today + next 3 days
    python seed.py --days-back 7      # Seed last 7 days (backfill past games)
    python seed.py --date 2026-02-20  # Seed a specific date
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid
from datetime import date, datetime, timedelta, timezone
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
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.1", "name": "Premier League", "country": "England",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "usa.1", "name": "MLS", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "esp.1", "name": "La Liga", "country": "Spain",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ger.1", "name": "Bundesliga", "country": "Germany",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ita.1", "name": "Serie A", "country": "Italy",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "fra.1", "name": "Ligue 1", "country": "France",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.champions", "name": "Champions League", "country": "Europe",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.europa", "name": "Europa League", "country": "Europe",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "uefa.europa.conf", "name": "Conference League", "country": "Europe",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/20001.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.2", "name": "Championship", "country": "England",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/24.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.fa", "name": "FA Cup", "country": "England",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/34.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "eng.league_cup", "name": "EFL Cup", "country": "England",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/35.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "ned.1", "name": "Eredivisie", "country": "Netherlands",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/11.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "por.1", "name": "Liga Portugal", "country": "Portugal",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/14.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "tur.1", "name": "Turkish Super Lig", "country": "Turkey",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/18.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "sco.1", "name": "Scottish Premiership", "country": "Scotland",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/29.png"},
    {"sport": "soccer", "espn_sport": "soccer", "espn_league": "sau.1", "name": "Saudi Pro League", "country": "Saudi Arabia",
     "logo_url": "https://a.espncdn.com/i/leaguelogos/soccer/500/2369.png"},
    # Basketball
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "nba", "name": "NBA", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "wnba", "name": "WNBA", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "mens-college-basketball", "name": "NCAAM", "country": "USA",
     "logo_url": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png"},
    {"sport": "basketball", "espn_sport": "basketball", "espn_league": "womens-college-basketball", "name": "NCAAW", "country": "USA",
     "logo_url": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png"},
    # Hockey
    {"sport": "hockey", "espn_sport": "hockey", "espn_league": "nhl", "name": "NHL", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png"},
    # Baseball
    {"sport": "baseball", "espn_sport": "baseball", "espn_league": "mlb", "name": "MLB", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png"},
    # Football
    {"sport": "football", "espn_sport": "football", "espn_league": "nfl", "name": "NFL", "country": "USA",
     "logo_url": "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png"},
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
    client: httpx.AsyncClient, espn_sport: str, espn_league: str,
    target_date: date | None = None,
) -> dict[str, Any]:
    """Fetch the scoreboard from ESPN for a specific date (or today if None)."""
    url = f"{ESPN_BASE}/{espn_sport}/{espn_league}/scoreboard"
    params = {}
    if target_date:
        params["dates"] = target_date.strftime("%Y%m%d")
    try:
        resp = await client.get(url, params=params, timeout=15.0)
        resp.raise_for_status()
        return resp.json()
    except Exception as exc:
        logger.warning("espn_fetch_failed", league=espn_league, error=str(exc))
        return {}


async def seed_date(
    db: DatabaseManager,
    client: httpx.AsyncClient,
    sports_db: dict[str, uuid.UUID],
    target_date: date,
) -> tuple[int, int, int]:
    """Seed all leagues for a single date. Returns (leagues, teams, matches) counts."""
    total_leagues = 0
    total_teams = 0
    total_matches = 0

    for league_cfg in ESPN_LEAGUES:
        sport_type = league_cfg["sport"]
        sport_id = sports_db.get(sport_type)
        if not sport_id:
            continue

        data = await fetch_espn_scoreboard(
            client, league_cfg["espn_sport"], league_cfg["espn_league"],
            target_date=target_date,
        )
        events = data.get("events", [])

        if not events:
            continue

        # Try to extract league logo from ESPN API response as fallback
        league_logo = league_cfg.get("logo_url", "")
        api_leagues = data.get("leagues", [])
        if api_leagues and not league_logo:
            logos = api_leagues[0].get("logos", [])
            if logos and isinstance(logos, list) and isinstance(logos[0], dict):
                league_logo = logos[0].get("href", league_logo)

        async with db.write_session() as session:
            league_id = await _upsert_league(
                session, sport_id, league_cfg["name"],
                league_cfg["country"], league_cfg["espn_league"],
                logo_url=league_logo,
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

    return total_leagues, total_teams, total_matches


async def seed() -> None:
    """Main seed function."""
    setup_logging("seed")

    parser = argparse.ArgumentParser(description="Seed LiveView database from ESPN")
    parser.add_argument("--days-ahead", type=int, default=0,
                        help="Number of days ahead to seed (0 = today only)")
    parser.add_argument("--days-back", type=int, default=0,
                        help="Number of days back to seed for backfilling past games")
    parser.add_argument("--date", type=str, default=None,
                        help="Specific date to seed (YYYY-MM-DD)")
    args = parser.parse_args()

    settings = get_settings()
    db = DatabaseManager(settings)
    await db.connect()

    async with httpx.AsyncClient() as client:
        async with db.read_session() as session:
            result = await session.execute(select(SportORM))
            sports_db = {s.sport_type: s.id for s in result.scalars().all()}

        print(f"\n{'='*60}")
        print(f"  Live View Seed — {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        print(f"{'='*60}")
        print(f"  Sports in DB: {list(sports_db.keys())}")
        print(f"  Leagues configured: {len(ESPN_LEAGUES)}")
        print()

        # Ensure every configured league exists (e.g. NFL even when no games today)
        async with db.write_session() as session:
            for league_cfg in ESPN_LEAGUES:
                sport_id = sports_db.get(league_cfg["sport"])
                if sport_id:
                    await _upsert_league(
                        session, sport_id, league_cfg["name"],
                        league_cfg["country"], league_cfg["espn_league"],
                        logo_url=league_cfg.get("logo_url", ""),
                    )
        print("  All leagues ensured (including NFL when Football sport exists).")
        print()

        grand_leagues = 0
        grand_teams = 0
        grand_matches = 0

        if args.date:
            dates = [date.fromisoformat(args.date)]
        else:
            today = datetime.now(timezone.utc).date()
            start = today - timedelta(days=args.days_back)
            end = today + timedelta(days=args.days_ahead)
            dates = [start + timedelta(days=d) for d in range((end - start).days + 1)]

        for target_date in dates:
            print(f"  --- {target_date.isoformat()} ---")
            leagues, teams, matches = await seed_date(
                db, client, sports_db, target_date,
            )
            grand_leagues += leagues
            grand_teams += teams
            grand_matches += matches
            if matches == 0:
                print(f"  · No matches found for {target_date.isoformat()}")
            print()

        print(f"  Summary: {grand_leagues} league-days, {grand_teams} new teams, {grand_matches} matches")
        print(f"{'='*60}\n")

    await db.disconnect()


async def _upsert_league(
    session: Any,
    sport_id: uuid.UUID,
    name: str,
    country: str,
    espn_league_id: str,
    logo_url: str = "",
) -> uuid.UUID:
    """Create or get an existing league. Returns league UUID."""
    stmt = select(LeagueORM).where(
        LeagueORM.sport_id == sport_id,
        LeagueORM.name == name,
    )
    result = await session.execute(stmt)
    existing = result.scalar_one_or_none()
    if existing:
        league_id = existing.id
        if logo_url and not existing.logo_url:
            existing.logo_url = logo_url
    else:
        league_id = uuid.uuid4()
        session.add(LeagueORM(
            id=league_id,
            sport_id=sport_id,
            name=name,
            short_name=name,
            country=country,
            logo_url=logo_url or None,
        ))
        await session.flush()

    # Ensure provider mapping exists
    await _ensure_provider_mapping(session, "league", league_id, "espn", espn_league_id)
    return league_id


async def _upsert_team(
    session: Any,
    sport_id: uuid.UUID,
    espn_team: dict[str, Any],
    espn_league: str = "",
) -> uuid.UUID:
    """Create or get a team from ESPN data. Returns team UUID.
    
    Uses league-scoped provider IDs (e.g. 'nba:30') to prevent
    cross-sport collisions where ESPN reuses the same numeric team ID.
    """
    raw_id = str(espn_team.get("id", ""))
    scoped_id = f"{espn_league}:{raw_id}" if espn_league else raw_id
    name = espn_team.get("displayName", espn_team.get("name", "Unknown"))
    short_name = espn_team.get("abbreviation", name[:3].upper())
    logo_url = ""
    logo_field = espn_team.get("logo")
    logos_field = espn_team.get("logos")
    if isinstance(logo_field, str) and logo_field:
        logo_url = logo_field
    elif isinstance(logos_field, list) and logos_field:
        logo_url = logos_field[0].get("href", "") if isinstance(logos_field[0], dict) else str(logos_field[0])
    elif isinstance(logos_field, str) and logos_field:
        logo_url = logos_field

    mapping_stmt = select(ProviderMappingORM.canonical_id).where(
        ProviderMappingORM.entity_type == "team",
        ProviderMappingORM.provider == "espn",
        ProviderMappingORM.provider_id == scoped_id,
    )
    mapping_result = await session.execute(mapping_stmt)
    existing_id = mapping_result.scalar_one_or_none()

    if existing_id:
        if logo_url:
            team_stmt = select(TeamORM).where(TeamORM.id == existing_id)
            team = (await session.execute(team_stmt)).scalar_one_or_none()
            if team and not team.logo_url:
                team.logo_url = logo_url
        return existing_id

    team_id = uuid.uuid4()
    session.add(TeamORM(
        id=team_id,
        sport_id=sport_id,
        name=name,
        short_name=short_name,
        logo_url=logo_url,
    ))
    await session.flush()

    await _ensure_provider_mapping(session, "team", team_id, "espn", scoped_id)
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

    aggregate_home: int | None = None
    aggregate_away: int | None = None

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

        team_id = await _upsert_team(session, sport_id, team_data, espn_league_id)
        if is_new:
            teams_created += 1

        home_away = competitor.get("homeAway", "")
        score_str = competitor.get("score", "0")
        try:
            score = int(score_str)
        except (ValueError, TypeError):
            score = 0
        try:
            agg = int(competitor.get("aggregateScore", 0))
        except (ValueError, TypeError):
            agg = 0

        if home_away == "home":
            home_team_id = team_id
            score_home = score
            if "aggregateScore" in competitor:
                aggregate_home = agg
        else:
            away_team_id = team_id
            score_away = score
            if "aggregateScore" in competitor:
                aggregate_away = agg

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
        # Update state (including aggregate for two-legged ties)
        state_stmt = select(MatchStateORM).where(MatchStateORM.match_id == existing_match_id)
        state = (await session.execute(state_stmt)).scalar_one_or_none()
        if state:
            state.score_home = score_home
            state.score_away = score_away
            state.clock = clock
            state.phase = phase.value
            state.version += 1
            extra = dict(state.extra_data or {})
            if aggregate_home is not None and aggregate_away is not None:
                extra["aggregate_home"] = aggregate_home
                extra["aggregate_away"] = aggregate_away
            else:
                extra.pop("aggregate_home", None)
                extra.pop("aggregate_away", None)
            state.extra_data = extra
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

    extra_data: dict[str, Any] = {}
    if aggregate_home is not None and aggregate_away is not None:
        extra_data["aggregate_home"] = aggregate_home
        extra_data["aggregate_away"] = aggregate_away

    # Create match state
    session.add(MatchStateORM(
        match_id=match_id,
        score_home=score_home,
        score_away=score_away,
        clock=clock,
        phase=phase.value,
        extra_data=extra_data,
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
