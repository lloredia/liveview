# Capacitor OAuth (iOS)

OAuth in the Capacitor iOS app can be done in two ways.

## Option A: In-app WebView (recommended for same-origin)

If the app loads your Next.js app in the Capacitor WebView (e.g. `https://yourapp.com` or a local URL):

1. User taps "Continue with Apple" or "Continue with Google" on `/login`.
2. NextAuth redirects to the provider; the **same WebView** follows redirects.
3. Callback lands on your origin; the session cookie is set in the WebView.
4. No extra steps: session works immediately after redirect.

**Requirements**: Use an HTTPS URL for the app in production so cookies and redirects work. In development you can use a tunnel (e.g. ngrok) or load a dev build that points to your staging URL.

## Option B: System browser + deep link

If you open the provider in the **system browser** (e.g. for App Store review or to avoid WebView restrictions):

1. Configure a custom URL scheme, e.g. `liveview://auth-callback`.
2. After OAuth, redirect the user to a page on your domain that:
   - Reads the session (e.g. via `getSession()` or a server route that has access to the cookie).
   - Redirects to `liveview://auth-callback?token=<jwt>` so the app receives the token.
3. The Capacitor app registers a handler for `liveview://auth-callback`, receives the token, and stores it (e.g. in Capacitor Preferences or passes it into the WebView).
4. The WebView or native layer must then send `Authorization: Bearer <token>` to your backend. The Next.js app would need to accept this token (e.g. via a query param or injected cookie) so that `useSession()` sees the user as logged in — this requires a custom flow (e.g. a route that sets the session from the token).

**Recommendation**: Prefer Option A (in-app WebView) so the existing NextAuth cookie flow works without extra token handling. Use Option B only if you must use the system browser.

## Custom URL scheme (if using Option B)

In `frontend/ios/App/App/Info.plist` (or via Xcode):

- Add URL Types → URL Scheme: `liveview`, Identifier: e.g. `com.liveview.tracker`.

In your Next.js app, the redirect URL after OAuth would point to a route that redirects to `liveview://auth-callback?token=...` (token from your backend or from NextAuth’s session).
