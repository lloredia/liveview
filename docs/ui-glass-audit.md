# Live View — UI Glass Audit Report

**Date:** 2026-02-27
**Stack:** Next.js 14.2 (App Router) · React 18 · Tailwind CSS 3.4 · Capacitor 6 (iOS)
**Styling:** CSS custom properties in `globals.css` → Tailwind token layer in `tailwind.config.ts`

---

## 1  Screen Inventory

| # | Screen | Route | File |
|---|--------|-------|------|
| 1 | **Home / Today View** | `/` | `app/page.tsx` → `components/today-view.tsx` |
| 2 | **League Scoreboard** | `/?league=<id>` | `components/scoreboard.tsx` |
| 3 | **Match Center** | `/match/[id]` | `app/match/[id]/page.tsx` → `components/match-detail.tsx` |
| 4 | **News Feed** | `/news` | `app/news/page.tsx` |
| 5 | **Offline Fallback** | `/offline` | `app/offline/page.tsx` |
| 6 | **Privacy / Support** | `/privacy`, `/support` | `app/privacy/page.tsx`, `app/support/page.tsx` |

**Persistent chrome:** Header (`header.tsx`), Sidebar (`sidebar.tsx`), Live Ticker (`live-ticker.tsx`), Multi-Tracker bar (`multi-tracker.tsx`).

---

## 2  Component Inventory

### Core surfaces

| Component | File | Notes |
|-----------|------|-------|
| Header | `components/header.tsx` | Sticky 44 px bar, solid `bg-surface-raised` |
| Sidebar | `components/sidebar.tsx` | Fixed 260 px, solid `bg-surface-raised` |
| Live Ticker | `components/live-ticker.tsx` | Horizontal scroll, solid `bg-surface-raised` |
| Scoreboard | `components/scoreboard.tsx` | Tab bar + league header + match groups |
| Today View | `components/today-view.tsx` | Date strip, filter tabs, sport/league groups |
| Match Detail | `components/match-detail.tsx` | Score card, tab bar, play-by-play |
| Multi-Tracker | `components/multi-tracker.tsx` | Floating bottom bar, only glass-like surface today |

### Repeated elements

| Element | Rendered in | Current style |
|---------|-------------|---------------|
| Match Card (row) | `match-card.tsx` | `h-12`, `border-b border-surface-border`, flat |
| Date pill | `today-view.tsx` | `rounded-full`, solid accent or transparent |
| Filter tab | `today-view.tsx`, `scoreboard.tsx` | Underline indicator, no surface |
| League header | `today-view.tsx`, `scoreboard.tsx` | Flat text + divider line |
| Status pill (LIVE / HT / FT) | `match-card.tsx`, `live-ticker.tsx` | Small badge, `bg-accent-red/15` |
| Team Logo | `team-logo.tsx` | Round fallback initials |
| Form Badge | `form-badge.tsx` | Colored border + tint |
| Calendar Button | `calendar-button.tsx` | Dropdown, solid |
| Search | `search.tsx` | Input + dropdown |
| Knockout Bracket | `knockout-bracket.tsx` | SVG lines + cards |
| Standings Table | `standings.tsx` | Rows with border |
| Stats Dashboard | `stats-dashboard.tsx` | Stat cards |

---

## 3  Current Styling Issues

### 3.1  Flat layers — no depth
Every surface uses the same `bg-surface-raised` or `bg-surface-card` with zero elevation difference. Header, sidebar, ticker, cards, and modals all sit on the same visual plane. There are no shadows, no translucency, and no material differentiation.

### 3.2  Inconsistent spacing and radii
- Radii: `rounded` (4 px), `rounded-sm`, `rounded-lg` (8 px), `rounded-xl` (12 px), `rounded-2xl` (16 px), `rounded-full` used interchangeably.
- Padding: match cards use `px-1`, league headers use `px-3`, buttons mix `px-2` / `px-3` / `px-4`.
- Gaps: `gap-1.5`, `gap-2`, `gap-2.5` without a clear scale.

### 3.3  Inconsistent typography
- Score digits: `text-[17px]` in match card, different in ticker and match detail.
- Labels: `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[12px]`, `text-[13px]` — five arbitrary sizes used without a scale.
- Weight: `font-medium`, `font-semibold`, `font-extrabold`, `font-black` scattered without semantic meaning.

### 3.4  Harsh borders / no shadows
- Every divider is `border-surface-border` (opaque line).
- Zero `box-shadow` usage on cards or surfaces (only `shadow-sm` on one active date pill).
- Borders are hard 1 px lines with no gradient or fade.

### 3.5  Inconsistent separators
- Some sections use `border-t`, some `border-b`, some both, some use a `h-px bg-surface-border` div.
- Sport group sections have `mb-6` while league sections have `mb-3` — no shared spacing rhythm.

---

## 4  Risk Areas for Glass in Live View

### 4.1  Text legibility on blur
- **Scores** are the most critical element. A blur behind white text on a dark translucent surface can wash out. Solution: keep score text large (≥ 17 px), use `font-extrabold`, and add a subtle `text-shadow`.
- **Live clock** (10 px mono green) is small. Requires high contrast against any blurred background.
- **Team names** at 13 px could lose contrast. Ensure minimum 4.5:1 ratio.

### 4.2  Performance hotspots
- **Match card list**: Today View can render 60+ matches across 10+ leagues. Applying `backdrop-filter: blur()` to each row would cause severe jank. **Use fake glass (translucent fill + stroke) for rows.**
- **Ticker**: Continuously animated horizontal scroll. Blur on each item would cause frame drops. **Use fake glass on items, real blur only on the fixed LIVE label.**
- **Score flash animation**: Already triggers repaints. Glass must not add more paint triggers.
- **Multi-Tracker bar**: Already uses `backdrop-blur-md` — acceptable since it's a single element.

### 4.3  Where blur is unnecessary
- Individual match rows → fake glass
- Date strip pills → solid accent, no blur needed
- League header rows → fake glass (too many)
- Tab underline indicators → no change needed
- Form badges → no change needed

**Real blur reserved for:**
- Header (1 element, sticky)
- Ticker LIVE label (1 element, fixed)
- Multi-Tracker bar (1 element, fixed)
- Modal/sheet overlays (occasional)
- Sidebar on mobile (overlay)

---

## 5  Prioritized Rollout Plan

### Step 1: Foundation + Scoreboard Surface (this PR)
1. Create design tokens (`components/ui/glass/tokens.ts`)
2. Add glass CSS variables to `globals.css`
3. Extend `tailwind.config.ts` with glass utilities
4. Build 9 reusable glass components
5. Convert **Header** → `GlassHeader` (real blur)
6. Convert **Live Ticker** → glass styling
7. Convert **Today View** → glass league headers, date strip, filter tabs
8. Convert **Scoreboard** + **Match Card** → `GlassCard` / `GlassRow` (fake glass)
9. Convert **Sidebar** → glass overlay on mobile
10. Add micro-interactions (press scale, score pulse)
11. Add `prefers-reduced-transparency` / `prefers-contrast` support

### Step 2: Match Center (next PR)
- Score card → glass surface
- Detail tabs → glass tab bar
- Play-by-play rows → lighter fake glass
- Timeline events → subtle glass tint

### Step 3: Modals, Filters, Settings
- Search dropdown → glass modal sheet
- Calendar dropdown → glass
- News cards → glass card variant
- Offline/error states → glass surface

---

## Top 15 Components to Refactor First

| Priority | Component | File | Glass Treatment |
|----------|-----------|------|-----------------|
| 1 | Header | `components/header.tsx` | Real blur, glass surface |
| 2 | Match Card | `components/match-card.tsx` | Fake glass row |
| 3 | Scoreboard | `components/scoreboard.tsx` | Glass headers, tabs |
| 4 | Today View | `components/today-view.tsx` | Glass headers, date strip, filters |
| 5 | Live Ticker | `components/live-ticker.tsx` | Fake glass items, blur LIVE label |
| 6 | Sidebar | `components/sidebar.tsx` | Glass surface, blur overlay |
| 7 | Multi-Tracker | `components/multi-tracker.tsx` | Already blur; refine glass tokens |
| 8 | Skeleton loaders | `components/skeleton.tsx` | Glass shimmer effect |
| 9 | Match Detail | `components/match-detail.tsx` | Glass score card, tabs |
| 10 | Search | `components/search.tsx` | Glass dropdown |
| 11 | Standings | `components/standings.tsx` | Glass table rows |
| 12 | Stats Dashboard | `components/stats-dashboard.tsx` | Glass stat cards |
| 13 | Form Badge | `components/form-badge.tsx` | Glass pill variant |
| 14 | News Cards | `components/news/news-card.tsx` | Glass card |
| 15 | Calendar Button | `components/calendar-button.tsx` | Glass dropdown |

---

## Remaining Screens Checklist

- [ ] Match Detail page (`/match/[id]`)
- [ ] News Feed page (`/news`)
- [ ] Head-to-Head component
- [ ] Highlights component
- [ ] Lineup component
- [ ] Knockout Bracket component
- [ ] Offline page
- [ ] Privacy / Support pages
