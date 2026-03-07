# OAuth Setup (Google & Apple)

This guide walks you through enabling **Sign in with Google** and **Sign in with Apple** so the login page works end-to-end.

## Prerequisites

- **Backend** and **frontend** both have matching `NEXTAUTH_SECRET` (and backend has it set as `NEXTAUTH_SECRET` or `AUTH_JWT_SECRET` / `OAUTH_ENSURE_SECRET`).
- **Frontend** has `NEXTAUTH_URL` set to your app’s full URL (e.g. `https://yourapp.com` or `http://localhost:3000` for local).
- Auth migrations applied: `006_auth_users.sql` (creates `users`, `auth_identities`, etc.).

---

## Google

### 1. Create OAuth credentials

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Go to **APIs & Services → Credentials**.
3. Click **Create Credentials → OAuth client ID**.
4. If prompted, configure the **OAuth consent screen** (e.g. External, app name, support email).
5. Application type: **Web application**.
6. Name: e.g. **LiveView Web**.
7. **Authorized redirect URIs** — add:
   - Local: `http://localhost:3000/api/auth/callback/google`
   - Production: `https://<your-domain>/api/auth/callback/google`
8. Create. Copy the **Client ID** and **Client secret**.

### 2. Set environment variables (frontend)

In `frontend/.env.local`:

```env
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxx
```

Restart the Next.js dev server. The “Continue with Google” button will use these; after sign-in, NextAuth calls your backend `POST /v1/auth/oauth-ensure` so the user is created/linked in your DB.

---

## Apple (Sign in with Apple)

Apple does **not** allow `http://localhost` for Sign in with Apple. Use an HTTPS URL (e.g. ngrok, or your deployed app).

### 1. Create an App ID and Services ID

1. Go to [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list).
2. **App IDs**: Create an App ID (e.g. for your iOS app) if you don’t have one. Note your **Team ID** and **Bundle ID**.
3. **Identifiers** → **+** → **Services IDs** → Continue.
4. Description: e.g. **LiveView Web**. Identifier: e.g. `com.liveview.tracker.web` (this is your **Services ID** = `APPLE_ID` for NextAuth).
5. Enable **Sign in with Apple**, click **Configure**:
   - **Primary App ID**: select your App ID.
   - **Domains and Subdomains**: your domain (e.g. `yourapp.com` or ngrok host).
   - **Return URLs**: add `https://<your-domain>/api/auth/callback/apple` (and for ngrok, `https://xxxx.ngrok.io/api/auth/callback/apple`).
6. Save, then register the Services ID.

### 2. Create a Sign in with Apple key

1. Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list).
2. **+** to create a key. Name: e.g. **LiveView Sign in with Apple**.
3. Enable **Sign in with Apple**, click **Configure**, choose your primary App ID.
4. Continue, register, then **download the .p8 key** (only once). Note the **Key ID**.

### 3. Generate the client secret (JWT)

Apple’s “client secret” is a **signed JWT**, not a static string. You can generate it with the project script.

In `frontend/`, set (in `.env.local` or a one-off export):

```env
APPLE_TEAM_ID=XXXXXXXXXX
APPLE_CLIENT_ID=com.liveview.tracker.web
APPLE_KEY_ID=XXXXXXXXXX
APPLE_PRIVATE_KEY_PATH=./AuthKey_XXXXXXXXXX.p8
```

Or set `APPLE_PRIVATE_KEY` to the **contents** of the .p8 file (PEM string; escape newlines as `\n` if needed).

Run:

```bash
cd frontend && npm run gen:apple-secret
```

The script prints a JWT. **Use that as `APPLE_SECRET`** in `frontend/.env.local`:

```env
APPLE_ID=com.liveview.tracker.web
APPLE_SECRET=<paste the JWT from gen:apple-secret>
```

This JWT expires in **180 days**. Regenerate with `npm run gen:apple-secret` and update `APPLE_SECRET` (and redeploy if needed).

### 4. Test

- Use an **HTTPS** URL for `NEXTAUTH_URL` (e.g. ngrok or production).
- Open `/login`, click “Continue with Apple”, and complete the flow. The backend `oauth-ensure` will create or link the user.

---

## Backend: OAuth secret

So that only your NextAuth server can call the backend’s OAuth get-or-create endpoint:

- Set **backend** `NEXTAUTH_SECRET` (or `OAUTH_ENSURE_SECRET`) to the **same** value as the frontend’s `NEXTAUTH_SECRET`.
- NextAuth sends this in the `X-OAuth-Secret` header when calling `POST /v1/auth/oauth-ensure`. The backend rejects the request if the header is missing or wrong.

---

## Checklist

| Step | Google | Apple |
|------|--------|--------|
| Create OAuth client / Services ID | ✅ Console | ✅ Developer |
| Redirect URI | `{NEXTAUTH_URL}/api/auth/callback/google` | `{NEXTAUTH_URL}/api/auth/callback/apple` |
| Frontend env | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `APPLE_ID`, `APPLE_SECRET` (JWT from script) |
| Backend env | `NEXTAUTH_SECRET` (for JWT + oauth-ensure) | Same |
| HTTPS for Apple | Not required | **Required** (no localhost) |

If you need access to a specific dashboard (e.g. Google Cloud project or Apple Developer team), say what you have and we can adapt the steps.
