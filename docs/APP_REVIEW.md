# LiveView — App Review

**Review date:** March 2025  
**Scope:** Full-stack sports tracker (Next.js 14 frontend, FastAPI backend, PostgreSQL, Redis, PWA/iOS).

**Fixes applied (March 2025):** Security (OAuth/JWT secret handling), removal of debug/agent log code, production-gated console logs, favorites.ts using session-backed token, error-boundary logging, aria-live for live scores/ticker, phase sync derived from MatchPhase enum, configurable news fetch interval (`LV_NEWS_FETCH_INTERVAL_S`).

---

## 1. Executive Summary

**LiveView** is a production-oriented real-time sports tracker with live scores, match timelines, league standings, and news. The architecture is clear (ingest → Redis → builder → PostgreSQL, API + WebSocket), and the codebase shows solid engineering: async Python, ETag caching, circuit breakers, and a well-documented README. The app is suitable for production with a few security, cleanup, and UX improvements recommended below.

| Area | Rating | Notes |
|------|--------|--------|
| **Architecture** | ⭐⭐⭐⭐⭐ | Clear separation: ingest, builder, API, scheduler; Redis + PG; good docs |
| **Backend** | ⭐⭐⭐⭐ | FastAPI, async, circuit breaker, fallback providers; some debug code to remove |
| **Frontend** | ⭐⭐⭐⭐ | Next.js 14 App Router, PWA, auth, offline; consistent theming |
| **Security** | ⭐⭐⭐ | Secrets via env; OAuth secret header; one fallback to empty secret |
| **Testing** | ⭐⭐⭐ | Backend pytest + k6/Locust; frontend Jest; no E2E mentioned |
| **Accessibility** | ⭐⭐⭐ | Skip link, some aria; could standardize and add more |
| **DevEx / Ops** | ⭐⭐⭐⭐ | Runbooks, env examples, migrations, Docker |

---

## 2. What’s Working Well

### Architecture & design
- **Microservices**: API, ingest, scheduler, builder with `SERVICE_TYPE` and single Docker image.
- **Data flow**: ESPN (and optional fallbacks) → ingest → Redis → builder → PostgreSQL; API reads from DB and Redis cache.
- **Live updates**: 15s ESPN refresh loop, phase sync, circuit breaker, TheSportsDB fallback.
- **Caching**: ETag/If-None-Match, Redis today cache, PWA service worker (NetworkFirst for API, CacheFirst for logos/fonts).

### Backend
- **FastAPI**: Async throughout, lifespan for startup/shutdown, background tasks (phase sync, live refresh, news fetch).
- **Resilience**: Circuit breaker for ESPN, retries, fallback provider, connection retry with backoff.
- **Auth**: Email/password (bcrypt), NextAuth Credentials + OAuth (Apple/Google), JWT for backend; `auth/deps.py` for Bearer validation.
- **Observability**: Structured logging, metrics (Prometheus), `/health`, `/ready`, `/v1/status`.

### Frontend
- **Next.js 14**: App Router, layout, metadata, viewport, theme.
- **UX**: Skip-to-content, error boundary, global error handler, pull-to-refresh, offline banner and offline page.
- **PWA**: Manifest, installable, offline fallback, runtime caching for API and assets.
- **Mobile**: Capacitor for iOS, push (APNs), haptics, safe-area CSS.
- **Auth**: SessionProvider, AuthGate, require-auth flows, backend JWT via `/api/auth/backend-token`.

### Product & docs
- **Features**: Today view, scoreboard, match detail, timeline, stats, news, favorites, pinned/tracked games, push notifications.
- **Docs**: README (architecture, env, API, roadmap), TEST_PLAN, APP_STORE_READINESS, runbooks, env examples.

---

## 3. Issues & Recommendations

### 3.1 Security

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **OAuth secret fallback** | `backend/api/routes/auth_routes.py`: `OAUTH_SECRET = os.environ.get("OAUTH_ENSURE_SECRET") or os.environ.get("NEXTAUTH_SECRET") or ""` | If `OAUTH_SECRET` is empty, `_require_oauth_secret` still rejects (header won’t match). Prefer failing fast in production: require non-empty `OAUTH_ENSURE_SECRET` (or `NEXTAUTH_SECRET`) when OAuth is enabled and reject startup or 401 with a clear message. |
| **Backend JWT secret** | `frontend/app/api/auth/backend-token/route.ts`: `SECRET = process.env.NEXTAUTH_SECRET \|\| process.env.AUTH_SECRET` | Ensure both are never empty in production; consider validating at build or startup. |
| **Secrets in env only** | Various | No hardcoded secrets found. Keep using env (and secret managers in prod); document required vars in one place (e.g. README + `.env.example`). |

### 3.2 Code quality & cleanup

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Debug / agent log code** | `backend/api/app.py`: `_debug_log`, `DEBUG-38b46f`, writing to `debug-38b46f.log`; `backend/api/routes/today.py`: same pattern | Remove or guard behind a config flag (e.g. `LV_DEBUG_AGENT=1`) and do not write to local files in production. |
| **Duplicate / redundant code** | `backend/api/routes/leagues.py` and `backend/api/routes/today.py` (paths with backslashes in glob) | Single canonical version; remove duplicates if any. |
| **Readiness probe** | `app.py` `/ready`: uses `get_redis()` and `get_db()` without `Depends()` | Works as-is (returns managers). Optional: use `Depends(get_redis)` and `Depends(get_db)` for consistency and testability. |

### 3.3 Frontend

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Console logging** | `push-notifications.ts`, `capacitor-push.ts`, `global-error-handler.tsx` | Keep minimal logging in production (e.g. gate behind `NODE_ENV` or a debug flag); avoid logging tokens (even truncated) in production. |
| **localStorage token** | `frontend/lib/favorites.ts`: `localStorage.getItem("lv_token")` | Confirm this path is unused or legacy; app uses NextAuth session + backend JWT from `/api/auth/backend-token`. If unused, remove to avoid confusion. |
| **Error boundary** | `error-boundary.tsx`: no `componentDidCatch` logging | Add logging (e.g. to backend or client logger) when `getDerivedStateFromError` runs, to aid support and debugging. |

### 3.4 Accessibility & UX

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Consistency** | Many components use `aria-*` or `role=` (e.g. login, match-card, sidebar); not all interactive elements are consistently labeled | Audit interactive elements (buttons, links, form controls) and ensure visible labels or `aria-label` / `aria-labelledby` where needed. |
| **Focus & keyboard** | Not fully audited | Ensure modals (e.g. GlassModalSheet) trap focus and restore it on close; key shortcuts (e.g. Cmd+K search) are documented or discoverable. |
| **Live regions** | Score updates, live ticker | Consider `aria-live="polite"` for score changes and ticker so screen readers announce updates. |

### 3.5 Testing & reliability

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **E2E** | Not found | Add a small E2E suite (e.g. Playwright) for critical paths: load home, open match, login (or mock), offline page. |
| **Frontend tests** | Jest in `__tests__/` (api, utils, game-clock, news, favorites, etc.) | Keep coverage for new features; add tests for auth flows (e.g. require-auth, backend-token) if not already covered. |
| **Backend** | pytest (scheduler, WS fanout); load tests (k6, Locust) | Document how to run with/without Redis; consider running integration tests in CI. |

### 3.6 Operations & configuration

| Issue | Location | Recommendation |
|-------|----------|----------------|
| **Env documentation** | `.env.example` in backend and frontend; README table | Single source of truth (e.g. README or dedicated ENV.md) listing every variable, which service uses it, and whether it’s required. |
| **Phase sync fallback** | `phase_sync_loop`: hardcoded `'live', 'scheduled', ...` list | Consider deriving from `MatchPhase` enum so new phases are not missed. |
| **News fetch** | `news_fetch_loop`: fixed 5 min interval | Consider making interval configurable (e.g. `LV_NEWS_FETCH_INTERVAL_S`). |

---

## 4. Positive Highlights

- **README**: Architecture diagrams (Mermaid), data flow, deployment, env table, API reference, roadmap — very helpful for onboarding and ops.
- **Offline-first**: PWA with offline page and cache strategies; offline banner and “last updated” messaging.
- **Provider attribution**: “Scores powered by ESPN” and provider attribution component support transparency and compliance.
- **App Store readiness**: docs/APP_STORE_READINESS and APP_STORE_MD cover push, env, splash, icon, testing checklist, and privacy alignment.
- **Theme**: Dark (and light) theme with CSS variables and glass-style components; consistent accent colors and typography (Outfit, JetBrains Mono).

---

## 5. Checklist Summary

| Category | Action |
|----------|--------|
| **Security** | Require non-empty OAuth/JWT secrets in production; avoid logging tokens. |
| **Cleanup** | Remove or feature-flag `_debug_log` and `debug-38b46f.log`; resolve duplicate route files. |
| **Frontend** | Reduce console logs in prod; remove or clarify `lv_token` in favorites; add error-boundary logging. |
| **A11y** | Audit labels and focus; add `aria-live` for live score/ticker updates. |
| **Testing** | Add E2E for main flows; document CI for backend + frontend tests. |
| **Config** | Centralize env documentation; consider configurable news interval and phase list. |

---

## 6. Conclusion

LiveView is a strong, production-ready sports tracker with a clear architecture, good use of caching and resilience patterns, and solid documentation. The main follow-ups are: (1) remove or guard debug/agent logging, (2) tighten OAuth/JWT secret handling and logging in production, (3) standardize accessibility and (4) add E2E tests and centralize env docs. Addressing these will improve maintainability, security, and inclusivity without changing the overall design.
