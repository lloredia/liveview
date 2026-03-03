# LiveView Notification System

Production-grade push notification system supporting Web Push (PWA), iOS APNs (Capacitor), and in-app inbox.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  ESPN / TheSportsDB / Sportradar  (data providers)                 │
└───────────────┬─────────────────────────────────────────────────────┘
                │ HTTP polling every 30s
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  live_score_refresh_loop  (backend/api/app.py)                     │
│  ├─ _apply_espn_events() → detects state changes                  │
│  └─ calls notifications.dispatcher.process_game_update()           │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Notification Engine  (backend/notifications/engine.py)            │
│  ├─ detect_events(prev_state, curr_state)                          │
│  ├─ Filters: notify_flags, quiet_hours, rate limiting              │
│  └─ Dedupe: event_hash + notification_log table                    │
└───────────────┬─────────────────────────────────────────────────────┘
                │
                ▼
┌─────────────────────────────────────────────────────────────────────┐
│  Dispatcher  (backend/notifications/dispatcher.py)                 │
│  ├─ Finds devices tracking the game (tracked_games table)          │
│  ├─ Stores in notification_inbox (always)                          │
│  └─ Delivers via:                                                  │
│     ├─ Web Push (deliver_webpush.py → pywebpush + VAPID)           │
│     └─ APNs (deliver_apns.py → token-based auth)                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Setup

### 1. Database Migration

Run migration 005 to create notification tables:

```bash
cd backend
python run_migration_005.py
```

Tables created:
- `devices` — device registration (web/ios)
- `tracked_games` — per-device game tracking with notification preferences
- `web_push_subscriptions` — browser push subscriptions (VAPID)
- `ios_push_tokens` — APNs device tokens
- `notification_log` — delivery log for deduplication
- `notification_inbox` — in-app notification inbox

### 2. VAPID Keys (Web Push)

Generate VAPID keys for web push:

```bash
npx web-push generate-vapid-keys
```

Set in Railway (or `.env`):

```env
LV_VAPID_PUBLIC_KEY=BPxr4...   # base64url-encoded
LV_VAPID_PRIVATE_KEY=abc123... # base64url-encoded
LV_VAPID_CLAIM_EMAIL=mailto:admin@liveview.app
```

Set the public key for the frontend:

```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BPxr4...  # same as LV_VAPID_PUBLIC_KEY
```

### 3. APNs Setup (iOS Push)

#### Generate Credentials

1. Go to [Apple Developer → Keys](https://developer.apple.com/account/resources/authkeys/list)
2. Create a key with **Apple Push Notifications service (APNs)** enabled
3. Download the `.p8` file
4. Note the Key ID (10 chars) and Team ID (from Membership)

#### Encode & Store

```bash
# Encode the .p8 file
base64 -i AuthKey_XXXXXXXXXX.p8

# Add to Railway secrets:
LV_APNS_KEY_ID=XXXXXXXXXX
LV_APNS_TEAM_ID=YYYYYYYYYY
LV_APNS_BUNDLE_ID=com.liveview.tracker
LV_APNS_P8_PRIVATE_KEY=<base64-encoded .p8 contents>
```

#### Capacitor iOS Setup

```bash
cd frontend
npm install @capacitor/push-notifications
npx cap sync ios
```

In Xcode:
1. Select target → Signing & Capabilities
2. Add **Push Notifications** capability
3. Add **Background Modes** → Remote notifications

### 4. Install Backend Dependencies

```bash
cd backend
pip install pywebpush PyJWT cryptography
```

Or with requirements.txt (already included):
```bash
pip install -r requirements.txt
```

## API Endpoints

### Device Registration

```
POST /v1/devices/register
{
  "platform": "web" | "ios",
  "device_id": "optional-existing-uuid",
  "user_agent": "optional"
}
→ { "device_id": "uuid" }
```

### Game Tracking

```
POST /v1/tracked-games
{
  "device_id": "uuid",
  "game_id": "uuid",
  "sport": "soccer",
  "league": "Premier League",
  "notify_flags": {
    "score": true,
    "lead_change": true,
    "start": true,
    "halftime": false,
    "final": true,
    "ot": true,
    "major_events": true
  }
}

GET /v1/tracked-games?device_id=uuid

DELETE /v1/tracked-games/{game_id}?device_id=uuid
```

### Web Push Subscription

```
POST /v1/notifications/webpush/subscribe
{
  "device_id": "uuid",
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "user_agent": "optional"
}

DELETE /v1/notifications/webpush/unsubscribe
{ "device_id": "uuid", "endpoint": "..." }
```

### iOS Push Token

```
POST /v1/notifications/ios/register-token
{
  "device_id": "uuid",
  "apns_token": "hex-token",
  "bundle_id": "com.liveview.tracker"
}
```

### Notification Inbox

```
GET /v1/notifications/inbox?device_id=uuid&limit=30&cursor=iso-datetime
→ { "items": [...], "unread_count": 5, "cursor": "..." }

POST /v1/notifications/mark-read
{
  "device_id": "uuid",
  "notification_ids": ["uuid1", "uuid2"],  // or
  "mark_all": true
}
```

## Event Types

| Event | Trigger | Priority |
|-------|---------|----------|
| `SCORE_UPDATE` | Score changes while live | Default (High in clutch) |
| `LEAD_CHANGE` | Leading team changes | High |
| `GAME_START` | Phase transitions to live | Default |
| `HALFTIME` | Phase transitions to halftime | Low |
| `OVERTIME_START` | Phase transitions to OT | High |
| `FINAL` | Game finishes | High |
| `MAJOR_EVENT` | Red card, ejection, etc. | High |

## Anti-Spam Controls

### Rate Limiting (Score Updates)
- **Default:** Max 1 per team per 60 seconds per game per device
- **Clutch mode:** Max 1 per 20 seconds when:
  - Basketball: Final quarter/OT, margin ≤ 6
  - Soccer: Second half/ET, margin ≤ 1
  - Hockey: Third period/OT, margin ≤ 1

### Deduplication
- Each event has a deterministic `event_hash` (based on game_id + event_type + score)
- `notification_log` table with unique index on `(device_id, event_hash)`
- Same event is never sent twice to the same device

### Quiet Hours
- Per-device quiet hours config (e.g. `{"start": 22, "end": 7}`)
- During quiet hours: push notifications suppressed, inbox still populated

### Bundling
- Score updates are rate-limited; if multiple occur within the window, only the first passes through
- The inbox always stores all events for later viewing

## Local Testing

### Backend

```bash
cd backend
python -m pytest tests/test_notification_engine.py -v
```

### Manual Test Flow

1. Start backend: `uvicorn api.app:app --reload`
2. Register device: `curl -X POST http://localhost:8000/v1/devices/register -H 'Content-Type: application/json' -d '{"platform":"web"}'`
3. Track a game: `curl -X POST http://localhost:8000/v1/tracked-games -H 'Content-Type: application/json' -d '{"device_id":"<id>","game_id":"<match-uuid>"}'`
4. Check inbox: `curl http://localhost:8000/v1/notifications/inbox?device_id=<id>`

### Frontend

1. Start dev server: `cd frontend && npm run dev`
2. Open browser, allow notifications when prompted
3. Track a live game using the bell icon on match cards
4. When a tracked game's score changes (via backend polling), you should receive:
   - A browser push notification (if VAPID configured)
   - An inbox item (visible via bell icon in header)

### Checklist

- [ ] Track a game → `tracked_games` row created
- [ ] Enable web push → `web_push_subscriptions` row created
- [ ] Score changes → push notification appears
- [ ] Click notification → Match Center opens
- [ ] Inbox shows events with unread badge
- [ ] Quiet hours → push suppressed, inbox populated
- [ ] Untrack game → no more notifications

## Production Rollout

### Railway Environment Variables

```
LV_VAPID_PUBLIC_KEY=<your-key>
LV_VAPID_PRIVATE_KEY=<your-key>
LV_VAPID_CLAIM_EMAIL=mailto:admin@liveview.app

# Optional: APNs (for iOS)
LV_APNS_KEY_ID=<key-id>
LV_APNS_TEAM_ID=<team-id>
LV_APNS_BUNDLE_ID=com.liveview.tracker
LV_APNS_P8_PRIVATE_KEY=<base64-p8>
```

### Vercel Environment Variables

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same-as-backend>
```

### Post-Deploy

1. Run migration: `python run_migration_005.py`
2. Verify: `curl https://your-api.railway.app/v1/devices/register -X POST -H 'Content-Type: application/json' -d '{"platform":"web"}'`
3. Monitor: Check Railway logs for `webpush_sent`, `apns_sent`, `notification_processing_error`

## File Map

### Backend
```
backend/
├── notifications/
│   ├── __init__.py
│   ├── models.py          # ORM models (Device, TrackedGame, WebPushSubscription, etc.)
│   ├── engine.py           # Event detection (detect_events, rate limiting, dedupe)
│   ├── dispatcher.py       # Orchestrates detection → delivery → logging
│   ├── deliver_webpush.py  # Web Push delivery via pywebpush + VAPID
│   └── deliver_apns.py     # APNs delivery via token-based auth (JWT + HTTP/2)
├── api/routes/
│   └── notifications.py    # FastAPI endpoints for device/tracking/subscription/inbox
├── migrations/
│   └── 005_notifications.sql
├── tests/
│   └── test_notification_engine.py  # 31 unit tests
└── run_migration_005.py
```

### Frontend
```
frontend/
├── lib/
│   ├── device.ts              # Device registration + localStorage
│   ├── push-notifications.ts  # Web Push subscription (VAPID + PushManager)
│   ├── notification-api.ts    # API client for tracking/inbox endpoints
│   └── capacitor-push.ts      # iOS APNs via Capacitor plugin
├── components/
│   ├── notification-inbox.tsx  # Bell icon + dropdown inbox panel
│   └── track-button.tsx        # Track/untrack button for match cards
├── public/
│   └── custom-sw.js           # Service worker push+click handlers
└── next.config.js             # PWA config with customWorkerSrc
```
