#!/usr/bin/env python3
"""
Integration test for live scores pipeline.

Checks:
  1. /health returns 200 + status ok
  2. /v1/status returns provider info and live_refresh config
  3. /v1/leagues returns at least 1 league
  4. /v1/today?date=YYYY-MM-DD returns a valid structure
  5. For each league, /v1/leagues/{id}/scoreboard returns 200
  6. ESPN scoreboard endpoints are reachable for all configured sports

Usage:
  python scripts/integration_live_scores.py [BASE_URL]

  BASE_URL defaults to http://localhost:8000.
  Set to your production URL for production checks.
"""
from __future__ import annotations

import sys
import json
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
RESET = "\033[0m"

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports"
ESPN_CHECKS = {
    "soccer/eng.1": "Soccer (Premier League)",
    "basketball/nba": "Basketball (NBA)",
    "hockey/nhl": "Hockey (NHL)",
    "baseball/mlb": "Baseball (MLB)",
    "football/nfl": "Football (NFL)",
}

passed = 0
failed = 0
warnings = 0


def _get_json(url: str, timeout: int = 15) -> dict | list | None:
    try:
        req = Request(url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        return {"__http_error__": e.code, "__url__": url}
    except (URLError, TimeoutError, OSError) as e:
        return {"__network_error__": str(e), "__url__": url}


def ok(msg: str) -> None:
    global passed
    passed += 1
    print(f"  {GREEN}PASS{RESET}  {msg}")


def fail(msg: str) -> None:
    global failed
    failed += 1
    print(f"  {RED}FAIL{RESET}  {msg}")


def warn(msg: str) -> None:
    global warnings
    warnings += 1
    print(f"  {YELLOW}WARN{RESET}  {msg}")


def main() -> None:
    global passed, failed, warnings
    print(f"\n=== Live Scores Integration Test ===")
    print(f"Backend: {BASE}\n")

    # 1. Health
    print("[1] Health check")
    data = _get_json(f"{BASE}/health")
    if isinstance(data, dict) and data.get("status") == "ok":
        ok("/health returns status=ok")
    else:
        fail(f"/health unexpected: {data}")

    # 2. Status
    print("[2] Status endpoint")
    data = _get_json(f"{BASE}/v1/status")
    if isinstance(data, dict) and "providers" in data:
        ok(f"/v1/status: status={data.get('status')}")
        providers = data.get("providers", {})
        espn = providers.get("espn", {})
        if isinstance(espn, dict):
            ok(f"  ESPN circuit: state={espn.get('state', '?')}")
        live_refresh = data.get("live_refresh", {})
        if isinstance(live_refresh, dict):
            ok(f"  Live refresh: espn_enabled={live_refresh.get('espn_enabled')}, fallback={live_refresh.get('fallback_enabled')}, live_now={live_refresh.get('live_matches_now')}")
    else:
        fail(f"/v1/status unexpected: {data}")

    # 3. Leagues
    print("[3] Leagues")
    leagues_data = _get_json(f"{BASE}/v1/leagues")
    if isinstance(leagues_data, list) and len(leagues_data) > 0:
        total_leagues = sum(len(g.get("leagues", [])) for g in leagues_data)
        sports = [g.get("sport") for g in leagues_data]
        ok(f"/v1/leagues: {total_leagues} leagues across sports {sports}")
    else:
        fail(f"/v1/leagues returned empty or error: {leagues_data}")

    # 4. Today
    print("[4] Today endpoint")
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data = _get_json(f"{BASE}/v1/today?date={today_str}")
    if isinstance(data, dict):
        total = data.get("total_matches", 0)
        live = data.get("live", 0)
        finished = data.get("finished", 0)
        scheduled = data.get("scheduled", 0)
        ok(f"/v1/today: {total} matches (live={live}, finished={finished}, scheduled={scheduled})")
        if total == 0:
            warn("No matches for today — this may be expected (off-season / early morning UTC)")
    else:
        fail(f"/v1/today unexpected: {data}")

    # 5. Scoreboards for first few leagues
    print("[5] League scoreboards (sample)")
    if isinstance(leagues_data, list):
        checked = 0
        for group in leagues_data:
            for league in group.get("leagues", [])[:2]:
                lid = league.get("id")
                name = league.get("name", "?")
                sb = _get_json(f"{BASE}/v1/leagues/{lid}/scoreboard")
                if isinstance(sb, dict) and "matches" in sb:
                    mc = len(sb["matches"])
                    ok(f"  {name}: {mc} matches")
                elif isinstance(sb, dict) and sb.get("__http_error__"):
                    fail(f"  {name}: HTTP {sb['__http_error__']}")
                else:
                    warn(f"  {name}: unexpected response")
                checked += 1
                if checked >= 6:
                    break
            if checked >= 6:
                break
    else:
        warn("Skipping scoreboards (no leagues)")

    # 6. ESPN direct reachability
    print("[6] ESPN API reachability")
    for path, label in ESPN_CHECKS.items():
        data = _get_json(f"{ESPN_BASE}/{path}/scoreboard")
        if isinstance(data, dict) and "events" in data:
            count = len(data["events"])
            ok(f"  ESPN {label}: {count} events")
            if count == 0:
                warn(f"  ESPN {label}: 0 events (may be off-season)")
        elif isinstance(data, dict) and data.get("__http_error__"):
            fail(f"  ESPN {label}: HTTP {data['__http_error__']}")
        elif isinstance(data, dict) and data.get("__network_error__"):
            fail(f"  ESPN {label}: network error: {data['__network_error__']}")
        else:
            warn(f"  ESPN {label}: unexpected shape")

    # Summary
    print(f"\n=== Results: {GREEN}{passed} passed{RESET}, {RED}{failed} failed{RESET}, {YELLOW}{warnings} warnings{RESET} ===\n")
    sys.exit(1 if failed > 0 else 0)


if __name__ == "__main__":
    main()
