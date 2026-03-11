# Live View — Real-Time Sports Tracking Platform

Production-grade real-time sports tracking system with sub-second updates, multi-league coverage, adaptive polling, provider failover cascade, and WebSocket push.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                           Clients                                    │
│                  (Browser / Mobile / Third-party)                     │
└──────────────┬──────────────────────┬───────────────────────────────┘
               │ REST (HTTP)          │ WebSocket
               ▼                      ▼
┌──────────────────────────────────────────────────────────────────────┐
│                         API Service                                   │
│                                                                       │
│  ┌─────────────┐  ┌───────────────┐  ┌────────────────────────────┐  │
│  │ REST Routes  │  │  WS Manager   │  │    Middleware Stack         │  │
│  │ /v1/leagues  │  │  subscribe    │  │  • Request ID              │  │
│  │ /v1/matches  │  │  replay       │  │  • Logging                 │  │
│  │ /v1/ws       │  │  heartbeat    │  │  • CORS                    │  │
│  └──────┬───────┘  └──────┬────────┘  │  • Error handling          │  │
│         │                 │           └────────────────────────────┘  │
└─────────┼─────────────────┼──────────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌──────────────────────────────┐
│          Redis               │
│                              │
│  • Snapshots (snap:match:*)  │
│  • Pub/Sub (fanout:match:*)  │
│  • Presence tracking         │
│  • Leader election           │
│  • Quota counters            │
│  • Event streams             │
└──────┬──────────┬────────────┘
       │          │
       ▼          ▼
┌────────────┐  ┌────────────────────────────────────────────────────┐
│ Scheduler  │  │                 Ingest Service                      │
│            │  │                                                      │
│ • Leader   │──│→ poll commands ──→ ┌─────────────┐                  │
│   election │  │                    │  Provider    │                  │
│ • Adaptive │  │  ┌─────────┐      │  Connectors  │                  │
│   polling  │  │  │ Normal- │ ◄────│  • ESPN      │                  │
│ • Demand   │  │  │ ization │      │  • Sportradar│                  │
│   scoring  │  │  │ Layer   │      │  • SportsDB  │                  │
│ • Quota    │  │  └────┬────┘      └──────────────┘                  │
│   mgmt     │  │       │                                              │
└────────────┘  │       ▼                                              │
                │  ┌──────────┐                                        │
                │  │ DB Write │ + Redis Snapshot + Pub/Sub Delta       │
                │  └──────────┘                                        │
                └──────────────────────────────────────────────────────┘
                        │
                        ▼
               ┌─────────────────┐     ┌────────────────────┐
               │   PostgreSQL    │     │  Builder Service    │
               │                 │     │                     │
               │  • matches      │◄────│  • Synthetic        │
               │  • match_state  │     │    timeline gen     │
               │  • match_events │     │  • Reconciliation   │
               │  • match_stats  │     │    engine           │
               │  • teams        │     │  • Stale cleanup    │
               │  • provider_map │     └────────────────────┘
               └─────────────────┘
```

## Services

| Service | Port | Metrics | Description |
|---------|------|---------|-------------|
| **API** | 8000 | 9090 | REST endpoints, WebSocket connections |
| **Ingest** | — | 9091 | Provider connectors, normalization, DB writes |
| **Scheduler** | — | 9092 | Adaptive polling engine, leader election |
| **Builder** | — | 9093 | Synthetic timeline generation, reconciliation |

## Sports & Providers

| Sport | ESPN | Sportradar | TheSportsDB |
|-------|------|------------|-------------|
| Soccer | ✅ Scoreboard, Events, Stats | ✅ Full | ✅ Scoreboard only |
| Basketball | ✅ Full | ✅ Full | ✅ Scoreboard only |
| Hockey | ✅ Full | ✅ Full | ✅ Scoreboard only |
| Baseball | ✅ Full | ✅ Full | ✅ Scoreboard only |

Provider failover is automatic based on health scoring (error rate 40%, latency 25%, rate limits 20%, freshness 15%).

## Quick Start

```bash
# 1. Clone and configure
cp .env.example .env
# Edit .env with your Sportradar API key (optional)

# 2. Start everything
docker compose up -d

# 3. Verify
curl http://localhost:8000/health
# → {"status": "ok", "service": "api"}

# 4. List leagues
curl http://localhost:8000/v1/leagues

# 5. Connect WebSocket
websocat ws://localhost:8000/v1/ws
# → {"type": "state", "connection_id": "abc123...", ...}
```

### Getting matches to show (Today view)

The **Today** view shows matches from the database. If you see "No matches on this date":

1. **Run migrations** so `sports` and `leagues` exist (see migrations in `migrations/`).
2. **Load match data** in one of these ways:
   - **One-time seed (recommended for local/dev):**  
     `cd backend && python seed.py`  
     This fetches from ESPN and inserts today’s matches (and next few days with `--days-ahead`).
   - **Scheduler (for production):**  
     Run the **scheduler** service (e.g. `SERVICE_TYPE=scheduler` or `docker compose` with the scheduler). It syncs the next 7 days from ESPN on startup (after ~10s) and every 4 hours. No seed needed.

If the frontend shows "Showing cached matches" and no matches, the last API request may have failed (e.g. wrong `NEXT_PUBLIC_API_URL`, network, or backend down). Use **Try again** to refetch.

## Troubleshooting

### WebSocket connects but no messages

**Symptoms:** Connection opens successfully, but no scoreboard/event updates come through.

**Steps:**
1. Check Redis is running:
   ```bash
   redis-cli ping
   # Expected: PONG
   ```
2. Check scheduler is running (logs should show `scheduler_leader_elected`):
   ```bash
   docker logs liveview-scheduler 2>&1 | grep scheduler_leader
   ```
3. Check provider is in allowlist and functioning:
   ```bash
   curl http://localhost:8000/metrics | grep provider_requests
   ```

### No scores updating (matches show as scheduled)

**Symptoms:** Matches appear but scores never update, phase stays `scheduled`.

**Steps:**
1. Check provider health:
   ```bash
   curl http://localhost:8000/metrics | grep provider_health
   ```
2. Check ESPN API is accessible:
   ```bash
   curl -I https://site.api.espn.com/apis/site/v2/sports/soccer/eng.1/scoreboard
   # Expected: 200 OK
   ```
3. Check ingest service is polling (logs should show `live_score_refresh`):
   ```bash
   docker logs liveview-api 2>&1 | grep live_score_refresh
   ```
4. Verify provider keys are set (if using SportRadar):
   ```bash
   echo $SPORTRADAR_API_KEY  # Should not be empty
   ```

### High 500 errors or database connection failures

**Symptoms:** Frontend shows errors, backend logs show database/Redis connection errors.

**Steps:**
1. Check database connectivity:
   ```bash
   psql -U liveview -h localhost liveview
   # If fails, check POSTGRES_HOST and POSTGRES_PASSWORD
   ```
2. Check Redis connectivity:
   ```bash
   redis-cli -u $REDIS_URL ping
   # Expected: PONG
   ```
3. Check container health:
   ```bash
   docker ps | grep liveview
   docker logs liveview-api --tail 50
   ```
4. Restart services if needed:
   ```bash
   docker compose restart api
   docker compose restart scheduler
   ```

### WebSocket slow or delayed updates

**Symptoms:** WS connects okay, but updates are delayed or very infrequent.

**Steps:**
1. Check subscriber count (may be throttling polling):
   ```bash
   curl http://localhost:8000/metrics | grep ws_connections
   ```
2. Check health of primary provider (ESPN/Sportradar):
   ```bash
   curl http://localhost:8000/metrics | grep provider_health | head -5
   ```
3. Increase polling frequency (reduce `scheduler_max_poll_interval_s`):
   ```bash
   export LV_SCHEDULER_MAX_POLL_INTERVAL_S=30  # down from 120s
   docker compose restart scheduler
   ```

## REST API

### `GET /v1/leagues`

List all leagues grouped by sport.

**Response:**
```json
[
  {
    "sport": "soccer",
    "sport_display": "Soccer",
    "leagues": [
      {"id": "uuid", "name": "Premier League", "slug": "eng.1", "country": "England"}
    ]
  }
]
```

### `GET /v1/leagues/{league_id}/scoreboard`

Live scoreboard for a league. Supports `ETag` / `If-None-Match`.

**Response:**
```json
{
  "league_id": "uuid",
  "league_name": "Premier League",
  "matches": [
    {
      "id": "uuid",
      "phase": "live_first_half",
      "score": {"home": 2, "away": 1},
      "clock": "34:22",
      "home_team": {"id": "uuid", "name": "Arsenal", "short_name": "ARS"},
      "away_team": {"id": "uuid", "name": "Chelsea", "short_name": "CHE"}
    }
  ]
}
```

### `GET /v1/matches/{match_id}`

Match center — scoreboard, teams, current state, recent events.

### `GET /v1/matches/{match_id}/timeline`

Event timeline. Supports cursor pagination via `after_seq`.

| Param | Type | Description |
|-------|------|-------------|
| `after_seq` | int | Return events after this sequence number |
| `limit` | int | Max events (1–500, default 100) |
| `include_synthetic` | bool | Include inferred events (default true) |

### `GET /v1/matches/{match_id}/stats`

Team statistics (possession, shots, fouls, etc.).

## WebSocket Protocol

Connect to `ws://localhost:8000/v1/ws`.

### Client → Server

**Subscribe to match updates:**
```json
{"op": "subscribe", "match_id": "uuid-string", "tiers": [0, 1]}
```
Tiers: `0` = scoreboard, `1` = events, `2` = stats.

**Unsubscribe:**
```json
{"op": "unsubscribe", "match_id": "uuid-string"}
```

**Ping (keepalive):**
```json
{"op": "ping"}
```

### Server → Client

**Snapshot (replay on connect):**
```json
{"type": "snapshot", "match_id": "...", "tier": 0, "data": {...}, "replay": true}
```

**Delta (live update):**
```json
{"type": "delta", "match_id": "...", "tier": 0, "data": {...}, "timestamp": 1708000000}
```

**Pong:**
```json
{"type": "pong", "timestamp": 1708000000}
```

**Error:**
```json
{"type": "error", "error": {"code": "subscription_limit", "message": "..."}}
```

## Adaptive Polling

The scheduler computes polling intervals dynamically:

```
base_interval = sport_tempo[phase] × tier_multiplier
demand_factor = 1 / (1 + ln(1 + subscriber_count))
health_factor = 1 + (1 - provider_health) × 2
quota_factor  = 1 + max(0, (usage/limit - 0.7)) × 5
interval      = clamp(base × demand × health × quota ± jitter, 1s, 120s)
```

**Sport Tempo Profiles (live_active seconds):**

| Sport | Active | Break | Pre-match | Scheduled |
|-------|--------|-------|-----------|-----------|
| Soccer | 3s | 15s | 60s | 120s |
| Basketball | 2s | 10s | 60s | 120s |
| Hockey | 3s | 12s | 60s | 120s |
| Baseball | 5s | 20s | 60s | 120s |

## Database Schema

Key tables:
- `matches` — Match metadata, teams, scheduling
- `match_state` — Current scoreboard (mutable, version-tracked)
- `match_events` — Append-only event timeline with sequence ordering
- `match_stats` — Team/player statistics per match
- `provider_mappings` — Maps provider IDs → canonical UUIDs

Idempotency: `match_events` has a unique constraint on `(match_id, source_provider, provider_event_id)` preventing duplicate inserts.

## Configuration

All settings are environment-variable driven via Pydantic Settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `POSTGRES_HOST` | `localhost` | Database host |
| `REDIS_URL` | `redis://localhost:6379/0` | Redis connection URL |
| `API_PORT` | `8000` | API listen port |
| `API_WORKERS` | `2` | Uvicorn worker count |
| `ESPN_RPM_LIMIT` | `300` | ESPN requests/minute cap |
| `SPORTRADAR_RPM_LIMIT` | `100` | Sportradar requests/minute cap |
| `SCHEDULER_TICK_INTERVAL_S` | `1.0` | Scheduler loop tick |
| `SCHEDULER_LEADER_TTL_S` | `30` | Leader election TTL |

## Monitoring

Each service exposes Prometheus metrics on its metrics port:

- `provider_requests_total` — Provider API calls by provider/sport/tier/status
- `provider_latency_seconds` — Provider response latency histogram
- `ws_connections` — Active WebSocket connections (gauge)
- `ws_messages_total` — WebSocket messages by direction
- `scheduler_active_tasks` — Current polling tasks (gauge)
- `live_matches` — Live matches by sport (gauge)
- `synthetic_events_total` — Synthetic events generated by type

## Development

```bash
# Install dev dependencies
pip install -e ".[dev]"

# Run linter
ruff check .

# Type checking
mypy --strict shared/ api/ ingest/ scheduler/ builder/

# Run tests
pytest tests/ -v --cov=.
```

## Design Decisions

1. **UUID primary keys** — No coordinator needed for ID generation across instances.
2. **Append-only events** — `match_events` is insert-only with sequence ordering for reliable replay.
3. **Redis pub/sub for delta fanout** — Decouples producers (ingest) from consumers (API/WS) without polling.
4. **Anti-flap provider selection** — Pinned provider selection with TTL prevents rapid switching.
5. **Logarithmic demand scaling** — `1/(1+ln(1+n))` prevents extreme polling speedup with many subscribers.
6. **Synthetic timeline** — Fills gaps when providers lack play-by-play (TheSportsDB fallback).
7. **Leader election** — Single scheduler instance drives polls; standby takes over on failure.
8. **Tier system** — Scoreboard (fastest), Events (medium), Stats (slowest) — independent polling rates.
