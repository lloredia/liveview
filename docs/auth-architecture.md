# Auth Architecture

## Overview

- **Frontend**: Auth.js (NextAuth v5) with JWT sessions, Apple/Google/Credentials providers.
- **Backend**: FastAPI; user-scoped endpoints require `Authorization: Bearer <jwt>`.
- **Token**: Same secret (`NEXTAUTH_SECRET` / `AUTH_JWT_SECRET`) used by NextAuth to sign the session and by the backend to verify the JWT.

## Flow

1. User signs in via NextAuth (Apple, Google, or email/password). NextAuth issues a JWT stored in an httpOnly cookie.
2. For API calls to the **backend**, the frontend needs a JWT the backend can verify:
   - The frontend calls **GET /api/auth/backend-token** (with credentials). The Next.js API route uses the current session, builds a JWT with `sub = session.user.id` and the same secret, and returns `{ token }`.
   - The frontend (or a fetch wrapper) sends `Authorization: Bearer <token>` on requests to the backend.
3. Backend dependencies (e.g. `get_current_user_id`) decode the JWT with the shared secret and return the user id (UUID). User-scoped data is keyed by this id.

## Why not only cookie?

The backend runs on a different origin (e.g. Railway) than the frontend (e.g. Vercel). The NextAuth cookie is not sent to the backend. So we use a **backend token** issued by the Next.js API route (which can read the session cookie) and send that token in the `Authorization` header to the backend.

## Data model (backend)

- **users** — id (UUID), email, name.
- **auth_identities** — OAuth provider + provider_account_id → user_id (for future Apple/Google linking).
- **password_credentials** — user_id, email, password_hash (for email/password).
- **user_tracked_games** — user_id, game_id, notify_flags, etc.
- **user_favorites** — user_id, favorite_type (league/team), target_id.
- **user_notification_prefs** — user_id, sound_enabled, quiet_hours, etc.
- **user_saved_articles** — user_id, article_id (for news “save for later”).

When the user is logged in, the frontend uses these endpoints and does **not** write tracking/favorites to localStorage. When logged out, the UI shows empty lists and gates actions (modal or redirect to login).
