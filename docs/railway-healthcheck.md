# Railway deployment — healthcheck troubleshooting

## What the log shows

- **Build**: Succeeds. Docker image builds (Python 3.11-slim, `pip install -r requirements.txt`, etc.).
- **Healthcheck**: Fails. Railway hits `GET /health` on the configured port; all 11 attempts report **"service unavailable"** within the 5‑minute retry window.

So the container is either not listening on the healthcheck port, or the process exits before the healthcheck can succeed.

## Why `/health` might be unavailable

The API app only starts accepting requests **after** the FastAPI **lifespan** finishes. During lifespan the app:

1. Connects to **Redis** (with retry: 10 attempts, exponential backoff 2s → 1024s).
2. Connects to **PostgreSQL** (same retry).
3. Starts background tasks (phase sync, live refresh, news fetch).

If Redis or Postgres are missing or unreachable, lifespan can:

- **Block for a long time** (up to ~17 minutes per dependency) so the server never binds to `PORT` within the 5‑minute healthcheck window, or  
- **Raise after 10 failed attempts** and exit the process, so the container never serves `/health`.

So the usual cause of "service unavailable" is **Redis or Database not configured or not reachable** on Railway.

## What to do

1. **Set variables on Railway**
   - `DATABASE_URL` (or `LV_DATABASE_URL`) — Postgres connection string from your Railway Postgres (or external).
   - `REDIS_URL` (or `LV_REDIS_URL`) — Redis connection string if you use Redis (e.g. Railway Redis plugin).
   - `PORT` is set by Railway; the app uses it automatically.

2. **Check runtime logs**
   - In the Railway dashboard, open **Deployments → your deployment → Logs** (runtime logs, not build logs).
   - Look for errors during startup, e.g.:
     - `connect_retry` warnings (Redis/Database connection failures),
     - `Connection refused`, `timeout`, or `could not translate host name`,
     - Any Python traceback (e.g. missing env, import error).

3. **Confirm services are reachable**
   - If Postgres and Redis are other Railway services, ensure they are in the same project/region and that the API service has their URLs (often via Railway’s variable references).
   - If the app crashes after 10 Redis or DB retries, you’ll see an exception in the logs; fix the connection (URL, network, or add the missing service).

4. **Optional: faster healthcheck**
   - If dependencies are slow to become ready, you can increase the healthcheck retry window in `railway.toml` or in the Railway UI so the app has more time to finish lifespan and open the port.

## Quick checklist

- [ ] `DATABASE_URL` (or `LV_DATABASE_URL`) set and pointing to a running Postgres.
- [ ] `REDIS_URL` (or `LV_REDIS_URL`) set if the app uses Redis (e.g. WebSocket, caching).
- [ ] Runtime logs checked for connection errors or tracebacks.
- [ ] No firewall or private-network restriction blocking the API service from reaching Postgres/Redis.
