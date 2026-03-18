from __future__ import annotations

from datetime import datetime, timezone

import pytest

from api.routes.matches import _find_espn_event_id


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self) -> dict:
        return self._payload


class _FakeClient:
    def __init__(self, payload: dict):
        self.payload = payload

    async def get(self, url: str, params=None):
        return _FakeResponse(200, self.payload)


@pytest.mark.asyncio
async def test_find_espn_event_id_prefers_closest_kickoff_match() -> None:
    payload = {
        "events": [
            {
                "id": "wrong-event",
                "date": "2026-03-17T19:00:00Z",
                "competitions": [{
                    "competitors": [
                        {"homeAway": "home", "team": {"displayName": "Arsenal", "shortDisplayName": "Arsenal"}},
                        {"homeAway": "away", "team": {"displayName": "Chelsea", "shortDisplayName": "Chelsea"}},
                    ]
                }],
            },
            {
                "id": "right-event",
                "date": "2026-03-18T19:00:00Z",
                "competitions": [{
                    "competitors": [
                        {"homeAway": "home", "team": {"displayName": "Arsenal", "shortDisplayName": "Arsenal"}},
                        {"homeAway": "away", "team": {"displayName": "Chelsea", "shortDisplayName": "Chelsea"}},
                    ]
                }],
            },
        ]
    }
    client = _FakeClient(payload)

    event_id = await _find_espn_event_id(
        client,
        "Arsenal",
        "Chelsea",
        "soccer",
        "eng.1",
        kickoff_time=datetime(2026, 3, 18, 19, 0, tzinfo=timezone.utc),
    )

    assert event_id == "right-event"


@pytest.mark.asyncio
async def test_find_espn_event_id_rejects_loose_name_match_outside_time_window() -> None:
    payload = {
        "events": [
            {
                "id": "stale-event",
                "date": "2026-03-10T19:00:00Z",
                "competitions": [{
                    "competitors": [
                        {"homeAway": "home", "team": {"displayName": "Arsenal", "shortDisplayName": "Arsenal"}},
                        {"homeAway": "away", "team": {"displayName": "Chelsea", "shortDisplayName": "Chelsea"}},
                    ]
                }],
            },
        ]
    }
    client = _FakeClient(payload)

    event_id = await _find_espn_event_id(
        client,
        "Arsenal",
        "Chelsea",
        "soccer",
        "eng.1",
        kickoff_time=datetime(2026, 3, 18, 19, 0, tzinfo=timezone.utc),
    )

    assert event_id is None
