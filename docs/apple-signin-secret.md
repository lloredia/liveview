# Sign in with Apple client secret (APPLE_SECRET)

NextAuth expects **APPLE_SECRET** to be a **signed JWT** (not the raw .p8 key). That JWT is generated with:

- **Algorithm:** ES256  
- **Header:** `kid` = Key ID, `alg` = ES256  
- **Claims:** `iss` = Team ID, `iat` = now, `exp` = now + 180 days, `aud` = `https://appleid.apple.com`, `sub` = Client ID (Services ID)

You need:

- **APPLE_TEAM_ID** — Apple Developer Team ID  
- **APPLE_CLIENT_ID** — Services ID (e.g. `com.liveview.tracker.web`)  
- **APPLE_KEY_ID** — Key ID of the .p8 key (e.g. `YDAZG73YR9`)  
- **APPLE_PRIVATE_KEY** — Full contents of the .p8 file (PEM), or **APPLE_PRIVATE_KEY_PATH** — path to the .p8 file  

## Option 1: Node (frontend)

From repo root:

```bash
cd frontend
export APPLE_TEAM_ID="<your_team_id>"
export APPLE_CLIENT_ID="com.liveview.tracker.web"
export APPLE_KEY_ID="YDAZG73YR9"
export APPLE_PRIVATE_KEY_PATH="/path/to/AuthKey_YDAZG73YR9.p8"
# Or: export APPLE_PRIVATE_KEY="$(cat /path/to/AuthKey_YDAZG73YR9.p8)"
npm run gen:apple-secret
```

Copy the printed JWT and set it as **APPLE_SECRET** in Vercel (and **APPLE_ID** = `com.liveview.tracker.web`).

## Option 2: Python (backend)

From repo root:

```bash
cd backend
export APPLE_TEAM_ID="<your_team_id>"
export APPLE_CLIENT_ID="com.liveview.tracker.web"
export APPLE_KEY_ID="YDAZG73YR9"
export APPLE_PRIVATE_KEY_PATH="/path/to/AuthKey_YDAZG73YR9.p8"
python scripts/gen_apple_secret.py
```

Copy the printed JWT and use it as **APPLE_SECRET**.

## Renewal

The JWT expires in **180 days**. Regenerate it before expiry and update **APPLE_SECRET** in your hosting env (e.g. Vercel).
