# APNs Setup — LiveView iOS Push Notifications

This guide covers Apple Push Notification service (APNs) setup for the LiveView iOS app: Apple Developer portal, environment variables, Railway secrets, and TestFlight testing.

---

## 1. Apple Developer Portal

### 1.1 App ID (Bundle Identifier)

1. Go to [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. Create or select an **App ID** (e.g. `com.liveview.tracker`).
3. Ensure **Push Notifications** is enabled in the capabilities list.
4. The **Bundle ID** must match the iOS app’s **Bundle Identifier** in Xcode exactly (case-sensitive).

### 1.2 APNs Authentication Key (.p8)

1. Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list).
2. Click **+** to create a new key.
3. Name it (e.g. “LiveView APNs”).
4. Enable **Apple Push Notifications service (APNs)**.
5. Continue and **Register**, then **Download** the `.p8` file.
   - You can download it only once; store it securely.
6. Note:
   - **Key ID** (10 characters), e.g. `AB12CD34EF`
   - **Team ID** (Membership details)
   - **Bundle ID** (same as your App ID)

### 1.3 Encode the .p8 file

```bash
base64 -i AuthKey_XXXXXXXXXX.p8 | tr -d '\n' > apns_key_base64.txt
```

Use the contents of `apns_key_base64.txt` as the private key value in your backend env (see below).

---

## 2. iOS Project (Xcode)

### 2.1 Bundle Identifier

1. Open the iOS app in Xcode: `frontend/ios/App/App.xcworkspace`.
2. Select the **App** target → **Signing & Capabilities**.
3. Set **Bundle Identifier** to match the App ID exactly (e.g. `com.liveview.tracker`).

### 2.2 Capabilities

1. In the same target, click **+ Capability**.
2. Add **Push Notifications**.
3. Add **Background Modes** and check **Remote notifications**.

These ensure the app can receive pushes and wake for notification handling (including cold start).

### 2.3 Provisioning

- Use an **Apple Development** or **App Store** provisioning profile that includes the Push Notifications entitlement.
- For TestFlight, use **Distribution** (App Store) or **Development** for device testing.

---

## 3. Backend Environment Variables

The backend uses the new **APNS_*** variables (with fallback to **LV_APNS_*** for backward compatibility).

| Variable | Required | Description |
|----------|----------|-------------|
| `APNS_TEAM_ID` | Yes | Apple Team ID (Membership). |
| `APNS_KEY_ID` | Yes | 10-character key ID from the APNs key. |
| `APNS_BUNDLE_ID` | Yes | App Bundle ID (e.g. `com.liveview.tracker`). Must match Xcode. |
| `APNS_P8_PRIVATE_KEY_BASE64` | Yes | Base64-encoded contents of the `.p8` file (no newlines). |
| `APNS_USE_SANDBOX` | No | `true` for TestFlight/development, `false` for production. Default: `true`. |

### Legacy (still supported)

- `LV_APNS_TEAM_ID`, `LV_APNS_KEY_ID`, `LV_APNS_BUNDLE_ID`, `LV_APNS_P8_PRIVATE_KEY` (or `LV_APNS_P8_PRIVATE_KEY`), `LV_APNS_USE_SANDBOX`.

---

## 4. Railway Secrets

1. In the Railway project, open **Variables** (or **Secrets**).
2. Add:

   - `APNS_TEAM_ID` = your Team ID  
   - `APNS_KEY_ID` = your Key ID  
   - `APNS_BUNDLE_ID` = `com.liveview.tracker` (or your Bundle ID)  
   - `APNS_P8_PRIVATE_KEY_BASE64` = output of `base64 -i AuthKey_XXX.p8` (single line)  
   - `APNS_USE_SANDBOX` = `true` for TestFlight, `false` for production App Store  

3. Redeploy the backend so the new variables are applied.

---

## 5. Flow Summary

- **Frontend (Capacitor):** On first user interaction, requests push permission, registers for remote notifications, receives APNs token, then `POST /v1/devices/register` (if needed) and `POST /v1/notifications/ios/register-token` with `device_id`, `apns_token`, `bundle_id`.
- **Device ID:** Generated once (UUID), stored in **localStorage** (web) or **Capacitor Preferences** (iOS), and used in all notification/tracking calls.
- **Backend:** Stores tokens in `ios_push_tokens`; when the polling loop detects events (game start, lead change, final, OT), it dedupes by `(device_id, game_id, event_type, score_hash)`, rate-limits, and sends via `notifications.apns.send_apns_notification`. Invalid tokens (e.g. BadDeviceToken, Unregistered) are removed.
- **Payload:** `title`, `body`, and `data: { url: "/match/{gameId}", gameId }` for deep linking.
- **Deep link:** On notification tap (including cold start), the app routes the WebView to `data.url` (e.g. `/match/{id}`).

---

## 6. TestFlight Testing Checklist

- [ ] **Bundle ID** in Xcode matches App ID and backend `APNS_BUNDLE_ID`.
- [ ] **Push Notifications** and **Background Modes → Remote notifications** enabled in Xcode.
- [ ] Backend env has all `APNS_*` (or `LV_APNS_*`) variables; `APNS_USE_SANDBOX=true` for TestFlight.
- [ ] Install the app from TestFlight; open app and trigger first interaction (tap) to request permission and register token.
- [ ] In backend/DB, confirm device and `ios_push_tokens` row for the device.
- [ ] Track a game (pin a match); trigger an event (e.g. score change or final) and confirm a push is received.
- [ ] **Cold start:** Force-quit app, send a push, tap the notification → app opens and navigates to the match (e.g. `/match/{id}`).
- [ ] **Warm:** App in background, tap notification → app comes to foreground and opens the match.
- [ ] No duplicate notifications for the same event (dedupe/rate limit working).

---

## 7. Troubleshooting

- **No push received:** Check Railway logs for `apns_sent` / `apns_failed` / `apns_token_invalid`. Confirm token is registered and `APNS_USE_SANDBOX` matches the build (TestFlight = sandbox).
- **Invalid token / 410:** Token was unregistered (e.g. app reinstall). Backend removes it; user must reopen app and re-grant permission to get a new token.
- **Deep link not opening:** Ensure the push payload includes `data: { url: "/match/{gameId}", gameId }` and that the app registers the push action listener on load (see `registerPushActionListener` in `lib/capacitor-push.ts`).

---

## 8. References

- Backend APNs module: `backend/notifications/apns.py`
- Dispatcher (dedupe, rate limit, send): `backend/notifications/dispatcher.py`
- Frontend push init & deep link: `frontend/lib/capacitor-push.ts`
- Device identity: `frontend/lib/device.ts`
- Full notification system: `docs/notifications.md`
