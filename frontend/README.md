# LiveView Web — Real-Time Sports Dashboard

A Next.js PWA that connects to the LiveView backend for live sports scores, match timelines, and real-time WebSocket updates.

## Quick Start

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Requirements

- Node.js 18+
- LiveView backend running on `localhost:8000` (see parent project)

## Features

- **Live scoreboards** — Matches grouped by Live / Upcoming / Finished
- **11 leagues** — Premier League, La Liga, NBA, NHL, MLB, MLS, and more
- **Match detail view** — Full score display with team logos, venue, clock
- **Timeline** — Play-by-play events as they happen
- **WebSocket integration** — Real-time delta updates with auto-reconnect
- **Auto-refresh** — Scoreboard polls every 20s, match detail every 15s
- **PWA** — Install on any phone, works offline for cached data
- **Mobile-first** — Responsive sidebar, touch-optimized cards
- **Dark theme** — Sports broadcast aesthetic with green accent system

## PWA Installation

On mobile, open the site and tap "Add to Home Screen". The app runs in standalone mode with the LiveView icon and dark status bar.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend API base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/v1/ws` | WebSocket endpoint |

## Deployment

### Vercel (recommended)

```bash
npm i -g vercel
vercel
```

Set environment variables in the Vercel dashboard to point to your deployed backend.

### Docker

```bash
npm run build
npm start
```

### Static Export

```bash
npx next build
# Output in .next/
```

## Project Structure

```
liveview-web/
├── app/
│   ├── globals.css        # Tailwind + custom styles
│   ├── layout.tsx         # Root layout with PWA meta
│   ├── page.tsx           # Main dashboard page
│   └── match/[id]/
│       └── page.tsx       # Direct match URL route
├── components/
│   ├── header.tsx         # Top bar with connection status
│   ├── sidebar.tsx        # League navigation
│   ├── scoreboard.tsx     # Match grid with sections
│   ├── match-card.tsx     # Individual match card
│   ├── match-detail.tsx   # Full match view + timeline
│   └── team-logo.tsx      # Logo with fallback
├── hooks/
│   ├── use-websocket.ts   # WebSocket with auto-reconnect
│   └── use-polling.ts     # Interval-based data fetching
├── lib/
│   ├── api.ts             # Typed API client
│   ├── types.ts           # TypeScript interfaces
│   └── utils.ts           # Phase labels, formatting, icons
└── public/
    ├── manifest.json      # PWA manifest
    └── icons/             # App icons
```
