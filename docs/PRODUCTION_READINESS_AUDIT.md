# Live View — Production Readiness Audit

Principal-engineer-level audit for 10k+ concurrent WS clients, multi-provider ingestion, and high churn. Focus: correctness, determinism, idempotency, ordering, resilience.

---

## A) Prioritized Issue List

### P0 — Critical (correctness / data integrity / security)

| ID | Finding | Location |
|----|--------|----------|
| P0-1 | Event replay reads Redis LIST but ingest writes Redis STREAM → replay returns no/wrong data | `api/ws/manager.py` |
| P0-2 | Scheduler does not release leader on shutdown → delayed failover | `scheduler/service.py` |
| P0-3 | Default JWT secret in code → auth bypass if env unset | `auth_routes.py` |
| P0-4 | WebSocket endpoint has no auth → any client can subscribe to any match | `api/app.py` |

### P1 — High (reliability / scale / ops)

| ID | Finding | Location |
|----|--------|----------|
| P1-1 | No backpressure for slow WS clients → memory/connection buildup | `api/ws/manager.py` |
| P1-2 | Dockerfile runs as root | `backend/Dockerfile` |
| P1-3 | Inline `import asyncio` in http_client | `shared/utils/http_client.py` |
| P1-4 | Ingest listen uses `subscribe_channel` (psubscribe) with literal channel name → fragile | `ingest/service.py` |
| P1-5 | No index on `match_state(updated_at)` for scoreboard freshness queries | `migrations/001_initial.sql` |
| P1-6 | WS stop() logs `len(self._connections)` after cleanup → always 0 | `api/ws/manager.py` |
| P1-7 | Schedule sync HTTP client has no retries/timeout config | `scheduler/service.py` |

### P2 — Medium (hardening / observability)

| ID | Finding | Location |
|----|--------|----------|
| P2-1 | Presence count can drift if node crashes before decrement | Redis presence keys |
| P2-2 | Normalizer scoreboard publishes delta even when `changed` is False in some code paths | normalizer |
| P2-3 | No circuit breaker on schedule sync ESPN calls | scheduler |
| P2-4 | Structured logs may contain PII in error messages | various |
| P2-5 | Health server only starts when PORT is set | health_server.py |

---

## B) Fix Plan (PR-sized chunks)

| PR | Scope | Issues |
|----|--------|--------|
| PR-1 | Realtime: event replay + backpressure + logging | P0-1, P1-1, P1-6 |
| PR-2 | Scheduler: release leader on shutdown + sync client robustness | P0-2, P1-7, P2-3 |
| PR-3 | Security: JWT default secret + WS auth option | P0-3, P0-4 |
| PR-4 | Ops: Dockerfile non-root, http_client imports, ingest subscribe | P1-2, P1-3, P1-4 |
| PR-5 | Storage: index for match_state.updated_at | P1-5 |
| PR-6 | Tests: scheduler/provider unit, WS fanout integration, load test | — |

---

## C) P0/P1 Findings → Evidence → Risk → Fix → Patch → Verification

### P0-1: Event replay uses LIST read on STREAM key

**Evidence**

- Ingest writes events with `RedisManager.append_event_stream()` which uses `xadd()` (Redis Streams).  
  `shared/utils/redis_manager.py` lines 249–255.
- WS replay uses `self._redis.client.lrange(events_key, 0, 99)` on the same key.  
  `api/ws/manager.py` lines 327–330.

**Risk**  
Replay returns nothing or wrong type; clients subscribing to events tier get broken/empty replay.

**Fix**  
Use `read_event_stream()` (xrange) and decode the stream payload (`data` field).

**Patch**

```diff
--- a/backend/api/ws/manager.py
+++ b/backend/api/ws/manager.py
@@ -324,13 +324,18 @@ class WebSocketManager:
         # For events tier, also send the event stream
         if tier == 1:
             events_key = f"stream:match:{match_id}:events"
             try:
-                events_raw = await self._redis.client.lrange(events_key, 0, 99)
-                if events_raw:
+                stream_entries = await self._redis.read_event_stream(
+                    match_id, last_id="0", count=100
+                )
+                if stream_entries:
                     events = []
-                    for raw in events_raw:
+                    for _entry_id, fields in stream_entries:
                         try:
-                            evt = json.loads(raw)
+                            raw = fields.get("data") if isinstance(fields.get("data"), str) else (
+                                fields.get(b"data", b"").decode("utf-8") if isinstance(fields.get("data"), bytes) else ""
+                            )
+                            if not raw:
+                                continue
+                            evt = json.loads(raw)
                             events.append(evt)
                         except (json.JSONDecodeError, TypeError):
                             continue
```

**Verification**

- Unit: mock `read_event_stream` return; assert client receives `events_batch` with correct list.
- Integration: run ingest normalizer for one match with events, connect WS, subscribe tier 1, assert snapshot contains events.

---

### P0-2: Scheduler does not release leader on shutdown

**Evidence**

- `SchedulerService.run()` exits on `_shutdown.set()` or `CancelledError`; no call to `release_leader`.  
  `scheduler/service.py` lines 406–434, 533–551.

**Risk**  
Another instance must wait for TTL before acquiring leadership → delayed failover after deploy/scale-in.

**Fix**  
On shutdown, release leader before disconnecting Redis.

**Patch**

```diff
--- a/backend/scheduler/service.py
+++ b/backend/scheduler/service.py
@@ -424,6 +424,11 @@ class SchedulerService:
             except Exception as exc:
                 logger.error("scheduler_loop_error", error=str(exc), exc_info=True)
                 await asyncio.sleep(2.0)
+
+        # Release leadership on shutdown for fast failover
+        if self._is_leader:
+            released = await self._redis.release_leader("scheduler", self._instance_id)
+            if released:
+                logger.info("scheduler_leader_released", instance_id=self._instance_id)
+            self._is_leader = False
+        await self._stop_all_tasks()
```

And in `main()` after `scheduler_run_task` is cancelled, ensure we await the task so the cleanup runs (already done if you `await asyncio.gather` or equivalent). No change needed if the loop exits and then main disconnects Redis.

**Verification**

- Start scheduler, verify it acquires leader; send SIGTERM, check Redis: `leader:scheduler` should be deleted or another instance can acquire immediately after TTL.

---

### P0-3: Default JWT secret in code

**Evidence**

- `JWT_SECRET = os.getenv("JWT_SECRET", "liveview-dev-secret-change-in-production")`  
  `auth_routes.py` line 27.

**Risk**  
If `JWT_SECRET` is not set in production, anyone can forge tokens.

**Fix**  
In production, require explicit secret; fail fast or refuse to issue tokens when default is used.

**Patch**

```diff
--- a/backend/auth_routes.py
+++ b/backend/auth_routes.py
@@ -24,8 +24,12 @@ logger = logging.getLogger("liveview.auth")
 router = APIRouter(prefix="/v1/auth", tags=["auth"])
 favorites_router = APIRouter(prefix="/v1/user", tags=["user"])
 
-# ── Config ────────────────────────────────────────────────────────────
-JWT_SECRET = os.getenv("JWT_SECRET", "liveview-dev-secret-change-in-production")
+JWT_DEFAULT_DEV = "liveview-dev-secret-change-in-production"
+JWT_SECRET = os.getenv("JWT_SECRET", JWT_DEFAULT_DEV)
+
+def _is_production() -> bool:
+    return os.getenv("LV_ENV", "").lower() in ("production", "prod")
+
 JWT_EXPIRY = 60 * 60 * 24 * 30  # 30 days
```

Then in `create_token` (or at module load when used in production):

```python
def create_token(user_id: str, email: str) -> str:
    if _is_production() and (not JWT_SECRET or JWT_SECRET == JWT_DEFAULT_DEV):
        raise RuntimeError("JWT_SECRET must be set in production")
    ...
```

**Verification**

- With `LV_ENV=production` and no `JWT_SECRET`, auth routes that create tokens should fail with clear error.

---

### P0-4: WebSocket has no auth

**Evidence**

- `@app.websocket("/v1/ws")` calls `_ws_manager.handle_connection(ws)` with no token or channel checks.  
  `api/app.py` lines 692–713.

**Risk**  
Any client can subscribe to any match_id; data leak for private or paid tiers.

**Fix**  
Optional WS auth: accept `Authorization: Bearer <token>` or query param, validate JWT, attach user/roles; optionally restrict channels by role or match access list. Prefer small change: add optional validation when `LV_WS_REQUIRE_AUTH=1` and reject connection if invalid.

**Patch (minimal — optional auth gate)**

- In `api/app.py` websocket endpoint: after `await ws.accept()` (or before, by reading first message), if `get_settings().ws_require_auth` and no valid Bearer token in first message or headers (if available), close with code 1008 and reason `auth_required`.  
- Add config `ws_require_auth: bool = False` and document that when True, clients must send an authenticated first message or use a token in subprotocol/query.

(Full implementation depends on whether WS is opened with headers; typically first message can carry token. Omitted full diff here; recommend a separate PR.)

**Verification**

- With `LV_WS_REQUIRE_AUTH=1` and valid JWT in first message, connection succeeds; with invalid/missing token, connection closed with 1008.

---

### P1-1: No backpressure for slow WS clients

**Evidence**

- `_send_raw` / `_send` catch exceptions and log; no drop policy or per-connection queue with max size.  
  `api/ws/manager.py` 467–488, 414–418.

**Risk**  
Slow clients cause send buffers to grow; at 10k connections one slow client can hold memory and block the event loop if sends are not fire-and-forget (they are, but buffer growth remains).

**Fix**  
Add a bounded per-connection send queue and drop policy: e.g. queue max 64 messages, drop oldest when full; or close connection after N consecutive send failures. Prefer small change: non-blocking send with a small queue and drop-oldest.

(Detailed patch omitted; recommend queue per connection with `asyncio.Queue(maxsize=64)`, producer in `_fan_out_to_subscribers`, consumer task per connection; on `queue.full()` drop oldest and increment metric.)

**Verification**

- Load test: many clients; make a few clients very slow (e.g. throttle receive); assert no unbounded memory growth and metrics for dropped messages.

---

### P1-2: Dockerfile runs as root

**Evidence**

- `backend/Dockerfile` has no `USER` directive.  
  Lines 1–48.

**Risk**  
Container escape or path to root on host.

**Fix**  
Create non-root user and switch to it before CMD.

**Patch**

```diff
--- a/backend/Dockerfile
+++ b/backend/Dockerfile
@@ -14,6 +14,9 @@ RUN apt-get update && \
 COPY requirements.txt .
 RUN pip install --no-cache-dir -r requirements.txt
 
+RUN adduser --disabled-password --gecos "" appuser && chown -R appuser /app
+USER appuser
+
 COPY . .
 
 RUN chmod +x entrypoint.sh
```

Note: `COPY . .` and `chmod` may need to run as root; reorder so COPY and chmod are before USER, or run chmod in a prior layer as root. Prefer:

```diff
COPY . .
RUN chmod +x entrypoint.sh
RUN chown -R appuser /app
USER appuser
```

**Verification**

- `docker run --rm <image> whoami` → `appuser`.

---

### P1-3: Inline `import asyncio` in http_client

**Evidence**

- `import asyncio` appears inside loops in `shared/utils/http_client.py` (lines 112, 126, 159).

**Risk**  
Style/maintainability; no functional bug.

**Fix**  
Move `import asyncio` to top of file.

**Patch**

```diff
--- a/backend/shared/utils/http_client.py
+++ b/backend/shared/utils/http_client.py
@@ -5,6 +5,7 @@
 """
 from __future__ import annotations
 
+import asyncio
 import time
 from typing import Any, Optional
```
Then remove the three inline `import asyncio` lines (around 112, 126, 159).

**Verification**

- Existing tests and lint.

---

### P1-5: No index on match_state(updated_at)

**Evidence**

- `match_state` has no index on `updated_at`.  
  `backend/migrations/001_initial.sql` 114–128.

**Risk**  
Scoreboard freshness or “recent updates” queries may full-scan.

**Fix**  
Add migration with `CREATE INDEX idx_match_state_updated_at ON match_state(updated_at);`

**Patch**

- New file `backend/migrations/004_match_state_updated_at.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_match_state_updated_at ON match_state(updated_at);
```

**Verification**

- Run migration; `EXPLAIN SELECT * FROM match_state ORDER BY updated_at DESC LIMIT 100` uses index.

---

### P1-6: WS stop() logs zero connections

**Evidence**

- `await self._close_connection(conn, ...)` calls `_cleanup_connection(conn)` which does `self._connections.pop(conn.connection_id, None)`. So after closing all, `self._connections` is empty.  
  `api/ws/manager.py` 101–105, 511–526.

**Risk**  
Misleading logs; no correctness issue.

**Fix**  
Capture count before closing.

**Patch**

```diff
--- a/backend/api/ws/manager.py
+++ b/backend/api/ws/manager.py
@@ -96,8 +96,9 @@ class WebSocketManager:
         if self._heartbeat_task:
             self._heartbeat_task.cancel()
 
+        total = len(self._connections)
         # Close all connections
         for conn in list(self._connections.values()):
             await self._close_connection(conn, code=1001, reason="server_shutdown")
 
-        logger.info("ws_manager_stopped", total_connections_served=len(self._connections))
+        logger.info("ws_manager_stopped", total_connections_closed=total)
```

**Verification**

- Start API, open 2 WS, trigger shutdown; log should show `total_connections_closed=2`.

---

## D) Verification Commands

- **Unit (scheduler/provider)**  
  `cd backend && python -m pytest tests/test_scheduler_provider.py -v`

- **Integration (WS fanout)**  
  `cd backend && python -m pytest tests/test_ws_fanout.py -v`  
  (Requires Redis; use fixture or env.)

- **Load test**  
  `k6 run scripts/load_test_k6.js`  
  Or: `locust -f scripts/load_test_locust.py --host=http://localhost:8000`

- **Health**  
  `curl -s http://localhost:8000/health`  
  `curl -s http://localhost:8000/ready`

- **Event replay (manual)**  
  Ingest one match with events, connect WS, subscribe tier 1, assert snapshot contains `events_batch` with list of events.

---

## E) Minimal Additions

- **Tests:** Unit tests for scheduler interval and provider selection; integration test for WS fanout (subscribe → receive delta); basic k6 or Locust load script. (Files provided separately.)
- **Docs:** README note that production must set `JWT_SECRET` and optionally `LV_WS_REQUIRE_AUTH`; document new index in migrations.
- **CI:** Run `pytest backend/tests` and `k6 run scripts/load_test_k6.js` (or smoke) in CI; fail on P0 findings if regressed.

---

## Summary

- **P0:** Fix event replay (P0-1), scheduler leader release (P0-2), JWT default secret (P0-3), and add optional WS auth (P0-4).
- **P1:** Backpressure (P1-1), Dockerfile user (P1-2), imports (P1-3), ingest subscribe (P1-4), index (P1-5), WS stop log (P1-6), schedule sync client (P1-7).
- **P2:** Presence drift, normalizer publish path, circuit breaker for sync, PII in logs, health server PORT.

Apply PR-1–PR-5 in order; add PR-6 (tests) early so verification is automated.
