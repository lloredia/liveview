# LiveView — Backend & Frontend Review

**Review date:** March 2025  
**Scope:** Backend (FastAPI, Python) and Frontend (Next.js 14, TypeScript/React) only.

**Fixes applied (March 2025):** usePolling console.debug gated in production; admin league_slug validated (pattern + length); JWT secret validated at API startup (fail-fast); NextAuth throws in production when OAuth configured but secret missing; getApiBase() logs error in production when API URL is localhost.

---

## Backend Review

### Strengths

| Area | Details |
|------|---------|
| **Structure** | Clear separation: `api/` (routes, middleware, ws), `auth/`, `shared/` (config, models, utils), `ingest/`, `builder/`, `scheduler/`, `notifications/`. Single entrypoint via `SERVICE_TYPE`. |
| **API design** | REST with consistent `/v1/` prefix; ETag/If-None-Match for cacheable endpoints; OpenAPI at `/docs`, `/redoc`. |
| **Auth** | JWT via `auth/deps.py` (`get_current_user_id`), Bearer required for `/v1/me`, `/v1/user/*`. OAuth ensure uses `X-OAuth-Secret`; empty secret returns 503. Admin uses `X-Admin-Key` (403 when missing/wrong). |
| **Security** | Parameterized SQL only (`text(...)` with `:param`); no string-formatting of user input. Passwords hashed with bcrypt. Rate limiting (in-memory, 120 rpm) and request ID middleware. |
| **Resilience** | Circuit breaker for ESPN, retries and TheSportsDB fallback, connection retry with backoff at startup. Phase sync and live refresh loops with enum-derived phase list. |
| **Observability** | Structured logging, Prometheus metrics, `/health`, `/ready`, `/v1/status`. Request logging skips health/metrics. |
| **Validation** | Pydantic on request bodies (e.g. `pattern="^(league|team)$"` for favorite_type, `platform` for devices). Path params use UUID where appropriate (e.g. `match_id: uuid.UUID`). |

### Backend — Recommendations

| Priority | Issue | Location | Recommendation |
|----------|--------|----------|----------------|
| **Low** | Rate limiter is in-memory | `api/middleware.py` | Per-instance only; under multi-replica deploy each replica has its own bucket. Consider Redis-based rate limit for consistent 429 across replicas. |
| **Low** | CORS `allow_credentials=False` | `api/middleware.py` | Correct for Bearer-only API. If you later add cookie-based auth to the backend, set to `True` and restrict `allow_origins`. |
| **Low** | Admin `league_slug` unbounded | `api/routes/admin.py` | Path param is passed to Redis publish as-is. Consider validating against a known set of league slugs or length/character set to avoid noisy payloads. |
| **Low** | `auth/deps.py` raises `RuntimeError` if JWT secret missing | `auth/deps.py` | Fails at first request to a protected route. Optionally validate at startup in API lifespan and fail fast. |
| **Info** | Duplicate path-style files | Some glob results show `backend\api\...` vs `backend/api/...` | Same files; no duplicate logic. Ignore. |

### Backend — File Overview

- **app.py**: Large (~1100 lines); holds ESPN mapping dicts, live refresh loop, phase sync, and route registration. Consider extracting ESPN constants and refresh helpers to a dedicated module if it grows further.
- **Routes**: `auth_routes`, `user_routes`, `matches`, `leagues`, `today`, `news`, `notifications`, `admin` — all focused; user routes correctly depend on `get_current_user_id`.
- **Tests**: `test_api.py`, `test_ws_fanout.py`, `test_scheduler_provider.py`, `test_notification_engine.py`, `test_live_scores.py` — good coverage of API, WS, scheduler, notifications, and live score logic.

---

## Frontend Review

### Strengths

| Area | Details |
|------|---------|
| **Structure** | App Router (`app/`), `components/`, `hooks/`, `lib/` (api, auth-api, types, utils). Clear split between public API client (`lib/api.ts`) and auth-backed client (`lib/auth-api.ts`). |
| **Auth** | NextAuth with Credentials + optional Apple/Google; JWT strategy; backend user id via oauth-ensure or credentials. Session + `/api/auth/backend-token` for Bearer token to backend. |
| **Data fetching** | Centralized `apiFetch` with timeout (25s), retries (2), and no-store for live endpoints. `usePolling` with visibility-aware interval and stale-while-revalidate. |
| **UX** | Error boundary, global error handler, skip-to-content, offline page and banner, pull-to-refresh. Aria-live on live ticker and match card scores. |
| **PWA** | next-pwa with NetworkFirst for `/v1/`, CacheFirst for logos/fonts; offline fallback document. |
| **Config** | `next.config.js` injects `NEXT_PUBLIC_*`; `.gitignore` excludes `.env*.local`. No secrets in client bundle. |

### Frontend — Recommendations

| Priority | Issue | Location | Recommendation |
|----------|--------|----------|----------------|
| **Medium** | `usePolling` calls `console.debug` | `hooks/use-polling.ts` | Gate behind `process.env.NODE_ENV !== "production"` or remove for production. |
| **Low** | NextAuth secret warning only in console | `auth.ts` | Already warns when OAuth is configured but secret missing. Consider failing build or runtime in production if both OAuth env and secret are set but secret is empty. |
| **Low** | Large component | `components/match-detail.tsx` | ~1800+ lines; many tabs and ESPN-specific types. Consider splitting by tab (e.g. `MatchDetailPlayByPlay`, `MatchDetailLineup`) or moving ESPN types to `lib/` or `types/`. |
| **Low** | Env fallbacks in config | `next.config.js` | `NEXT_PUBLIC_API_URL || "http://localhost:8000"` is correct for dev; ensure production build has `NEXT_PUBLIC_API_URL` set in Vercel (or deployment) so it never falls back to localhost. |
| **Info** | Two “favorites” layers | `lib/favorites.ts` (local + cloud sync via `getBackendToken`) and `lib/auth-api.ts` (fetchUserFavorites, etc.) | App uses auth-api for sidebar/home; favorites.ts used for local league list and tests. Document that favorites.ts is the legacy/local layer that syncs to backend when user is logged in. |

### Frontend — File Overview

- **app/**: `layout.tsx` (providers, error boundary, theme), `page.tsx` (home with today view, scoreboard, ticker), `match/[id]/`, `login`, `signup`, `news`, `privacy`, `support`, `offline`. Layout and routing are clear.
- **lib/api.ts**: Single `apiFetch`, typed responses, `ApiError`, and exported fetchers for leagues, scoreboard, match, today, timeline, etc. No auth in this client (public endpoints).
- **lib/auth-api.ts**: `getBackendToken()` + `authFetch()` for `/v1/user/*`; used for tracked games and favorites. Correctly requires session.
- **auth.ts**: NextAuth config, Credentials + optional Apple/Google, JWT/session callbacks, oauth-ensure call to backend. `allowDangerousEmailAccountLinking: true` is documented risk; ensure one account per email across providers if that’s the desired policy.

---

## Cross-Cutting

| Topic | Backend | Frontend |
|-------|---------|----------|
| **Secrets** | Env only (`LV_*`, `NEXTAUTH_SECRET`, etc.); no hardcoded secrets. | Only `NEXT_PUBLIC_*` in client; secrets in server routes and env. |
| **Errors** | Global exception handler returns 500 + request_id; 404 handler; rate limit 429. | ApiError for 4xx/5xx; error boundary and global handler; user-facing messages on login/signup. |
| **CORS** | Configurable; default expands to include known origins + localhost + capacitor. | Calls backend from same-origin (Vercel) or configured origin; no cookies to backend. |
| **Types** | Pydantic for request/response; ORM models in `shared/models`. | TypeScript types in `lib/types.ts`; API responses aligned with backend shapes. |

---

## Summary

- **Backend**: Production-ready; clear auth, safe SQL, good observability and resilience. Minor improvements: optional Redis rate limit, admin slug validation, and/or startup check for JWT secret.
- **Frontend**: Production-ready; coherent auth flow, sensible data fetching and PWA. Minor improvements: gate or remove polling debug log, consider splitting large match-detail component, and ensure production env vars are set.

No critical or high-severity issues found; both sides are in good shape for deployment and iteration.
