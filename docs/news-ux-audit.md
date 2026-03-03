# News Section — UX Audit

**Project:** LiveView  
**Scope:** `/news` route and all news components  
**Date:** 2025  
**Design direction:** Apple-style Glass / Liquid Glass; dark mode first; WCAG AA; mobile-first performance.

---

## 1. Friction Points

### Content hierarchy
- **Issue:** The feed uses a 3-column grid (sm:2, lg:3) with the first item spanning 2 columns as “featured.” Hierarchy is implied by size only; there’s no clear “hero” vs “list” structure.
- **Issue:** Category, sport, and time filters are stacked in three separate rows with small uppercase labels. Visual weight is similar, so it’s unclear what to change first.
- **Finding:** Headlines use `line-clamp-2` (featured) or `line-clamp-2` (compact). Font sizes (15px featured, 13px compact) don’t create a strong enough hierarchy for quick scanning.

### Headline scannability
- **Issue:** Featured card uses 15px semibold; compact cards use 13px semibold. On mobile, both can feel small for fast scanning.
- **Issue:** No clear separation between “breaking,” “hero,” and “rest of feed.” Breaking bar is red and separate; hero is a carousel; then a uniform grid.
- **Finding:** External links (e.g. `source_url`) open in new tab with no in-app preview, so users can’t quickly judge relevance before leaving.

### Metadata readability
- **Issue:** Metadata (source, time, category) uses 10–11px. In dark mode, `text-text-muted` may not meet AA for small text.
- **Issue:** Category badges use colored backgrounds (e.g. `bg-purple-500/15`); some combinations may not meet contrast on dark.
- **Finding:** Source is text-only (plus optional favicon). No “why this is here” (e.g. “Trending because…” or “Updated 5m ago”).

### Trending sidebar
- **Issue:** “Trending” is a numbered list (1–10) with title + source · time. No explanation of why an item is trending (e.g. trending_score, recency, or engagement).
- **Issue:** On mobile, trending appears above the feed when category ≠ “trending,” then again in a sticky sidebar on desktop. Duplication and different placements can confuse.
- **Issue:** Sidebar is `lg:w-[300px]` and sticky; on smaller laptops the main feed can feel squeezed.
- **Finding:** Useful for discovery but underused: no “Most discussed” or “Recently updated” differentiation.

### Filtering
- **Issue:** Three separate filter rows (Sport, Time, Category) with many pills (e.g. 11 categories). No search in the header; search is inline above filters.
- **Issue:** “Trending” is a category that replaces the feed with a different API (`fetchTrendingNews`). Users might not realize it’s a different mode.
- **Issue:** No filter chip summary (e.g. “Soccer · Last 24h · Transfers”). Active state is green pill only; clearing filters requires clicking “All” / “All sports” / “All time.”
- **Finding:** Filters are powerful but not intuitive; a single “Filter” control (e.g. modal) could simplify.

---

## 2. Interaction Gaps

| Gap | Severity | Notes |
|-----|----------|--------|
| No save/bookmark | High | No way to save articles for later; users lose items when they leave. |
| No reading progress | Medium | Articles open externally; in-app there’s no scroll or reading progress. Could add feed scroll progress or progress for an expanded preview. |
| No article preview expansion | High | Tapping a card goes straight to `source_url`. No inline or modal preview (e.g. summary + “Read more”). |
| No swipe interactions | Low | No swipe to save, dismiss, or next/prev in hero. Could add optional swipe-to-bookmark. |
| No keyboard nav | Medium | Filter pills and cards are not in a logical tab order; no “skip to content” or “skip to filters.” |
| No share | Low | No native share or copy-link for articles. |

---

## 3. Mobile Experience

### Spacing
- **Issue:** Main content uses `px-3 py-4`; cards in a single column have `gap-4`. Tap targets are mostly the full card; filter pills are `py-1.5` (~36px touch target height is acceptable).
- **Issue:** Hero carousel is 200px tall (md: 280px). On small screens the bottom overlay (category, source, title, summary) can feel cramped.
- **Finding:** Spacing is adequate but not generous; increasing card padding and gap would reduce fatigue.

### Scroll fatigue
- **Issue:** Many filter pills (Sport + Time + Category) cause horizontal scroll on mobile (`overflow-x-auto`). Users scroll horizontally then vertically; cognitive load is high.
- **Issue:** No infinite scroll; “Load more” at the bottom requires a deliberate tap. Good for performance, but some users expect continuous scroll.
- **Finding:** Reducing visible filter options (e.g. horizontal “All | Soccer | Basketball | …” with rest in a modal) would shorten horizontal scroll.

### Tap targets
- **Issue:** Dismiss on breaking bar is a small icon button (~24px). Card tap target is the full card (good). “Load more” and “Try again” buttons are adequately sized.
- **Finding:** Primary gaps are the breaking-dismiss target and any future icon-only actions (e.g. bookmark); ensure ≥44×44pt equivalent.

---

## 4. Technical Notes (for refactor)

- **Data source:** `fetchNews`, `fetchTrendingNews`, `fetchBreakingNews` from `@/lib/api`. No change required.
- **Routing:** App Router `app/news/page.tsx`; metadata can stay in layout or page for SEO.
- **Images:** `NewsImage` uses `<img>` with lazy loading and error/placeholder. Consider `next/image` for known domains (e.g. ESPN) where possible to reduce layout shift and improve performance.
- **State:** Feed state (page, category, sport, hours, query) is local. Bookmark state will be localStorage.

---

## 5. Summary

| Area | Verdict | Priority |
|------|---------|----------|
| Content hierarchy | Needs clearer hero vs list and typography scale | P1 |
| Headline scannability | Improve size/weight and add preview before leaving | P1 |
| Metadata | Increase contrast; add “why trending” in sidebar | P2 |
| Trending sidebar | Simplify; add context (source + time); move to sheet on mobile | P1 |
| Filtering | Consolidate into search + filter modal; reduce pill rows | P1 |
| Save/bookmark | Add localStorage bookmarks | P1 |
| Reading progress | Add for expanded preview or feed scroll | P2 |
| Preview expansion | Add inline/sheet preview before external link | P1 |
| Swipe | Optional swipe-to-save on cards | P3 |
| Mobile spacing/tap | Slightly increase; ensure 44pt for icon buttons | P2 |
| Keyboard / a11y | Tab order, aria, skip links, reduced motion | P1 |

---

## 6. Recommended IA (for Phase 2)

- **Top:** Single glass header with: Back to LiveView, “News” title, search field, filter icon (opens modal).
- **Below header:** One row of horizontal category pills: All | Soccer | Basketball | Football | Baseball | Hockey (sport-first; category/time in modal).
- **Main feed:** Featured hero (one large glass card) → stacked news cards (single column on mobile, 2–3 on desktop) → “Load more.”
- **Sidebar (desktop):** Trending + “Most discussed” / “Recently updated” with source + time; on mobile, sidebar content in a slide-up sheet (e.g. “Trending” button opens sheet).

This audit is the input for the News refactor (glass design system, performance, accessibility).
