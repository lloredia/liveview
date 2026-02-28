# Bridging the data accuracy gap

LiveScore and similar products use **commercial data feeds** (fast, reliable, many leagues). LiveView today uses **free/public sources** (ESPN, Football-Data.org, etc.) plus an adaptive pipeline. This doc outlines how to close the gap in stages.

---

## 1. Maximize what you already have (no new APIs)

**Goal:** Get the best accuracy and coverage from the current pipeline.

| Area | What to do |
|------|------------|
| **Scheduler + ingest** | Ensure scheduler and ingest services are **always running** and that **match discovery** runs regularly (ESPN schedule sync in scheduler). If matches never appear for a date, the scheduler may not be discovering them or ingest may not be subscribed. Check logs for `poll_command_dispatched`, `scoreboard_normalized`, and schedule-sync steps. |
| **API live refresh** | The API’s **30s ESPN live-score refresh** only runs for leagues that already have live/scheduled matches in the DB. If the DB is empty for a league, this loop won’t poll it. So **scheduler → ingest** must run first to populate matches; then live refresh keeps scores fresh. |
| **Phase sync** | The **60s phase-sync loop** in the API moves matches from scheduled → live → finished. It depends on DB state. No code change needed; just ensure the API service is up. |
| **Frontend patch** | `useESPNLive` / `useESPNLiveMulti` already patch backend data with ESPN when viewing scoreboards/today. That improves **perceived** accuracy for live clock/phase without changing the backend. You can extend this pattern to more views if useful. |
| **Tighten live polling** | In `scheduler/engine/polling.py`, `SPORT_TEMPO` already uses short intervals for live (e.g. 2–3s for live_active). If you have headroom on rate limits, you can reduce `scheduler_max_poll_interval_s` or slightly lower the live intervals so scoreboard updates land faster. |
| **Verifier** | The **verifier** service can reconcile and correct state; run it if you have it configured, so it acts as a second source of truth over Redis/DB. |

**Outcome:** Fewer missing matches, fresher scores and phases, no new dependencies.

---

## 2. Add or improve free/complementary providers

**Goal:** More leagues and better redundancy without paying for data yet.

| Provider | Role | How it helps |
|----------|------|--------------|
| **ESPN** | Already primary for scoreboards and schedule. | Keep as main source; ensure all leagues you care about are in the scheduler’s schedule-sync list (`SCHEDULE_SYNC_LEAGUES` or equivalent). |
| **Football-Data.org** | Already used for lineup/player-stats when ESPN has none. | Can be wired into ingest for **scoreboard/events** for leagues they support (e.g. top European leagues), so you have a second source and fewer gaps. |
| **TheSportsDB / Sportradar** | Already in the provider registry. | If you have free tiers or API keys, enable them for the leagues they cover; the registry’s health scoring will prefer the best-performing provider per match. |

**Concrete steps:**

- In **scheduler**: add every league you want to show to schedule sync (or to the list that generates poll tasks).
- In **ingest**: ensure Football-Data (and any other free provider) is registered for the right sports/leagues and that the normalizer can consume their scoreboard/events. Then the scheduler can send poll commands for those leagues and ingest will pull from the chosen provider.
- Add **monitoring** (e.g. “matches per league per day”, “last successful ingest per provider”) so you see gaps quickly.

**Outcome:** More leagues, fewer single-point-of-failure gaps, still no recurring data cost.

---

## 3. Introduce a commercial or premium feed (real “bridge”)

**Goal:** Get LiveScore-level accuracy and coverage for the leagues that matter most.

| Option | Typical use | What you’d do in LiveView |
|--------|-------------|---------------------------|
| **API-Football (RapidAPI), API-Sports, etc.** | Paid tiers with many leagues and low latency. | Add a new provider in `ingest/providers/` (e.g. `apifootball.py`) that implements the same interface as ESPN/Football-Data: fetch scoreboard, events, optionally stats. Register it in the provider registry; scheduler keeps sending poll commands, ingest picks provider by sport/league/health. |
| **Opta, Sportradar (full), Genius Sports** | Enterprise feeds used by big sports apps. | Same idea: implement the provider interface, normalize into your domain models, write to DB and publish deltas. Often they expose webhooks or streams; you could add a small “webhook receiver” that turns pushes into the same updates your normalizer writes, so you’re not only polling. |
| **Hybrid** | Use commercial for “top” leagues, free for the rest. | In the provider registry, prefer the commercial provider for selected leagues/sports; use ESPN/Football-Data for the rest. No frontend change; accuracy improves where the paid feed is used. |

**Outcome:** Closer to LiveScore-level accuracy and coverage where you pay for it.

---

## 4. Operations and reliability

**Goal:** The pipeline itself doesn’t drop data or stall.

| Area | Action |
|------|--------|
| **Deployment** | Run **scheduler**, **ingest**, **builder**, and **API** as separate processes (e.g. Railway services). Ensure they all connect to the same Redis and PostgreSQL. |
| **Leader election** | Scheduler uses leader election so only one instance drives polls. No change needed unless you see duplicate or missing polls. |
| **Observability** | Log and (if possible) metric: poll commands published, ingest successes/failures per provider, today cache hits/misses, API live-refresh updates. Alerts on “no ingest success for N minutes” or “zero matches for today” help catch outages. |
| **Cold start** | API and ingest can be slow after idle. You already increased frontend timeout and added health-check recovery; consider a small cron that hits `/health` or `/v1/today` every few minutes to keep services warm if your host sleeps. |

---

## Summary

- **Short term:** Run and verify scheduler + ingest + API; fix schedule sync and provider config so today’s matches are discovered and polled; lean on frontend ESPN patch for live feel.
- **Medium term:** Add or expand free providers (e.g. Football-Data for more leagues), register them in the ingest pipeline, and monitor coverage.
- **Long term:** Add one commercial or premium feed for priority leagues and plug it in as another provider; optionally add webhooks for real-time pushes.

The architecture (scheduler → ingest → normalizer → DB + Redis → builder, API read path, frontend) already supports multiple providers and adaptive polling; bridging the gap is mostly **configuration, one or two new provider adapters, and operations**.

---

## Implemented (codebase)

- **Scheduler:** Initial schedule sync runs after 2s (was 10s). Sync interval reduced to 1 hour (was 4h). After each sync, writes `pipeline:last_schedule_sync` to Redis (ISO timestamp, 2-day TTL).
- **Ingest:** Football-Data.org provider is always registered (free tier works without API key; with key = higher quota). Provider order default includes `football_data`.
- **API `/v1/status`:** Response now includes `pipeline.matches_today` (count of matches with `start_time` in today UTC) and `pipeline.last_schedule_sync` (last sync timestamp from Redis). Use these to confirm schedule sync is running and matches are present.
