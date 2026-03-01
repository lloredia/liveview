# LiveView — Live Scores Runbook

Quick diagnosis guide when live scores stop working or show incorrect data.

---

## 5-Minute Diagnosis Checklist

### 1. Is the backend alive?

```bash
curl https://backend-api-production-8b9f.up.railway.app/health
# Expected: {"status":"ok","service":"api"}
```

If it times out or returns an error, the backend is down or sleeping. Check Railway dashboard for deploy status and logs.

### 2. Check service status and provider health

```bash
curl https://backend-api-production-8b9f.up.railway.app/v1/status
```

Look for:
- `services.redis` and `services.database` — both should be `true`.
- `providers.espn.state` — should be `"closed"` (healthy). If `"open"`, ESPN circuit breaker has tripped (too many failures). It auto-recovers after 120s.
- `live_refresh.espn_enabled` — should be `true`. If `false`, live refresh is disabled by flag.
- `live_refresh.fallback_enabled` — TheSportsDB fallback active.
- `live_refresh.live_matches_now` — number of currently live matches in DB.
- `pipeline.matches_today` — total matches for today in DB. If 0, the DB is not seeded or scheduler hasn't run.

### 3. Are there matches in the database?

```bash
curl "https://backend-api-production-8b9f.up.railway.app/v1/today?date=$(date -u +%Y-%m-%d)"
```

- `total_matches` should be > 0 during any active sports season.
- If 0: the database is empty. Run the seed script or ensure the scheduler service is running.

### 4. Are leagues populated?

```bash
curl https://backend-api-production-8b9f.up.railway.app/v1/leagues
```

Should return sport groups with leagues. If empty, the seed/scheduler hasn't created league records.

### 5. Is ESPN reachable?

```bash
curl "https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard"
curl "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard"
curl "https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard"
curl "https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard"
curl "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard"
```

Each should return JSON with an `events` array. If any fail, ESPN may be down for that sport.

### 6. Run the integration test

```bash
cd backend
python scripts/integration_live_scores.py https://backend-api-production-8b9f.up.railway.app
```

Shows pass/fail for health, status, leagues, today, scoreboards, and ESPN reachability.

---

## Common Issues and Fixes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| "No matches on this date" | DB empty / scheduler not running | Run `python seed.py` or start the scheduler service |
| Scores not updating | ESPN circuit breaker open | Wait 2 min for auto-recovery; check `/v1/status` |
| Scores not updating | `espn_live_refresh_enabled = false` | Set `LV_ESPN_LIVE_REFRESH_ENABLED=true` and restart |
| Wrong phase for NFL games | Old code without football branch | Deploy latest code (includes NFL phase resolution) |
| Frontend shows "Scores temporarily delayed" | Backend unreachable or returning errors | Check backend health + logs |
| Frontend shows cached data | Network issue or backend cold start | Wait for backend warm-up; try "Try again" button |

---

## Backend Logs to Search

| Log key | Meaning |
|---------|---------|
| `live_scores_refreshed` | ESPN refresh completed, N matches updated |
| `live_refresh_espn_failed` | ESPN returned error for a league |
| `live_refresh_espn_retry_ok` | ESPN retry succeeded after initial failure |
| `live_refresh_fallback_used` | TheSportsDB fallback activated and updated matches |
| `live_refresh_fallback_error` | TheSportsDB fallback also failed |
| `espn_circuit_open` | Circuit breaker opened (5+ failures) |
| `espn_event_parse_error` | Individual ESPN event couldn't be parsed |
| `live_score_refresh_disabled_by_flag` | Refresh disabled via env flag |

---

## Environment Variables (Live Scores)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LV_ESPN_LIVE_REFRESH_ENABLED` | `true` | Enable/disable the 30s ESPN refresh loop |
| `LV_LIVE_REFRESH_USE_FALLBACK` | `true` | Enable/disable TheSportsDB fallback when ESPN fails |
| `LV_THESPORTSDB_API_KEY` | `3` (free tier) | TheSportsDB API key for fallback |
| `LV_SPORTRADAR_API_KEY` | (empty) | Sportradar key (for ingest service) |
| `LV_FOOTBALL_DATA_API_KEY` | (empty) | Football-Data.org key (soccer lineup/stats) |

---

## Architecture Quick Reference

```
ESPN API (free, no key)
    |
    v
[API Server - live_score_refresh_loop (30s)]
    |-- ESPN primary
    |-- ESPN retry (2s backoff)
    |-- TheSportsDB fallback (if ESPN fails)
    |
    v
PostgreSQL (matches, match_state, match_stats)
    |
    v
Redis (today:{date} cache 15s, api:scoreboard:{id} cache 2s)
    |
    v
Frontend (polling /v1/today every 10-20s + ESPN patch via use-espn-live)
```

If scheduler + ingest services are running, they provide an additional data path:
- Scheduler discovers matches and publishes poll commands
- Ingest fetches from ESPN/Sportradar/Football-Data/TheSportsDB
- Normalizer writes to DB + Redis snapshots + fanout (WebSocket)
