<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="512" height="512" rx="112" fill="#1A1A2E"/>
  <rect x="16" y="16" width="480" height="480" rx="96" fill="none" stroke="#2A2A4A" stroke-width="2"/>
  <!-- L bar -->
  <rect x="128" y="120" width="56" height="272" rx="8" fill="#FFFFFF"/>
  <rect x="128" y="336" width="160" height="56" rx="8" fill="#FFFFFF"/>
  <!-- V shape + pulse dot with glow -->
  <g filter="url(#glow)">
    <polygon points="320,120 360,120 400,340 440,120 480,120 420,392 340,392" fill="#00E676"/>
    <circle cx="108" cy="108" r="24" fill="#00E676"/>
    <circle cx="108" cy="108" r="24" fill="#00E676" opacity="0.4">
      <animate attributeName="r" values="24;36;24" dur="2s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0.4;0;0.4" dur="2s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>

<p align="center">
  <img src="frontend/public/icons/icon.svg" alt="LiveView" width="120" />
</p>
<p align="center">
  <img src="https://img.shields.io/badge/LiveView-Sports%20Tracker-00E676?style=for-the-badge&logoColor=white" alt="LiveView" />
</p>
<h1 align="center"> LiveView — Real-Time Sports Tracker</h1>

<p align="center">
  Production-ready real-time sports tracker: live scores, match timelines, and league standings with multi-sport coverage across 20+ leagues and 5 sports.
</p>
<p align="center">
  <img src="https://img.shields.io/badge/FastAPI-009688?style=flat-square&logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Next.js_14-000000?style=flat-square&logo=next.js&logoColor=white" />
  <img src="https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white" />
  <img src="https://img.shields.io/badge/Redis-DC382D?style=flat-square&logo=redis&logoColor=white" />
  <img src="https://img.shields.io/badge/Railway-0B0D0E?style=flat-square&logo=railway&logoColor=white" />
  <img src="https://img.shields.io/badge/Vercel-000000?style=flat-square&logo=vercel&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-2496ED?style=flat-square&logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/SQLAlchemy-D71F00?style=flat-square&logo=sqlalchemy&logoColor=white" />
</p>


<p align="center">
  <a href="https://frontend-lloredias-projects.vercel.app"><strong>🌐 Live Demo</strong></a> ·
  <a href="https://backend-api-production-8b9f.up.railway.app/health"><strong>🔗 API Health</strong></a> ·
  <a href="#architecture"><strong>📐 Architecture</strong></a> ·
  <a href="#features"><strong>✨ Features</strong></a>
</p>

---

## 📖 Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [System Design](#system-design)
- [Features](#features)
- [Project Structure](#project-structure)
- [Data Flow](#data-flow)
- [Deployment](#deployment)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Roadmap](#roadmap)

---

## Overview

LiveView is a full-stack sports tracking platform that provides real-time scores, match timelines, league standings, and comprehensive coverage across multiple sports. Built with a microservices architecture, it ingests data from ESPN's public API, processes it through a Redis-based event pipeline, and serves it through a polished Next.js frontend.

**What it does:**
- Tracks live matches across 11+ leagues and 5 sports
- Provides a "Today" view showing all matches across all leagues for any date
- Auto-syncs match phases (scheduled → live → finished)
- Supports real-time polling with ETag-based caching
- Mobile-responsive, PWA-ready, with push notification support

---

## Architecture

### System overview

```mermaid
flowchart TB
  subgraph Clients["Clients"]
    Browser[Browser / PWA]
    Mobile[Mobile]
  end

  subgraph Frontend["Frontend (Next.js)"]
    App[App Router]
    UI[Components]
    Hooks[hooks]
    API_Client[API client]
    App --> UI
    App --> Hooks
    Hooks --> API_Client
  end

  subgraph Backend["Backend (Python)"]
    REST[REST API]
    WS[WebSocket]
    REST --> Redis[(Redis)]
    WS --> Redis
    Redis --> PG[(PostgreSQL)]
    Ingest[Ingest Service]
    Scheduler[Scheduler]
    Ingest --> PG
    Ingest --> Redis
    Scheduler --> Ingest
  end

  subgraph External["External APIs"]
    ESPN[ESPN API]
  end

  Browser --> App
  Mobile --> App
  API_Client --> REST
  API_Client --> WS
  Frontend -.->|supplement data| ESPN
  Ingest -.->|poll| ESPN
```

### Frontend architecture
```mermaid
flowchart LR
  subgraph Routes["App routes"]
    Home["/"]
    Match["/match/[id]"]
    Offline["/offline"]
  end

  subgraph Core["Core UI"]
    Header[Header]
    Sidebar[Sidebar]
    Scoreboard[Scoreboard]
    TodayView[Today view]
    MatchDetail[Match detail]
    LiveTicker[Live ticker]
  end

  subgraph Data["Data layer"]
    Polling[usePolling]
    ESPN[useESPNLive]
    WS[WebSocket]
  end

  subgraph API["Backend API"]
    Leagues["/v1/leagues"]
    ScoreboardAPI["/v1/leagues/:id/scoreboard"]
    TodayAPI["/v1/today"]
    MatchAPI["/v1/matches/:id"]
    Timeline["/v1/matches/:id/timeline"]
  end

  ESPN_API[ESPN public API]

  Home --> TodayView
  Home --> Scoreboard
  Match --> MatchDetail
  TodayView --> Polling
  Scoreboard --> Polling
  MatchDetail --> Polling
  MatchDetail --> ESPN
  Polling --> Leagues
  Polling --> ScoreboardAPI
  Polling --> TodayAPI
  Polling --> MatchAPI
  Polling --> Timeline
  ESPN --> ESPN_API
```

### Data flow (match detail)

```mermaid
sequenceDiagram
  participant User
  participant MatchDetail
  participant Backend
  participant ESPN

  User->>MatchDetail: Open match
  MatchDetail->>Backend: GET /v1/matches/:id
  Backend-->>MatchDetail: match + state
  MatchDetail->>Backend: GET /v1/matches/:id/timeline
  Backend-->>MatchDetail: events (or empty)
  MatchDetail->>ESPN: summary?event=... (by team names + league)
  ESPN-->>MatchDetail: plays, boxscore, formation
  MatchDetail->>MatchDetail: Merge play-by-play, lineup, player stats
  MatchDetail-->>User: Full match view + Lineup tab
```

### Backend services (high level)

```mermaid
flowchart TB
  subgraph API["API (FastAPI)"]
    REST[REST routes]
    WSM[WS manager]
    REST --> DB
    WSM --> Redis
  end

  subgraph Data["Data stores"]
    Redis[(Redis)]
    DB[(PostgreSQL)]
  end

  subgraph Workers["Background"]
    Ingest[Ingest]
    Scheduler[Scheduler]
    Builder[Builder]
  end

  Ingest --> DB
  Ingest --> Redis
  Scheduler --> Ingest
  Builder --> DB
  REST --> Redis
  REST --> DB
```

### Cloud deployment view

```mermaid
graph TB
    subgraph External
        ESPN["🌐 ESPN Public API"]
    end

    subgraph Railway["☁️ Railway Cloud"]
        subgraph Services["Microservices"]
            SCHED["⏰ Scheduler<br/><i>Cron triggers</i>"]
            INGEST["📥 Ingest Service<br/><i>ESPN adapter</i>"]
            BUILDER["🔨 Builder Service<br/><i>Event processor</i>"]
            API["🚀 API Service<br/><i>FastAPI + Phase Sync</i>"]
        end

        subgraph Data["Data Stores"]
            PG[("🐘 PostgreSQL<br/><i>Matches, Teams, Events</i>")]
            REDIS[("⚡ Redis<br/><i>Cache + Pub/Sub</i>")]
        end
    end

    subgraph Vercel["▲ Vercel Edge"]
        FE["💻 Next.js 14<br/><i>App Router + SSR</i>"]
    end

    subgraph Clients["Clients"]
        WEB["🖥️ Desktop Browser"]
        MOB["📱 Mobile Browser"]
    end

    ESPN -->|Scoreboard JSON| INGEST
    SCHED -->|Trigger jobs| INGEST
    INGEST -->|Fanout events| REDIS
    REDIS -->|Subscribe| BUILDER
    BUILDER -->|Write| PG
    API -->|Read| PG
    API -->|Cache/ETag| REDIS
    FE -->|REST + Polling| API
    WEB --> FE
    MOB --> FE

    style ESPN fill:#FF6B35,stroke:#FF6B35,color:#fff
    style API fill:#009688,stroke:#009688,color:#fff
    style FE fill:#000,stroke:#fff,color:#fff
    style PG fill:#4169E1,stroke:#4169E1,color:#fff
    style REDIS fill:#DC382D,stroke:#DC382D,color:#fff
    style SCHED fill:#6B7280,stroke:#6B7280,color:#fff
    style INGEST fill:#8B5CF6,stroke:#8B5CF6,color:#fff
    style BUILDER fill:#F59E0B,stroke:#F59E0B,color:#fff
```

---

## Tech Stack

```mermaid
graph LR
    subgraph Frontend
        NEXT["Next.js 14"]
        TS["TypeScript"]
        TW["Tailwind CSS"]
        REACT["React 18"]
    end

    subgraph Backend
        FAPI["FastAPI"]
        PY["Python 3.11+"]
        SA["SQLAlchemy Async"]
        UV["Uvicorn"]
    end

    subgraph Infrastructure
        RAIL["Railway"]
        VER["Vercel"]
        DOCK["Docker"]
        GH["GitHub"]
    end

    subgraph Data
        POST["PostgreSQL 15"]
        RED["Redis 7"]
    end

    NEXT --> FAPI
    FAPI --> POST
    FAPI --> RED
    DOCK --> RAIL
    NEXT --> VER
    GH --> RAIL
    GH --> VER

    style NEXT fill:#000,stroke:#fff,color:#fff
    style FAPI fill:#009688,stroke:#009688,color:#fff
    style POST fill:#4169E1,stroke:#4169E1,color:#fff
    style RED fill:#DC382D,stroke:#DC382D,color:#fff
    style RAIL fill:#0B0D0E,stroke:#fff,color:#fff
    style VER fill:#000,stroke:#fff,color:#fff
```

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router) | Server-side rendering, routing |
| **Styling** | Tailwind CSS | Utility-first CSS, dark theme |
| **Language** | TypeScript | Type safety across frontend |
| **Backend** | FastAPI (async) | High-performance REST API |
| **ORM** | SQLAlchemy (async) | Database access with type safety |
| **Database** | PostgreSQL 15 | Persistent match/team/event storage |
| **Cache** | Redis 7 | Response caching, pub/sub fanout |
| **Containerization** | Docker | Single multi-service Dockerfile |
| **Backend Hosting** | Railway | 4 microservices + Postgres + Redis |
| **Frontend Hosting** | Vercel | Edge deployment, CDN |
| **Data Source** | ESPN Public API | Scores, teams, schedules |

---

## System Design

### Service Architecture

```mermaid
graph TD
    subgraph API["API Service :8000"]
        direction TB
        HEALTH["/health"]
        LEAGUES["/v1/leagues"]
        SCORES["/v1/leagues/:id/scoreboard"]
        MATCHES["/v1/matches/:id"]
        TIMELINE["/v1/matches/:id/timeline"]
        STATS["/v1/matches/:id/stats"]
        TODAY["/v1/today?date=YYYY-MM-DD"]
        SYNC["⏱️ Phase Sync Loop<br/><i>60s interval</i>"]
    end

    subgraph Ingest["Ingest Service"]
        ESPN_ADAPTER["ESPN Provider<br/><i>Scoreboard parser</i>"]
        NORMALIZER["Data Normalizer<br/><i>Teams, matches, events</i>"]
    end

    subgraph Scheduler["Scheduler Service"]
        CRON["Cron Engine<br/><i>Poll intervals per league</i>"]
    end

    subgraph Builder["Builder Service"]
        SUB["Redis Subscriber"]
        WRITER["Postgres Writer<br/><i>Upsert logic</i>"]
    end

    CRON -->|"Trigger"| ESPN_ADAPTER
    ESPN_ADAPTER --> NORMALIZER
    NORMALIZER -->|"Publish"| REDIS_PUB["Redis Pub/Sub"]
    REDIS_PUB -->|"Subscribe"| SUB
    SUB --> WRITER

    style API fill:#009688,stroke:#009688,color:#fff
    style Ingest fill:#8B5CF6,stroke:#8B5CF6,color:#fff
    style Scheduler fill:#6B7280,stroke:#6B7280,color:#fff
    style Builder fill:#F59E0B,stroke:#F59E0B,color:#fff
```

### Match Lifecycle

```mermaid
stateDiagram-v2
    [*] --> scheduled : Ingest creates match
    scheduled --> live : start_time passes<br/>(phase_sync_loop)
    scheduled --> live : Score > 0 detected<br/>(phase_sync_loop)
    live --> finished : 3+ hours elapsed<br/>(phase_sync_loop)
    scheduled --> finished : 3+ hours past start<br/>(phase_sync_loop)
    live --> break : Halftime/Period break
    break --> live : Play resumes
    scheduled --> postponed : Provider update
    scheduled --> cancelled : Provider update
    finished --> [*]
    postponed --> [*]
    cancelled --> [*]
```

### Database Schema

```mermaid
erDiagram
    SPORTS ||--o{ LEAGUES : contains
    LEAGUES ||--o{ SEASONS : has
    LEAGUES ||--o{ MATCHES : hosts
    MATCHES ||--|| MATCH_STATE : has
    MATCHES ||--o{ MATCH_EVENTS : generates
    MATCHES ||--o| MATCH_STATS : has
    MATCHES }o--|| TEAMS : home_team
    MATCHES }o--|| TEAMS : away_team
    TEAMS ||--o{ PLAYERS : roster
    LEAGUES ||--o{ PROVIDER_MAPPINGS : mapped_by

    SPORTS {
        uuid id PK
        string sport_type
        string name
    }

    LEAGUES {
        uuid id PK
        uuid sport_id FK
        string name
        string short_name
        string country
        string logo_url
    }

    MATCHES {
        uuid id PK
        uuid league_id FK
        uuid season_id FK
        uuid home_team_id FK
        uuid away_team_id FK
        string phase
        timestamp start_time
        string venue
    }

    MATCH_STATE {
        uuid id PK
        uuid match_id FK
        string phase
        int score_home
        int score_away
        string clock
        string period
        json score_breakdown
        int version
    }

    MATCH_EVENTS {
        uuid id PK
        uuid match_id FK
        int seq
        string event_type
        int minute
        int second
        string period
        uuid team_id FK
        uuid player_id FK
        json detail
        boolean synthetic
    }

    TEAMS {
        uuid id PK
        uuid sport_id FK
        string name
        string short_name
        string logo_url
    }

    PROVIDER_MAPPINGS {
        uuid id PK
        uuid entity_id FK
        string provider
        string external_id
        string entity_type
    }
```

---

## Features

### ✅ Implemented

```mermaid
mindmap
  root((LiveView))
    📅 Today View
      All matches across all leagues
      Date picker navigation
      Filter by Live/Scheduled/Finished
      League-grouped display
    ⚽ Live Scores
      Real-time polling (20s)
      ETag conditional requests
      Animated score changes
      Live match ticker
    📊 League Scoreboard
      Matches tab
      Standings tab
      Stats dashboard
    🔍 Match Detail
      Score + teams
      Event timeline
      Team statistics
      Head-to-head
      Lineups
    🧭 Navigation
      Sidebar with all leagues
      Favorite leagues (⭐)
      Live count badges
      Global search (Cmd+K)
    📱 Mobile
      Responsive design
      Pull-to-refresh
      PWA support
      Push notifications
    🛠️ Infrastructure
      Auto phase sync (60s)
      Redis caching
      Multi-service Docker
      CI/CD via Git push
```

### 🔮 Planned

| Feature | Description | Priority |
|---------|------------|----------|
| **More Leagues** | Eredivisie, Championship, FA Cup, Liga Portugal, Saudi Pro, Turkish Super Lig | 🔴 High |
| **Ingest Fix** | Scheduler/ingest not fetching daily matches | 🔴 High |
| **UI Overhaul** | LiveScore-quality design, compact rows, mobile-first | 🔴 High |
| **Match Minute Clock** | Show "45'+2" or "67'" instead of just "LIVE" | 🟡 Medium |
| **Favourites Page** | Pin teams, get filtered view | 🟡 Medium |
| **News Feed** | Sports news integration | 🟢 Low |

---

## Project Structure

Everything lives under **liveview-app**: the **frontend** (Next.js) and **backend** (FastAPI) are the two main app folders; repo-level config and docs stay at the root.

```
liveview-app/
├── 📁 frontend/                   # Next.js 14 frontend (Vercel deploys this; Root Directory = frontend/)
│   ├── 📁 app/
│   │   ├── page.tsx               # Landing page (Today view)
│   │   ├── layout.tsx             # Root layout
│   │   └── 📁 match/[id]/
│   │       └── page.tsx           # Match detail page
│   ├── 📁 components/             # 20+ React components
│   ├── 📁 hooks/                  # Custom React hooks
│   ├── 📁 lib/                    # API client, types, utilities
│   ├── 📁 public/                 # Static assets, PWA, icons
│   ├── package.json               # Frontend deps (Next, React, Tailwind, @vercel/analytics)
│   ├── next.config.js             # Next + PWA config
│   ├── tailwind.config.ts         # Custom dark theme
│   ├── tsconfig.json
│   ├── postcss.config.js
│   ├── jest.config.ts
│   └── vercel.json                # Vercel project config (when used from monorepo)
│
├── 📁 backend/                    # Python FastAPI backend (Railway)
│   ├── 📁 api/                    # REST API layer
│   │   ├── app.py                 # FastAPI app + phase_sync_loop
│   │   ├── dependencies.py        # Dependency injection (db, redis)
│   │   ├── middleware.py          # CORS configuration
│   │   ├── service.py             # Uvicorn entry point
│   │   └── 📁 routes/
│   │       ├── leagues.py         # /v1/leagues, /v1/leagues/:id/scoreboard
│   │       ├── matches.py         # /v1/matches/:id, /timeline, /stats, /lineup, /player-stats
│   │       └── today.py           # /v1/today?date=YYYY-MM-DD
│   ├── 📁 ingest/                 # Data ingestion (ESPN, Football-Data.org)
│   │   ├── service.py             # Ingest service entry
│   │   └── 📁 providers/
│   ├── 📁 scheduler/              # Job scheduling
│   │   └── service.py             # Cron-based triggers
│   ├── 📁 builder/                 # Event processing
│   │   └── service.py             # Redis → Postgres writer
│   ├── 📁 shared/                 # Shared utilities
│   │   ├── config.py              # Settings (LV_ prefix)
│   │   ├── 📁 models/
│   │   └── 📁 utils/
│   ├── 📁 migrations/             # SQL schema
│   ├── seed.py                    # Database seeder
│   ├── Dockerfile                 # Multi-service Docker image
│   ├── entrypoint.sh              # SERVICE_TYPE router
│   └── .env                       # Backend env (LV_*); not committed
│
├── .gitignore                     # Repo ignores (frontend/, backend/, env)
└── README.md                      # ← You are here
```

---

## Data Flow

### Ingest Pipeline

```mermaid
sequenceDiagram
    participant S as ⏰ Scheduler
    participant I as 📥 Ingest
    participant E as 🌐 ESPN API
    participant R as ⚡ Redis
    participant B as 🔨 Builder
    participant DB as 🐘 PostgreSQL

    S->>I: Trigger league poll
    I->>E: GET /scoreboard?dates=20260220
    E-->>I: JSON (matches, scores, teams)
    I->>I: Normalize data
    I->>R: PUBLISH match events
    R-->>B: Event notification
    B->>DB: UPSERT match + state
    Note over DB: Match available via API
```

### Client Request Flow

```mermaid
sequenceDiagram
    participant C as 💻 Browser
    participant V as ▲ Vercel CDN
    participant A as 🚀 API
    participant R as ⚡ Redis
    participant DB as 🐘 PostgreSQL

    C->>V: GET /
    V-->>C: Next.js SSR page
    C->>A: GET /v1/today?date=2026-02-20
    A->>R: Check cache (today:2026-02-20)
    alt Cache HIT
        R-->>A: Cached JSON
    else Cache MISS
        A->>DB: Query matches + teams
        DB-->>A: Result set
        A->>R: Cache (15s TTL)
    end
    A-->>C: JSON response + ETag
    Note over C: Poll every 20s with If-None-Match
    C->>A: GET /v1/today (If-None-Match: "abc")
    alt No changes
        A-->>C: 304 Not Modified
    else Data changed
        A-->>C: 200 + new ETag
    end
```

---

## Deployment

```mermaid
graph LR
    subgraph Development
        DEV["💻 Local Dev<br/><i>docker-compose up</i>"]
    end

    subgraph GitHub
        REPO["📦 GitHub Repo<br/><i>lloredia/liveview</i>"]
    end

    subgraph Railway["Railway (Backend)"]
        R_API["API Service<br/><i>SERVICE_TYPE=api</i>"]
        R_ING["Ingest Service<br/><i>SERVICE_TYPE=ingest</i>"]
        R_SCH["Scheduler Service<br/><i>SERVICE_TYPE=scheduler</i>"]
        R_BLD["Builder Service<br/><i>SERVICE_TYPE=builder</i>"]
        R_PG[("PostgreSQL")]
        R_RD[("Redis")]
    end

    subgraph Vercel["Vercel (Frontend)"]
        V_FE["Next.js App<br/><i>Edge Network</i>"]
    end

    DEV -->|git push| REPO
    REPO -->|Auto deploy| Railway
    REPO -->|Manual: npx vercel --prod| Vercel

    R_API --> R_PG
    R_API --> R_RD
    R_ING --> R_RD
    R_BLD --> R_PG
    R_BLD --> R_RD
    R_SCH --> R_RD
    V_FE -->|REST| R_API

    style R_API fill:#009688,stroke:#009688,color:#fff
    style V_FE fill:#000,stroke:#fff,color:#fff
    style R_PG fill:#4169E1,stroke:#4169E1,color:#fff
    style R_RD fill:#DC382D,stroke:#DC382D,color:#fff
```

| Service | Platform | URL |
|---------|----------|-----|
| Frontend | Vercel | [frontend-lloredias-projects.vercel.app](https://frontend-lloredias-projects.vercel.app) |
| Backend API | Railway | [backend-api-production-8b9f.up.railway.app](https://backend-api-production-8b9f.up.railway.app) |
| PostgreSQL | Railway | Internal: `postgres.railway.internal:5432` |
| Redis | Railway | Internal: `redis.railway.internal:6379` |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker & Docker Compose (for local dev)

### Local Development

Repo root is **liveview-app**: only **frontend/** and **backend/** contain app code; all config and docs are at the right level (see [Project Structure](#project-structure)).

```bash
# Clone (then open the repo root in your editor — e.g. liveview-app)
git clone https://github.com/lloredia/liveview.git
cd liveview

# Optional: start Postgres/Redis via docker-compose if you have it at repo root
# docker-compose up -d

# Backend (run from repo root)
cd backend
pip install -r requirements.txt
python -m api.service

# Frontend (new terminal, from repo root)
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000` — the frontend connects to `http://localhost:8000` by default.

### Seed the Database

```bash
cd backend
export LV_DATABASE_URL="postgresql+asyncpg://liveview:liveview@localhost:5432/liveview"
python seed.py
```

### Enabling NFL (Football) in the sidebar

The initial migration (`001_initial.sql`) creates Soccer, Basketball, Hockey, and Baseball. A second migration adds **Football** (NFL):

- **Run the Football migration** so the "football" sport exists:
  ```bash
  psql $LV_DATABASE_URL -f backend/migrations/002_add_football_sport.sql
  ```
  (On Railway, use the DB connection string from your project variables and run the SQL in the Query tab or via `psql`.)
- Then **re-run the seed** (or let the scheduler ingest) so the NFL league and its matches appear. After that, the **NFL** section will show in the sidebar under Football 🏈.

---

## Environment Variables

All backend variables use the `LV_` prefix.

| Variable | Service | Description |
|----------|---------|-------------|
| `LV_DATABASE_URL` | Backend (all) | PostgreSQL connection (`postgresql+asyncpg://...`) |
| `LV_REDIS_URL` | Backend (all) | Redis connection |
| `LV_JWT_SECRET` | Backend (API) | JWT signing key |
| `LV_CORS_ORIGINS` | Backend (API) | Allowed CORS origins (JSON array) |
| `SERVICE_TYPE` | Backend (all) | `api` \| `ingest` \| `scheduler` \| `builder` |
| `PORT` | Backend (API) | Server port (default: 8000) |
| `NEXT_PUBLIC_API_URL` | Frontend | Backend API base URL |

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/v1/today?date=YYYY-MM-DD` | All matches for a date, grouped by league |
| `GET` | `/v1/leagues` | All leagues grouped by sport |
| `GET` | `/v1/leagues/:id/scoreboard` | Live scoreboard for a league |
| `GET` | `/v1/matches/:id` | Match center (score, teams, state) |
| `GET` | `/v1/matches/:id/timeline` | Event timeline with pagination |
| `GET` | `/v1/matches/:id/stats` | Team & player statistics |

All endpoints support `ETag` / `If-None-Match` for conditional requests.

---

## Roadmap

```mermaid
gantt
    title LiveView Development Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Core Platform
    9 Features Complete           :done,    core, 2026-02-01, 2026-02-18
    Today View + Date Picker      :done,    today, 2026-02-19, 2026-02-19
    Fix Ingest Pipeline           :active,  ingest, 2026-02-20, 2026-02-22
    Add 10 New Leagues            :active,  leagues, 2026-02-20, 2026-02-23

    section UI Overhaul
    Design System Update          :         design, 2026-02-22, 2026-02-24
    Compact Match Rows            :         cards, 2026-02-24, 2026-02-25
    Mobile Responsive Fix         :         mobile, 2026-02-25, 2026-02-27

    section Future
    Live Match Minute Clock       :         clock, 2026-02-28, 2026-03-02
    Favourites Page               :         favs, 2026-03-02, 2026-03-05
    News Feed Integration         :         news, 2026-03-05, 2026-03-10
```

---

## Sports & Leagues Covered

| Sport | Leagues |
|-------|---------|
| ⚽ Soccer | Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Champions League, MLS |
| 🏀 Basketball | NBA |
| 🏈 Football | NFL |
| 🏒 Hockey | NHL |
| ⚾ Baseball | MLB |

**Coming soon:** Eredivisie, Championship, FA Cup, Liga Portugal, Saudi Pro League, Turkish Super Lig, Europa League, Conference League, Scottish Premiership

---

<p align="center">
  Built with ☕ by <a href="https://github.com/lloredia">@lloredia</a>
</p>
