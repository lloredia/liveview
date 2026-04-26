# LiveView

Real-time sports scoreboard and news for iOS. An Expo / React Native app backed by a FastAPI service that pulls from ESPN, deduplicates, and dispatches push notifications on score changes.

## Architecture

```
┌────────────────┐        ┌─────────────────┐        ┌──────────────┐
│  iOS app       │  HTTPS │  FastAPI        │  HTTPS │  ESPN APIs   │
│  (mobile/)     │ ─────▶ │  (backend/)     │ ─────▶ │  + others    │
│  Expo SDK 55   │        │  + Postgres     │        └──────────────┘
│  expo-router   │        │  + Redis cache  │
│  expo-notifs   │ ◀───── │  APNs sender    │
└────────────────┘  push  └─────────────────┘
```

- **mobile/** — Expo iOS app. Tabs: Scoreboard, News, Account. Includes search, league directory, match detail, favorites, theme picker, and APNs registration.
- **backend/** — FastAPI service. Routes under `/v1/*` for today's matches, news, leagues, match detail, auth, devices, and notifications. APNs delivery via token auth (`.p8`).
- **docs/** — operational runbooks, App Store submission notes, auth setup, APNs setup.
- **scripts/** — load testing (k6, Locust), screenshot generation.

## Getting started

### Backend (FastAPI)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Required env vars
export LV_DATABASE_URL="postgresql+asyncpg://liveview:liveview@localhost:5432/liveview"
export LV_REDIS_URL="redis://localhost:6379/0"

# Optional (for push)
export APNS_TEAM_ID=...
export APNS_KEY_ID=...
export APNS_BUNDLE_ID=com.lloredia.liveview
export APNS_P8_PRIVATE_KEY_BASE64=$(base64 -i AuthKey_XXX.p8 | tr -d '\n')
export APNS_USE_SANDBOX=true   # false for TestFlight + App Store

uvicorn api.app:app --reload --port 8000
```

### Mobile (Expo iOS)

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code with Expo Go on a real device or press `i` to launch the iOS simulator.

The mobile client points at the production Railway backend by default — see `mobile/src/api.ts` for the `API_BASE` constant.

## Builds

iOS builds use [EAS Build](https://docs.expo.dev/eas/):

```bash
cd mobile
eas build --profile preview --platform ios     # ad-hoc / internal distribution
eas build --profile production --platform ios  # TestFlight + App Store
```

Profiles live in `mobile/eas.json`. Apple credentials are managed automatically by EAS the first time you build.

Push notifications require a real device archive — push won't fire on simulators or in Expo Go.

## Deployment

**Backend** runs on Railway (`Backend API` service in the `Live View Sport Tracker` project). Deploys auto-trigger on `main`.

```bash
# Inspect / set env vars
railway variables
railway variables --set KEY=value
railway logs
```

**Mobile** is distributed via TestFlight (production profile) or EAS internal links (preview profile).

## Tests

```bash
# Backend (pytest)
cd backend
pytest

# Mobile type check
cd mobile
npx tsc --noEmit
```

CI runs backend tests, mobile type check, lint, and the backend Docker image build on every push to `main`. See `.github/workflows/tests.yml`.

## Key directories

| Path | What it is |
|---|---|
| `mobile/app/` | expo-router file-based routes (tabs, match detail, search, leagues, auth) |
| `mobile/src/` | API client, contexts (auth, preferences), reusable components, theme |
| `backend/api/routes/` | FastAPI route modules (today, matches, leagues, news, auth, notifications) |
| `backend/notifications/` | Event dispatcher, APNs sender, web-push delivery |
| `backend/shared/models/` | SQLAlchemy ORM, Pydantic models, enums |
| `backend/infra/providers/` | ESPN scoreboard fetcher + normalizer |
| `docs/` | Runbooks, App Store notes, APNs setup |
