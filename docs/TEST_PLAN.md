# Live View — Minimal Test Plan

## Unit tests

- **Scheduler / provider selection**  
  `backend/tests/test_scheduler_provider.py`  
  - Phase tempo key mapping  
  - `AdaptivePollingEngine.compute_interval`: demand factor, quota pressure, health factor  
  - `HealthScorer.compute_health`: no samples, success samples, error samples  

  Run from repo root:
  ```bash
  cd backend && python -m pytest tests/test_scheduler_provider.py -v
  ```

## Integration tests

- **WebSocket fanout**  
  `backend/tests/test_ws_fanout.py`  
  - Event replay uses Redis Streams (`read_event_stream`), not LIST  
  - Fanout channel naming  
  - Publish delta → pubsub receive  

  Requires Redis. Skip with `SKIP_WS_FANOUT=1`.  
  ```bash
  cd backend && python -m pytest tests/test_ws_fanout.py -v
  ```

## Load tests

- **k6**  
  `scripts/load_test_k6.js`  
  - Stages: ramp 20 VUs, hold 50, ramp down  
  - Hits `/health`, `/ready`, `/v1/leagues`, `/v1/today`  

  ```bash
  k6 run scripts/load_test_k6.js
  k6 run --vus 50 --duration 30s scripts/load_test_k6.js
  ```

- **Locust**  
  `scripts/load_test_locust.py`  
  - Same endpoints with weighted tasks  

  ```bash
  locust -f scripts/load_test_locust.py --host=http://localhost:8000
  ```

## CI suggestion

- Run `pytest backend/tests` (unit + integration when Redis available).
- Optionally run `k6 run scripts/load_test_k6.js` as a smoke step (short duration).

See `docs/PRODUCTION_READINESS_AUDIT.md` for verification steps per fix.
