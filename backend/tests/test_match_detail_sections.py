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
