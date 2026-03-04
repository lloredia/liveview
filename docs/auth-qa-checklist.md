# Auth & Gating — QA Checklist

## Critical flows

- [ ] **Logged out → tap Track → modal → sign in → returns → tracked enabled**
  - From home or match page, tap the track (bell) button. Auth gate modal appears. Sign in (e.g. email). After redirect back, tap track again; game is added to tracker and MultiTracker bar appears.

- [ ] **Logged out → go to Tracked tab → redirect to login → returns to Tracked view**
  - On Today view, when logged out, "Tracked" and "Favorites" tabs are visible. Tap "Tracked". Redirect to `/login?callbackUrl=...`. Sign in. After redirect, Today view shows with Tracked filter (empty if no tracked games).

- [ ] **Logged out → favorites attempt → blocked → login → favorite works**
  - Tap favorite (star) on a team or league. Auth gate modal appears. Sign in. Tap star again; favorite is added and appears in sidebar / Favorites tab.

- [ ] **Logout → tracked list becomes locked**
  - While logged in, add 1–2 tracked games. Sign out (e.g. from /account). MultiTracker bar disappears; pinned/tracked state is empty. Tracked tab still visible; selecting it redirects to login.

- [ ] **Capacitor iOS**
  - [ ] Apple login works (if configured).
  - [ ] Google login works (if configured).
  - [ ] Deep link callback works if using system browser flow (see docs/capacitor-oauth.md).
  - [ ] Session persists between app restarts (cookie in WebView).

## Integration checks

- [ ] When logged out, no writes to `lv_pinned_matches`, `lv_favorite_teams`, or `lv_favorite_leagues` in localStorage when tapping track or favorite (gate opens instead).
- [ ] When logged in, toggling track updates backend and MultiTracker; toggling favorite updates backend and sidebar/Favorites tab.
- [ ] GET /api/auth/backend-token returns 401 when not signed in, and returns `{ token }` when signed in.
- [ ] Backend GET /v1/me and GET /v1/user/tracked-games return 401 without `Authorization: Bearer <token>`, and 200 with valid token.

## Manual test (logged out)

1. Open app, ensure not signed in.
2. Tap track on a match → modal "Create a free account to track games" with Apple | Google | Email | Not now.
3. Tap "Not now" → modal closes, no track added.
4. Tap "Tracked" tab (Today view) → redirect to login with callbackUrl.
5. Sign up with email → redirect back to home; tap track again → game is tracked and bar appears.
