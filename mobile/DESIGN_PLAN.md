# LiveView Mobile — Full Design Plan

**Vision**: a sports app that reads like Apple Sports / theScore — dark,
image-rich, dense with live data, and feels like you're inside the game,
not browsing a database.

**Constraint**: same Railway backend as today. The endpoints already
return team logos, league logos, lineups, stats, and play-by-play — we're
not blocked on data, we're just not rendering most of it.

---

## Phase 1 — Visual foundation

Replace the "rows of text" feel with real visual identity.

| Item | What changes |
|---|---|
| Team logos | `expo-image` with caching + sport-icon fallback. Renders next to every team name in match rows, modal headers, and detail screens. |
| League logos | Same component, used in section headers + match-detail breadcrumbs. |
| Sport icon set | Replace emoji (⚾🏀🏈⚽🏒) with `lucide-react-native` icons — consistent stroke, scales with font. |
| Brand mark | Custom small `LV` mark for the splash + tab bar inactive state. |
| Spacing | Bump match-row padding, give the score column real breathing room. |
| Type system | Mono for scores (already have tabular-nums), display weight for team names, semibold for status, small caps for league names. |

**Output**: scoreboard looks like a product, not a list.

---

## Phase 2 — Information density

Each match row earns its real estate.

- **Live**: red pulse + clock + period (e.g. `LIVE · 5:42 · Q3`).
- **Scheduled**: kickoff time + network/channel + venue truncation, e.g. `7:30 PM · ESPN · Wrigley`.
- **Finished**: `FT` + period count for OT/extra time, e.g. `FT · OT`.
- **Inline live stat**: optional small chip — possession % for soccer, runners-on-base for baseball, down & distance for football, period score breakdown for basketball.
- **Sort logic**: live → scheduled (by kickoff) → finished. Within each, group by league.
- **Filter pills** at top: `All` · `Live` · `Favorites` · `Tracked`. Same component we built for the web app, ported to RN.
- **Date strip** under header: `Yesterday | Today | Tomorrow` with horizontal scroll for ±7 days.
- **Per-league collapse**: tap league header to collapse/expand; persists per session.

**Output**: looks like a real news feed for sports, not a static listing.

---

## Phase 3 — Match detail screen

Currently a placeholder. Becomes the real heart of the app.

```
┌─────────────────────────────────┐
│  ← Back            Track  Share │
├─────────────────────────────────┤
│                                 │
│   [LOGO]   3 - 2     [LOGO]     │
│   Yankees           Mets        │
│      ● LIVE · 5:42 · Q3         │
│                                 │
├─────────────────────────────────┤
│  Recap | Stats | Lineup | Plays │
├─────────────────────────────────┤
│   ... tab content ...           │
└─────────────────────────────────┘
```

- **Hero score header**: big team logos (56px), 56px score with tabular-nums, animated state pill (live pulse / FT / scheduled time), venue + start time subtitle.
- **Track button**: ★ pin to tracked games (already works on backend).
- **Share button**: native share sheet — score line + deep link.
- **Tabs**:
  - **Recap** — timeline of major events with sport-specific icons (goal ⚽, card 🟨, dunk 🏀, HR ⚾). Pulled from `/v1/matches/{id}/timeline`.
  - **Stats** — comparative horizontal bars: possession, shots, corners (soccer); FG%, rebounds, assists (basketball); hits, errors, ERA (baseball). From `/v1/matches/{id}/stats`.
  - **Lineup** — formation graphic for soccer (we already built this on web), roster grid for other sports. From `/v1/matches/{id}/lineup`.
  - **Plays** — paginated play-by-play with quarter/inning markers, scoring plays highlighted. From `/v1/matches/{id}/details`.
- **Head-to-head footer** (when relevant): last 5 meetings, summary bar (W-L-D).
- **Form guide** (when relevant): each team's last 5 results as W/L/D pills.

**Output**: a screen worth opening, with progressive depth.

---

## Phase 4 — Discovery

Beyond the scoreboard.

- **News tab**: feed from `/v1/news`. Featured hero card + grid. Tap → in-app webview (SFSafariViewController via `expo-web-browser`). Bookmark to save.
- **League directory**: full list of leagues grouped by sport, searchable, tap → league-specific scoreboard for that day + standings + top scorers.
- **Search**: typeahead across teams + leagues + matches. Powered by `/v1/search` (build if missing).
- **Trending today**: top-N live matches by viewer/headline volume. From `/v1/news/trending` adapted.

**Output**: app earns its second tab.

---

## Phase 5 — Personalization

- **Favorites** screen: list of starred teams + leagues, edit + reorder.
- **Tracked games**: list of pinned matches with live mini-scoreboard.
- **Push notifications**: opt-in flow on first launch + per-team toggles. Use `expo-notifications`. Backend `/v1/notifications` endpoints exist.
- **Notification settings**: per-event toggles (goal / start / halftime / final / lead change), quiet hours.
- **Theme toggle**: dark / light / auto (currently forced dark).

**Output**: app remembers what the user cares about.

---

## Phase 6 — Polish

- **Haptics** on tab change, score change, track-toggle (`expo-haptics`).
- **Skeletons** while loading instead of spinners — closer to Apple Sports feel.
- **Empty states** with sport-specific copy + light illustration.
- **Pull-to-refresh** with custom indicator (LV logo pulse).
- **Animated score**: number ticks up when score changes (Reanimated 3).
- **Score-change toast**: small banner when a tracked match scores while user is elsewhere in the app.
- **Live Activities** (iOS 16.5+): score in the dynamic island for tracked matches. Requires native module — `expo-live-activity`.
- **Alternate app icons**: dark / light / colored variants users can pick in Account.

**Output**: app feels alive.

---

## Execution order

I'll do these as named milestones, committing each one separately so you
can review and roll back any phase that doesn't land.

1. **Phase 1** (foundation) — 1 session, low risk, high visual win.
2. **Phase 2** (density) — 1 session, low risk.
3. **Phase 3** (match detail) — 2–3 sessions; the bulk of the value.
4. **Phase 4** (discovery) — 1 session for News, 1 for search/league directory.
5. **Phase 5** (personalization) — 1 session for favorites/tracked, 1 for notifications (push setup is the only fiddly bit).
6. **Phase 6** (polish) — incremental; haptics + skeletons are quick wins, Live Activities is a larger native bridge.

After Phase 1 + 2 the app already looks like a real product. After Phase
3 it's competitive with theScore on a single league. Phases 4–6 are where
it differentiates.

## What I need from you

- ✅ confirm this is the right scope (or strike phases that aren't priority)
- ✅ confirm you want me to execute serially (one phase per push) vs. all-in-one
- 1024×1024 LV icon — the current `mobile/assets/images/icon.png` is what I copied from `frontend/public/icons/icon-512.png` upscaled. If that's not the real LV mark, point me at the file or design and I'll swap.
