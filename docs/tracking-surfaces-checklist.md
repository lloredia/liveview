# Tracking Surfaces — Gating Checklist

All tracking-related entry points must be hard-gated behind authentication. Unauthenticated users can browse scores, news, and match center only.

---

## 1. Track match (pin/tracked games)

| Location | File | What to gate |
|----------|------|----------------|
| Track button on match card | `components/track-button.tsx` | Click handler: require auth before `togglePinned` / server sync |
| Match card (Track button) | `components/match-card.tsx` | Only show or enable Track when authed; else show locked CTA |
| Match center track button | `components/match-detail.tsx` | Track/Untrack control: require auth |
| Home page track toggle | `app/page.tsx` | `handleTogglePin`: require auth before writing |
| Match page track toggle | `app/match/[id]/page.tsx` | `handleTogglePin`: require auth |
| Multi-tracker bar | `components/multi-tracker.tsx` | Entire component: show only when authed; else show locked CTA or hide |
| Pinned state init | `app/page.tsx`, `app/match/[id]/page.tsx` | Load pinned from backend when authed; empty when not |

**Libraries:** `lib/pinned-matches.ts` (local) → replace with API when authed; no local write when logged out.

---

## 2. Favorites (teams + leagues)

| Location | File | What to gate |
|----------|------|----------------|
| Sidebar favorite leagues | `components/sidebar.tsx` | Star toggle + Favorites section: require auth |
| Today view favorite teams | `components/today-view.tsx` | Favorite star + Favorites filter tab: require auth |
| Match card favorite star | `components/match-card.tsx` | `FavoriteStar` / `onToggleFavoriteTeam`: require auth |
| Scoreboard favorite star | `components/scoreboard.tsx` | Pass `onToggleFavoriteTeam` only when authed; else gate |
| Home page favorites state | `app/page.tsx` | `favLeagueIds`, `favTeamIds`: from backend when authed; empty when not |

**Libraries:** `lib/favorites.ts`, `lib/favorite-teams.ts` → call backend when authed; no local write when logged out.

---

## 3. Tracked / Favorites list views

| Location | File | What to gate |
|----------|------|----------------|
| Today view "Tracked" filter | `components/today-view.tsx` | When logged out: selecting Tracked opens gate modal or redirects to login with return url |
| Today view "Favorites" filter | `components/today-view.tsx` | When logged out: selecting Favorites opens gate or redirect |
| Multi-tracker (pinned list) | `components/multi-tracker.tsx` | Show only when authed; when logged out show "Sign in to track games" CTA |

---

## 4. Notification preferences / settings

| Location | File | What to gate |
|----------|------|----------------|
| Sound enabled | `lib/notification-settings.ts` | Persist in backend when authed; local only when not (or gate settings UI) |
| Notification inbox | `components/notification-inbox.tsx` | Require auth to view; show locked CTA when not |
| Push permission / token | `lib/capacitor-push.ts`, `components/push-on-first-interaction.tsx` | Keep; token still sent with device_id; backend can link to user after login |

**Note:** Notification *preferences* (quiet hours, which events to push) should be stored per user on backend and gated.

---

## 5. Saved items (news)

| Location | File | What to gate |
|----------|------|----------------|
| News card bookmark | `components/news/news-card.tsx` | Save for later: require auth; no local write when logged out |
| News feed saved state | `components/news/news-feed.tsx` | Load saved from backend when authed; empty when not |

**Library:** `lib/news-saved.ts` → backend when authed; no local write when logged out.

---

## 6. Summary

- **Track/pin:** `track-button.tsx`, `match-card.tsx`, `match-detail.tsx`, `multi-tracker.tsx`, `app/page.tsx`, `app/match/[id]/page.tsx`, `lib/pinned-matches.ts`
- **Favorites:** `sidebar.tsx`, `today-view.tsx`, `match-card.tsx`, `scoreboard.tsx`, `app/page.tsx`, `lib/favorites.ts`, `lib/favorite-teams.ts`
- **Views:** Today "Tracked"/"Favorites" tabs, Multi-tracker bar
- **Settings:** `notification-settings.ts`, notification inbox UI
- **Saved (news):** `news-card.tsx`, `news-feed.tsx`, `lib/news-saved.ts`

**Rule:** Clicking any tracking action while logged out must NEVER write to localStorage for tracking/favorites/saved. Show RequireAuthGate (modal) or redirect to login with return URL.
