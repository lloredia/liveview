# News Section Refactor — Summary & Checklist

## Before / After

### Before
- **Layout:** App Header + Breaking bar + Hero carousel + Feed (search inline, 3 filter rows: Sport, Time, Category) + sticky Trending sidebar.
- **Cards:** Flat `bg-surface-card` with `border-surface-border`; direct link to `source_url`; no preview, no bookmark.
- **Filters:** Many pills in three rows; horizontal scroll on mobile; "Trending" as a category replaced the feed.
- **Trending:** Numbered list with title + source · time; duplicated on mobile (above feed) and desktop (sidebar).
- **No:** Reading progress, save for later, expandable preview, filter modal, back-to-LiveView in context.

### After
- **Layout:** News-only header (Back, News, Search, Filter icon) + horizontal sport pills (All | Soccer | Basketball | …) + Featured hero (glass) + stacked cards + Load more. Trending in sidebar on desktop; "Trending" button opens sheet on mobile.
- **Cards:** Fake glass (translucent fill, 1px border, soft shadow); no blur on cards. Tap expands inline preview (summary + "Read more"); bookmark icon (localStorage). Hover: lift + shadow (desktop).
- **Filters:** Single Filter icon opens `GlassModalSheet` with Sport, Time, Category. Blur only on modal.
- **Trending:** Same data; copy shows "Source · time"; sidebar uses glass container; mobile uses sheet.
- **Added:** Reading progress bar (top, thin; hidden when `prefers-reduced-motion`), Save for later (bookmark), Expandable preview, Back to LiveView in header, SEO metadata in `app/news/layout.tsx`.

---

## Performance Checklist

| Item | Status |
|------|--------|
| No heavy `backdrop-filter` on list items | ✅ Cards use `FAKE_GLASS` (no blur) |
| Blur only on header, filter modal, search dropdown | ✅ `GlassHeader`, `GlassModalSheet` use real glass |
| `next/image` for thumbnails | ⚠️ `NewsImage` still uses `<img>`; remotePatterns only has ESPN. Can add next/image for allowed origins in a follow-up. |
| Lazy load images below fold | ✅ `NewsImage` uses `loading={priority ? "eager" : "lazy"}` |
| Avoid layout shift | ✅ Skeleton and cards use fixed aspect / min heights |
| Memoize card components | ✅ `NewsCard` wrapped in `memo()` |
| Dynamic import for heavy components | ⚠️ Filter sheet and trending sheet are not lazy-loaded (acceptable for current bundle). |

---

## Accessibility Checklist

| Item | Status |
|------|--------|
| Contrast (WCAG AA) | ✅ Text uses `text-text-primary`, `text-text-secondary`, `text-text-muted`; category badges use existing palette. |
| Focus and keyboard | ✅ Buttons and links have `focus:ring-2 focus:ring-accent-green/50`; Filter and Trending sheets trap focus (modal). |
| Aria labels | ✅ "Back to LiveView", "Search news", "Open filters", "Save for later", "Reading progress", "Article preview", "Trending", "Filters". |
| Skip to content | ✅ `main#main-content` with `role="main"` and `aria-label="News feed"`; root layout skip link targets `#main-content`. |
| `prefers-reduced-motion` | ✅ Reading progress hidden via `.news-reading-progress { display: none }` in reduced-motion media query; transitions shortened globally. |
| Reduce transparency | ✅ Existing `@media (prefers-reduced-transparency)` in globals.css replaces glass with solid surfaces. |

---

## TODO (Future Improvements)

1. **next/image for news thumbnails:** Use `next/image` with `fill` + `sizes` for allowed `remotePatterns` (e.g. ESPN); keep `<img>` fallback for other domains to avoid layout shift.
2. **Swipe to save (mobile):** Optional swipe gesture on card to toggle bookmark (e.g. `react-swipeable` or touch handlers).
3. **Infinite scroll:** Replace "Load more" with intersection-observer–based loading when near bottom (optional, with rate limit).
4. **Saved articles page:** Dedicated route listing `getSavedArticleIds()` with optional sync (e.g. backend later).
5. **Share button:** Native Web Share API or copy-link on card or expanded preview.
6. **Category in header or pills:** Show active category (e.g. "Transfers") in a chip next to sport pills or in header for clarity.
