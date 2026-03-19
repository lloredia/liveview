from __future__ import annotations

import uuid
from types import SimpleNamespace

from api.routes.matches import _build_detail_sections


def _match_row() -> SimpleNamespace:
    return SimpleNamespace(
        ht_short="ARS",
        ht_name="Arsenal",
        at_short="CHE",
        at_name="Chelsea",
        home_team_id=uuid.uuid4(),
        away_team_id=uuid.uuid4(),
    )


def test_detail_sections_prefer_soccer_details_for_player_stats_and_lineup() -> None:
    row = _match_row()
    timeline_payload = {"events": []}
    stats_payload = {"teams": []}
    soccer_details = {
        "source": "football_data",
        "lineup": {
            "source": "football_data",
            "home": {"formation": "4-3-3", "lineup": [{"id": 1, "name": "David Raya", "position": "GK", "shirt_number": 22}], "bench": []},
            "away": {"formation": "4-2-3-1", "lineup": [{"id": 2, "name": "Robert Sanchez", "position": "GK", "shirt_number": 1}], "bench": []},
        },
        "player_stats": {
            "source": "football_data",
            "home": {"teamName": "Arsenal", "players": [{"name": "Bukayo Saka", "jersey": "7", "position": "FW", "stats": {"goals": 1}, "starter": True}], "statColumns": ["goals"]},
            "away": {"teamName": "Chelsea", "players": [{"name": "Cole Palmer", "jersey": "20", "position": "FW", "stats": {"goals": 0}, "starter": True}], "statColumns": ["goals"]},
        },
    }
    supplementary_espn = {
        "sport": "soccer",
        "player_stats": {
            "home": {"teamName": "Arsenal", "players": [{"name": "Wrong Source", "jersey": "99", "position": "FW", "stats": {}, "starter": True}], "statColumns": []},
            "away": {"teamName": "Chelsea", "players": [{"name": "Wrong Source", "jersey": "98", "position": "FW", "stats": {}, "starter": True}], "statColumns": []},
        },
        "formations": {"home": "3-5-2", "away": "3-4-3"},
        "injuries": {"home": [], "away": []},
        "substitutions": [],
        "team_stats": {"home": [], "away": []},
        "plays": [],
    }

    sections = _build_detail_sections(
        row,
        uuid.uuid4(),
        "live",
        timeline_payload,
        stats_payload,
        soccer_details,
        supplementary_espn,
    )

    assert sections["playerStats"]["source"] == "football_data"
    assert sections["playerStats"]["home"]["players"][0]["name"] == "Bukayo Saka"
    assert sections["lineup"]["source"] == "football_data"
    assert sections["lineup"]["fallback"]["home"]["formation"] == "4-3-3"


def test_detail_sections_fall_back_to_espn_when_soccer_details_are_missing() -> None:
    row = _match_row()
    timeline_payload = {"events": []}
    stats_payload = {"teams": []}
    supplementary_espn = {
        "sport": "soccer",
        "player_stats": {
            "home": {
                "teamName": "Arsenal",
                "players": [
                    {"name": "Bukayo Saka", "jersey": "7", "position": "FW", "stats": {"shots": 2}, "starter": True},
                    {"name": "Leandro Trossard", "jersey": "19", "position": "FW", "stats": {"shots": 1}, "starter": False},
                ],
                "statColumns": ["shots"],
            },
            "away": {
                "teamName": "Chelsea",
                "players": [
                    {"name": "Cole Palmer", "jersey": "20", "position": "FW", "stats": {"shots": 3}, "starter": True},
                    {"name": "Noni Madueke", "jersey": "11", "position": "FW", "stats": {"shots": 1}, "starter": False},
                ],
                "statColumns": ["shots"],
            },
        },
        "formations": {"home": "4-3-3", "away": "4-2-3-1"},
        "injuries": {"home": [], "away": []},
        "substitutions": [{"minute": "67", "playerOff": "Mudryk", "playerOn": "Madueke", "homeAway": "away"}],
        "team_stats": {"home": [], "away": []},
        "plays": [],
    }

    sections = _build_detail_sections(
        row,
        uuid.uuid4(),
        "live",
        timeline_payload,
        stats_payload,
        None,
        supplementary_espn,
    )

    assert sections["playerStats"]["source"] == "espn"
    assert sections["playerStats"]["home"]["players"][0]["name"] == "Bukayo Saka"
    assert sections["lineup"]["source"] == "espn"
    assert sections["lineup"]["homeFormation"] == "4-3-3"
    assert sections["lineup"]["homeStarters"][0]["name"] == "Bukayo Saka"
    assert sections["lineup"]["awayBench"][0]["name"] == "Noni Madueke"


def test_detail_sections_prefer_timeline_and_db_stats_when_present() -> None:
    row = _match_row()
    timeline_payload = {
        "events": [
            {
                "id": "evt-1",
                "event_type": "goal",
                "detail": "Goal by Bukayo Saka",
                "period": "2",
                "minute": 63,
                "second": 0,
                "score_home": 1,
                "score_away": 0,
                "team_id": str(row.home_team_id),
                "player_name": "Bukayo Saka",
            }
        ]
    }
    stats_payload = {
        "teams": [
            {"side": "home", "stats": {"possession": 61, "shots_on_target": 5}},
            {"side": "away", "stats": {"possession": 39, "shots_on_target": 2}},
        ]
    }
    supplementary_espn = {
        "plays": [
            {
                "id": "espn-play-1",
                "text": "Wrong fallback play",
                "homeScore": 0,
                "awayScore": 0,
                "period": {"number": 1, "displayValue": "1st"},
                "clock": {"displayValue": "12:00"},
                "scoringPlay": False,
                "scoreValue": 0,
                "type": {"id": "0", "text": "noop"},
            }
        ],
        "team_stats": {
            "home": [{"name": "possession", "displayValue": "50", "label": "Possession"}],
            "away": [{"name": "possession", "displayValue": "50", "label": "Possession"}],
        },
    }

    sections = _build_detail_sections(
        row,
        uuid.uuid4(),
        "live",
        timeline_payload,
        stats_payload,
        None,
        supplementary_espn,
    )

    assert sections["playByPlay"]["source"] == "timeline"
    assert sections["playByPlay"]["plays"][0]["text"] == "Goal by Bukayo Saka"
    assert sections["teamStats"]["source"] == "db"
    assert sections["teamStats"]["homeStats"][0]["displayValue"] == "61"
    assert sections["teamStats"]["awayStats"][0]["displayValue"] == "39"


def test_detail_sections_fall_back_to_espn_plays_and_team_stats_when_backend_is_empty() -> None:
    row = _match_row()
    timeline_payload = {"events": []}
    stats_payload = {"teams": []}
    supplementary_espn = {
        "plays": [
            {
                "id": "espn-play-1",
                "text": "Jayson Tatum makes three point jumper",
                "homeScore": 88,
                "awayScore": 84,
                "period": {"number": 4, "displayValue": "4th"},
                "clock": {"displayValue": "03:21"},
                "scoringPlay": True,
                "scoreValue": 3,
                "team": {"id": str(row.home_team_id)},
                "participants": [{"athlete": {"displayName": "Jayson Tatum"}}],
                "type": {"id": "437", "text": "Made Shot"},
            }
        ],
        "team_stats": {
            "home": [{"name": "rebounds", "displayValue": "44", "label": "Rebounds"}],
            "away": [{"name": "rebounds", "displayValue": "38", "label": "Rebounds"}],
        },
    }

    sections = _build_detail_sections(
        row,
        uuid.uuid4(),
        "live",
        timeline_payload,
        stats_payload,
        None,
        supplementary_espn,
    )

    assert sections["playByPlay"]["source"] == "espn"
    assert sections["playByPlay"]["plays"][0]["text"] == "Jayson Tatum makes three point jumper"
    assert sections["teamStats"]["source"] == "espn"
    assert sections["teamStats"]["homeStats"][0]["displayValue"] == "44"
    assert sections["teamStats"]["awayStats"][0]["displayValue"] == "38"
