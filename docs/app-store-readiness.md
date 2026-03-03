# App Store Readiness — LiveView iOS

Checklist and instructions for submitting LiveView to the App Store (TestFlight and production).

---

## 1. Push Notifications (APNs)

### Frontend (Capacitor)

- **Plugin**: `@capacitor/push-notifications` (v6 for Capacitor 6)
- **Permission**: Requested on **first user interaction** (not on launch), via `PushOnFirstInteraction` in root layout.
- **Token**: Sent to backend `POST /v1/notifications/ios/register-token` with `device_id`, `apns_token`, `bundle_id`.
- **Deep link**: Tap opens `/match/{gameId}` (backend sends `data.url: "/match/{id}"`).

### Backend

- **Endpoint**: `POST /v1/notifications/ios/register-token`
- **Events sent**: Game start, lead change, final, overtime start (see `notifications/engine.py`).
- **Dedupe**: `notification_log` table; rate limiting in engine.

### APNs Key Setup

1. **Apple Developer → Keys** → Create key with **Apple Push Notifications service (APNs)** enabled.
2. Download the `.p8` file (once only).
3. Encode and set in backend env (e.g. Railway):
   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8
   ```
   - `LV_APNS_KEY_ID` — Key ID (10 chars)
   - `LV_APNS_TEAM_ID` — Team ID (Membership)
   - `LV_APNS_BUNDLE_ID` — `com.liveview.tracker`
   - `LV_APNS_P8_PRIVATE_KEY` — base64-encoded `.p8` contents

### Xcode

- **Signing & Capabilities** → **Push Notifications** (and **Background Modes** → Remote notifications if needed).
- No duplicate pushes: backend dedupes by event + device.

---

## 2. Required Environment Variables

### Frontend (build / runtime)

| Variable | Purpose |
|---------|--------|
| `NEXT_PUBLIC_APP_URL` | Deployed app URL (e.g. Vercel) — Capacitor loads this in the WebView |
| `NEXT_PUBLIC_API_URL` | Backend API base (e.g. Railway) |

### Backend (Railway / production)

| Variable | Purpose |
|---------|--------|
| `LV_APNS_KEY_ID` | APNs key ID |
| `LV_APNS_TEAM_ID` | Apple Team ID |
| `LV_APNS_BUNDLE_ID` | `com.liveview.tracker` |
| `LV_APNS_P8_PRIVATE_KEY` | Base64-encoded `.p8` file |

See `docs/notifications.md` for full list (VAPID, database, etc.).

---

## 3. Splash Screen & App Icon

- **Capacitor**: `capacitor.config.ts` includes `plugins.SplashScreen` (background `#111118`, no white flash).
- **iOS**: Add splash and app icon assets in Xcode (`App/App/Assets.xcassets`).
  - **App Icon**: All required sizes (e.g. 1024×1024, 180×180, 120×120, etc.).
  - **Splash**: Use a centered LiveView logo; background matches app theme (`#111118`).
- **Dark appearance**: Set in Info.plist / asset catalog so splash and chrome are consistent in dark mode.

---

## 4. Testing Checklist

- [ ] **Push**: First launch → interact (tap) → permission prompt → grant → token registered; tap notification → opens `/match/{id}`.
- [ ] **Offline**: Airplane mode → "Offline — showing last updated data" banner; cached scoreboard; Retry when back online.
- [ ] **Pull-to-refresh**: Main scoreboard, News, Match center — native-style spinner, no broken scroll.
- [ ] **Favorites**: Star a team → filter "Favorites" shows only those games; games with favorite team highlighted.
- [ ] **Tracked**: Pin a match → filter "Tracked" and tracker bar; push for that game when events fire.
- [ ] **Last updated**: Under live groups shows "Updated Xs ago" and ticks every 10s; hidden when FINAL.
- [ ] **Haptics**: Track toggle, favorite league/team, pull-to-refresh, notification permission granted (subtle).
- [ ] **Slow 3G**: No infinite spinners; timeouts show error/retry; cached data when available.
- [ ] **Background**: App in background 10+ minutes → resume → data refetches; no crash.
- [ ] **No console errors**: Safari Web Inspector attached; no unhandled rejections or hydration warnings.

---

## 5. Privacy Declaration Alignment

- **No login, no ads, no analytics**: Declare in App Store Connect.
- **Push**: Optional; explain in app (e.g. "Get alerts for tracked games") and in Privacy Policy.
- **Data stored locally**: Favorites, pinned matches, theme — no server account.
- **Provider attribution**: "Scores powered by ESPN" in app (footer, match center, privacy/support).

---

## 6. Build & Archive

1. **Frontend**: Build and deploy to Vercel (or set `NEXT_PUBLIC_APP_URL` for Capacitor).
2. **Capacitor**:
   ```bash
   cd frontend
   npx cap sync ios
   ```
3. **Xcode**: Open `ios/App/App.xcworkspace`.
   - Select **Any iOS Device** (or a connected device).
   - **Product → Archive**.
4. **Signing**: Ensure Team and provisioning profile are set; Push and Background Modes enabled.

---

## 7. TestFlight Submission

- [ ] Archive uploaded from Xcode (Organizer → Distribute App → App Store Connect).
- [ ] Build appears in App Store Connect → TestFlight.
- [ ] Add "What to Test" notes (push, offline, favorites, haptics).
- [ ] Internal/External testing groups; submit for Beta Review if needed.
- [ ] Confirm push works with production/TestFlight build (APNs env vars point to same backend).

---

## 8. Stability & Error Handling

- **Global error boundary**: Root layout wraps app in `ErrorBoundary`; fallback UI and "Try again".
- **Unhandled rejections**: `GlobalErrorHandler` logs to console (Safari Web Inspector).
- **API timeouts**: `API_REQUEST_TIMEOUT_MS` (25s); failed requests show error state and retry.
- **Offline**: `navigator.onLine`; cached today/scoreboard; no infinite spinners; Retry when back online.

---

## 9. Quick Reference

| Item | Location |
|------|----------|
| Push init (first interaction) | `components/push-on-first-interaction.tsx` |
| APNs token registration | `lib/capacitor-push.ts` |
| Backend register-token | `backend/api/routes/notifications.py` |
| Push delivery (APNs) | `backend/notifications/deliver_apns.py` |
| Event types (start, lead, final, OT) | `backend/notifications/engine.py` |
| Favorites (teams) | `lib/favorite-teams.ts` |
| Offline banner | `components/offline-banner.tsx` |
| Provider attribution | `components/provider-attribution.tsx` |
| Full notification setup | `docs/notifications.md` |
