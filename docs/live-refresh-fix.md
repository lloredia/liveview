# Live Score Refresh — Root Cause & Fix

## Phase 1 — Diagnosis Summary

### Root cause

1. **PWA service worker was caching all `/v1/*` API responses** for up to 10 seconds (NetworkFirst, `maxAgeSeconds: 10`). So the Scores screen and live ticker could show responses that were up to 10s old even when the backend had newer data.
2. **Client `fetch()` did not use `cache: 'no-store'`** for live endpoints, so the browser HTTP cache could also serve stale responses.
3. **Backend live refresh ran every 30s**, so the DB could be up to 30s behind ESPN for score/phase updates. Combined with PWA cache, the UI could be 40s+ stale.

FINAL/FT transition logic was already correct: `_resolve_phase()` maps `STATUS_FINAL` and `STATUS_FULL_TIME` to `MatchPhase.FINISHED`; the refresh loop includes leagues with matches finished in the last 48h, so final scores are applied. The main problem was **stale responses** reaching the UI, not finalization logic.

### File locations

| Layer | File | Relevance |
|-------|------|-----------|
| PWA | `frontend/next.config.js` | `runtimeCaching` applied 10s cache to all `/v1/*` |
| Frontend | `frontend/components/today-view.tsx` | `fetchToday()` no `cache: 'no-store'` |
| Frontend | `frontend/lib/api.ts` | `apiFetch()` used for scoreboard/ticker; no `cache: 'no-store'` for live paths |
| Backend | `backend/api/app.py` | `LIVE_REFRESH_INTERVAL_S = 30` — refresh every 30s |
| Backend | `backend/api/routes/today.py` | Redis TTL 5s when live (OK); cache invalidation on refresh (OK) |

---

## Fixes applied (minimal)

1. **PWA**: Added a **NetworkOnly** rule for live score endpoints (`/v1/today`, `/v1/leagues/*/scoreboard`, `/v1/matches/*`) so the service worker never caches them. Placed **before** the generic API rule so it takes precedence.
2. **Frontend**: `fetchToday()` and `apiFetch()` (for paths containing `today`, `scoreboard`, or `matches/`) now send `cache: 'no-store'` so the browser does not cache live data.
3. **Backend**: `LIVE_REFRESH_INTERVAL_S` reduced from 30 to **15** so score/phase updates reach the DB at least every 15s.

No UI layout, styling, or API contracts were changed.

---

## Phase 5 — Manual acceptance tests

| # | Test | Pass? |
|---|------|--------|
| 1 | Open Scores with at least 1 live match. | |
| 2 | Within 15 seconds of a known score change, UI reflects it. | |
| 3 | Leave tab hidden 2 minutes, then return — UI refetches and shows fresh data. | |
| 4 | A game that ends transitions to FINAL/FT within ≤2 polling cycles (~10–30s). | |
| 5 | Ticker and list stay consistent (no ticker stale while list updates). | |
| 6 | No regressions: navigation, styling, filtering, league menu. | |

Run manually and mark Pass/Fail in the table above.
