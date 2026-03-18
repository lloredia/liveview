"""
Endpoint consistency tests for canonical score/state agreement.

These tests verify that:
- /v1/today
- /v1/leagues/{id}/scoreboard
- /v1/matches/{id}

return the same score and phase for the same canonical match.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import ASGITransport, AsyncClient

from api.app import create_app
from api.dependencies import init_dependencies
from shared.models.orm import LeagueORM, MatchORM, MatchStateORM, SportORM, TeamORM


@pytest.fixture
async def client(db, redis):
    """API client with injected test DB/Redis and lifespan disabled."""
    init_dependencies(redis, db)
    app = create_app(use_lifespan=False)
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client


@pytest.fixture
async def seeded_matches(db):
    """Seed one live and one finished match in the same league."""
    now = datetime.now(timezone.utc)

    async with db.write_session() as session:
        sport = SportORM(id=uuid.uuid4(), name="Soccer", sport_type="soccer")
        league = LeagueORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Premier League",
            short_name="EPL",
            country="England",
            active=True,
        )
        home_team = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Arsenal",
            short_name="ARS",
            abbreviation="ARS",
            country="England",
        )
        away_team = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Chelsea",
            short_name="CHE",
            abbreviation="CHE",
            country="England",
        )
        second_home = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Liverpool",
            short_name="LIV",
            abbreviation="LIV",
            country="England",
        )
        second_away = TeamORM(
            id=uuid.uuid4(),
            sport_id=sport.id,
            name="Manchester City",
            short_name="MCI",
            abbreviation="MCI",
            country="England",
        )

        live_match = MatchORM(
            id=uuid.uuid4(),
            league_id=league.id,
            home_team_id=home_team.id,
            away_team_id=away_team.id,
            phase="live_second_half",
            start_time=now - timedelta(minutes=25),
            venue="Emirates Stadium",
        )
        finished_match = MatchORM(
            id=uuid.uuid4(),
            league_id=league.id,
            home_team_id=second_home.id,
            away_team_id=second_away.id,
            phase="finished",
            start_time=now - timedelta(hours=2),
            venue="Anfield",
        )

        live_state = MatchStateORM(
            match_id=live_match.id,
            score_home=2,
            score_away=1,
            clock="67:12",
            period="2",
            phase="live_second_half",
            version=3,
            seq=3,
        )
        finished_state = MatchStateORM(
            match_id=finished_match.id,
            score_home=3,
            score_away=2,
            clock=None,
            period=None,
            phase="finished",
            version=4,
            seq=4,
        )

        session.add_all(
            [
                sport,
                league,
                home_team,
                away_team,
                second_home,
                second_away,
                live_match,
                finished_match,
                live_state,
                finished_state,
            ]
        )
        await session.commit()

    return {
        "league_id": str(league.id),
        "matches": {
            "live": {
                "id": str(live_match.id),
                "phase": "live_second_half",
                "score_home": 2,
                "score_away": 1,
            },
            "finished": {
                "id": str(finished_match.id),
                "phase": "finished",
                "score_home": 3,
                "score_away": 2,
            },
        },
    }


async def _fetch_today_match(client: AsyncClient, match_id: str) -> dict:
    response = await client.get("/v1/today")
    assert response.status_code == 200
    payload = response.json()
    for league in payload["leagues"]:
        for match in league["matches"]:
            if match["id"] == match_id:
                return match
    raise AssertionError(f"match {match_id} not found in /v1/today payload")


async def _fetch_scoreboard_match(client: AsyncClient, league_id: str, match_id: str) -> dict:
    response = await client.get(f"/v1/leagues/{league_id}/scoreboard")
    assert response.status_code == 200
    payload = response.json()
    for match in payload["matches"]:
        if match["id"] == match_id:
            return match
    raise AssertionError(f"match {match_id} not found in league scoreboard payload")


async def _fetch_match_center_match(client: AsyncClient, match_id: str) -> tuple[dict, dict | None]:
    response = await client.get(f"/v1/matches/{match_id}")
    assert response.status_code == 200
    payload = response.json()
    return payload["match"], payload["state"]


async def _fetch_match_details(client: AsyncClient, match_id: str) -> dict:
    response = await client.get(f"/v1/matches/{match_id}/details")
    assert response.status_code == 200
    return response.json()


async def _fetch_match_timeline(client: AsyncClient, match_id: str) -> dict:
    response = await client.get(f"/v1/matches/{match_id}/timeline")
    assert response.status_code == 200
    return response.json()


async def _fetch_match_stats(client: AsyncClient, match_id: str) -> dict:
    response = await client.get(f"/v1/matches/{match_id}/stats")
    assert response.status_code == 200
    return response.json()


@pytest.mark.asyncio
@pytest.mark.integration
@pytest.mark.parametrize("match_kind", ["live", "finished"])
async def test_score_and_phase_are_consistent_across_today_scoreboard_and_match_center(
    client,
    seeded_matches,
    match_kind: str,
):
    expected = seeded_matches["matches"][match_kind]
    league_id = seeded_matches["league_id"]
    match_id = expected["id"]

    today_match = await _fetch_today_match(client, match_id)
    scoreboard_match = await _fetch_scoreboard_match(client, league_id, match_id)
    match_center_match, match_center_state = await _fetch_match_center_match(client, match_id)

    assert today_match["phase"] == expected["phase"]
    assert scoreboard_match["phase"] == expected["phase"]
    assert match_center_match["phase"] == expected["phase"]

    assert today_match["score"]["home"] == expected["score_home"]
    assert today_match["score"]["away"] == expected["score_away"]
    assert scoreboard_match["score"]["home"] == expected["score_home"]
    assert scoreboard_match["score"]["away"] == expected["score_away"]
    assert match_center_state is not None
    assert match_center_state["score_home"] == expected["score_home"]
    assert match_center_state["score_away"] == expected["score_away"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_match_details_preserve_canonical_score_and_phase_when_supplementary_conflicts(
    client,
    seeded_matches,
    monkeypatch,
):
    live_match = seeded_matches["matches"]["live"]

    async def fake_supplementary(*args, **kwargs):
        return {
            "source": "espn",
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "sport": "soccer",
            "plays": [],
            "team_stats": {"home": [], "away": []},
            "player_stats": {
                "home": {"teamName": "Arsenal", "players": [], "statColumns": []},
                "away": {"teamName": "Chelsea", "players": [], "statColumns": []},
            },
            "formations": {"home": "4-3-3", "away": "4-2-3-1"},
            "injuries": {"home": [], "away": []},
            "team_display": {
                "home_name": "Arsenal",
                "away_name": "Chelsea",
                "home_team_id": "espn-home",
                "away_team_id": "espn-away",
            },
            "substitutions": None,
            # Intentionally conflicting with canonical 2-1 live state
            "warning": "conflicting supplementary payload",
        }

    monkeypatch.setattr(
        "api.routes.matches._fetch_espn_supplementary_summary",
        fake_supplementary,
    )

    details = await _fetch_match_details(client, live_match["id"])
    match_center_match, match_center_state = await _fetch_match_center_match(client, live_match["id"])

    assert details["phase"] == live_match["phase"]
    assert match_center_match["phase"] == live_match["phase"]
    assert match_center_state is not None
    assert match_center_state["score_home"] == live_match["score_home"]
    assert match_center_state["score_away"] == live_match["score_away"]

    assert details["supplementary"]["espn"]["source"] == "espn"
    assert details["supplementary"]["espn"]["team_display"]["home_name"] == "Arsenal"
    assert details["supplementary"]["espn"]["team_display"]["away_name"] == "Chelsea"
    assert details["supplementary"]["espn"]["warning"] == "conflicting supplementary payload"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_match_details_and_timeline_prefer_match_state_phase_when_match_row_is_stale(
    client,
    db,
    seeded_matches,
):
    live_match = seeded_matches["matches"]["live"]
    match_id = uuid.UUID(live_match["id"])

    async with db.write_session() as session:
        match = await session.get(MatchORM, match_id)
        assert match is not None
        match.phase = "finished"
        await session.commit()

    details = await _fetch_match_details(client, live_match["id"])
    timeline_response = await client.get(f"/v1/matches/{live_match['id']}/timeline")
    assert timeline_response.status_code == 200
    timeline = timeline_response.json()

    assert details["phase"] == live_match["phase"]
    assert details["timeline"]["phase"] == live_match["phase"]
    assert timeline["phase"] == live_match["phase"]


@pytest.mark.asyncio
@pytest.mark.integration
async def test_match_details_sections_match_dedicated_timeline_and_stats_endpoints(
    client,
    seeded_matches,
):
    live_match = seeded_matches["matches"]["live"]

    details = await _fetch_match_details(client, live_match["id"])
    timeline = await _fetch_match_timeline(client, live_match["id"])
    stats = await _fetch_match_stats(client, live_match["id"])

    assert details["timeline"] == timeline
    assert details["stats"] == stats
