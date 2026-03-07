# Auth Setup (NextAuth + Backend)

LiveView uses **Auth.js (NextAuth v5)** in the Next.js app with JWT sessions. The backend validates the same JWT for user-scoped APIs.

## Frontend (Next.js)

### Environment variables

In `frontend/.env.local`:

```env
# Required for NextAuth
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<generate with: openssl rand -base64 32>

# Backend (for Credentials provider and API)
NEXT_PUBLIC_API_URL=http://localhost:8000

# OAuth (optional — omit to hide buttons). See docs/oauth-setup.md for step-by-step.
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
APPLE_ID=...
APPLE_SECRET=...
```

- **NEXTAUTH_SECRET**: Must match the backend `AUTH_JWT_SECRET` (or `NEXTAUTH_SECRET`) so the backend can verify JWTs.
- **NEXTAUTH_URL**: In production set to your app URL (e.g. `https://yourapp.com`).

### Routes

- **/login** — Sign in (Apple, Google, Email).
- **/signup** — Email/password registration (calls backend `POST /v1/auth/register`).
- **/account** — Account info and sign out (requires auth).

### Session

- Strategy: **JWT** (stateless, httpOnly cookie).
- Backend token: frontend calls `GET /api/auth/backend-token` to get a short-lived JWT to send as `Authorization: Bearer <token>` to the backend.

## Backend (FastAPI)

### Environment variables

- **AUTH_JWT_SECRET** or **NEXTAUTH_SECRET**: Same value as frontend `NEXTAUTH_SECRET`. Used to verify `Authorization: Bearer <jwt>`.
- Database: run migration `006_auth_users.sql` to create `users`, `auth_identities`, `password_credentials`, `user_tracked_games`, `user_favorites`, `user_notification_prefs`, `user_saved_articles`.

### Endpoints

- **POST /v1/auth/register** — Email/password signup (no auth).
- **POST /v1/auth/login** — Email/password login; returns user for NextAuth Credentials (no auth).
- **POST /v1/auth/oauth-ensure** — Get-or-create user for OAuth (Google/Apple). Called by the NextAuth server only; requires header `X-OAuth-Secret: <NEXTAUTH_SECRET>` (or set `OAUTH_ENSURE_SECRET` on the backend). Creates/links `auth_identities` and returns user `id` so the JWT `sub` matches the backend user.
- **GET /v1/me** — Current user (requires `Authorization: Bearer <jwt>`).
- **GET/POST/DELETE /v1/user/tracked-games** — User tracked games (requires auth).
- **GET/POST/DELETE /v1/user/favorites** — User favorites (requires auth).
- **GET/POST /v1/user/notification-prefs** — Notification preferences (requires auth).

## Gating

- Track match, favorites (teams/leagues), notification settings, and saved items are **hard gated**: unauthenticated users see a modal (or redirect to login) and never write to local storage for these features.
- Browsing scores, news, and match center remains free without login.
