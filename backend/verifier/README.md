# Continuous Match Verification Engine

Production-grade verification service for Live View: cross-checks live match data against ESPN (and optional Google/official sources), reconciles discrepancies with confidence scoring, and publishes corrections via the same Redis/DB contract as ingest.

## Objectives

- Ensure Live View scores are correct in near real-time.
- Detect discrepancies between providers; automatically reconcile when confidence is high.
- Flag inconsistencies for logging/alerting; never block or crash on source failure.
- Run verification loops continuously with rate limiting, backoff, and circuit breakers.

## Architecture

- **Input**: Live matches from Postgres (`matches` + `match_state` where phase is live).
- **Sources**: ESPN (primary, structured API), Google (placeholder), official sites (optional).
- **Output**: Updates to `match_state` and Redis snapshot + `fanout:match:{id}:tier:0` delta (same as ingest normalizer).

## Redis Keys

| Key | Purpose |
|-----|---------|
| `verification:last_checked:{match_id}` | Last verification timestamp (TTL 24h) |
| `verification:confidence:{match_id}` | Latest confidence score (TTL 1h) |
| `verification:disputes` | Set of dispute keys |
| `dispute:match:{match_id}` | Dispute payload (current vs verified; TTL 7d) |
| `rate:domain:{domain}` | Per-domain rate tracking (internal) |

Snapshot and delta keys are the same as ingest: `snap:match:{match_id}:scoreboard` and `fanout:match:{match_id}:tier:0`.

## Configuration

Uses same env as other services for Redis/DB:

- `LV_REDIS_URL` (or `REDIS_URL`)
- `LV_DATABASE_URL` (or `DATABASE_URL`)

Verifier-specific (optional, prefix `LV_VERIFIER_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `LV_VERIFIER_HIGH_DEMAND_INTERVAL_MIN` | 5 | Min interval (s) for high-demand matches |
| `LV_VERIFIER_HIGH_DEMAND_INTERVAL_MAX` | 10 | Max interval (s) for high-demand matches |
| `LV_VERIFIER_LOW_DEMAND_INTERVAL_MIN` | 20 | Min interval (s) for low-demand matches |
| `LV_VERIFIER_LOW_DEMAND_INTERVAL_MAX` | 60 | Max interval (s) for low-demand matches |
| `LV_VERIFIER_PER_DOMAIN_RPM` | 60 | Max requests per minute per domain |
| `LV_VERIFIER_FETCH_TIMEOUT_S` | 10 | HTTP timeout per request |
| `LV_VERIFIER_CONFIDENCE_HIGH` | 0.8 | Above: apply correction |
| `LV_VERIFIER_CONFIDENCE_MEDIUM` | 0.5 | Above: log warning, retry next cycle |
| `LV_VERIFIER_METRICS_PORT` | 9091 | Metrics HTTP server port |

## Running

### Local (from repo root)

```bash
cd backend
export LV_REDIS_URL=redis://localhost:6379/0
export LV_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/liveview
python3 -m verifier.main
```

(Use `python3` if your system doesn’t have a `python` command.)

**Connecting to Railway from your machine:** Use each service’s **public** URL (from the Railway dashboard → Connect), not the internal hostnames (`redis.railway.internal`, `postgres.railway.internal`). Those internal hostnames only resolve inside Railway’s network.

### Docker

```bash
cd backend
docker build --target verifier -t liveview-verifier .
docker run --env-file .env -p 9091:9091 liveview-verifier
```

### Railway / production

- Add a new service; build target `verifier`.
- Set same `REDIS_URL` and `DATABASE_URL` as API/ingest.
- Expose port 9091 for metrics/health if desired.

## Metrics

- **GET /metrics** — JSON: `verification_latency_avg_seconds`, `mismatch_count`, `dispute_count`, `correction_count`, `rate_limit_hits`, `external_fetch_latency_by_domain`.
- **GET /health** — Returns `ok`.

## Integration with Live View

1. **DB**: Verifier reads `matches` + `match_state` (and league/team via ORM); writes `match_state` and `matches.phase`/`version` on correction.
2. **Redis**: Writes `snap:match:{match_id}:scoreboard` and publishes to `fanout:match:{match_id}:tier:0` so WebSocket clients and replay get updates.
3. **League mapping**: Uses `provider_mappings` (entity_type=league, provider=espn) to get ESPN league id and fetch that league’s scoreboard; matches events to our matches by team names.
4. **No change** to API, ingest, or scheduler; verifier runs alongside them.

## Safety

- Per-domain token bucket and 429 backoff.
- Circuit breaker per domain after N failures.
- Max concurrent requests cap; semaphore in engine.
- Timeouts on all HTTP calls.
- On source failure: log and continue; never block the loop.
