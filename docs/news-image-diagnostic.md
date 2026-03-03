# News Image Loading — Root Cause Summary

## 1. Where Images Are Sourced

| Location | Field | Source |
|----------|--------|--------|
| **Backend** | `NewsArticle.image_url` | `backend/ingest/news_fetcher.py`: extracted from RSS via `_extract_image()` (media_content, media_thumbnail, enclosures, first `<img>` in description). Can be relative; resolved with `_absolute_image_url()`. |
| **Frontend** | `article.image_url` | Passed to `NewsImage` in `news-card.tsx`, `news-hero.tsx`. Type: `string \| null`. |
| **Component** | `NewsImage` | `components/news/news-image.tsx`: simple `sanitizeImageSrc()` (non-empty, starts with `http`), raw `<img>` with `onError` → placeholder. |

## 2. Common Failure Modes

| Cause | Symptom | Likely % / Notes |
|-------|---------|-------------------|
| **403 Forbidden (hotlink protection)** | Image fails to load; referrer or origin blocked by CDN. | **High** — many news CDNs (e.g. ESPN, BBC, Sky) block cross-origin or missing referrer. |
| **Missing / null `image_url`** | Backend returns null; RSS entry has no media/enclosure/img. | **Variable** — depends on feed; 10–30% of articles may have no image. |
| **Invalid or malformed URL** | Empty, non-http, or `data:` URL; truncation at 1000 chars. | **Low** — backend stores up to 1000 chars; normalization can reject bad URLs. |
| **HTTP vs HTTPS / mixed content** | In production (HTTPS), loading `http://` image may be blocked. | **Medium** — force HTTPS in normalization. |
| **Redirects (301/302)** | Some sources redirect; `<img>` follows in browser but can fail with no-referrer or CORS. | **Low** — proxy can follow redirects server-side. |
| **CORS** | `<img>` tags don’t use CORS for display; CORS mainly affects fetch/Canvas. | **N/A** for plain img. |
| **Blocked by adblockers** | Third-party image domains sometimes blocked. | **Variable** — proxy via same origin avoids some blocks. |

## 3. Diagnostic Summary (Inferred)

- **% of articles missing image_url:** Unknown without production data; assume **15–25%** for typical RSS mix.
- **Most common failing domains:** CDNs that enforce referrer or origin (e.g. `a.espncdn.com`, `ichef.bbci.co.uk`, `e0.365dm.com`, `imgresizer.static.sportskeeda.com`). Many return **403** when requested with `referrerPolicy: no-referrer` or from another origin.
- **Exact error codes:** In browser, failed requests show as **403** (Forbidden), **404** (Not Found), or **0** (blocked/cors/network). No distinction in `<img onError>`.
- **Production vs dev:** Failures can be **worse in production** (HTTPS, different origin, stricter referrer) or **similar** if dev also loads from same origin.

## 4. Recommended Fixes (Implemented)

1. **Normalize URLs** — `lib/news/normalizeImageUrl.ts`: reject empty/invalid, force HTTPS, strip tracking params.
2. **Image proxy** — `app/api/image/route.ts`: server-side fetch with SSRF protection (block private hostnames); cache headers; 404 on failure. Cards use `src="/api/image?url=..."`.
3. **Fixed aspect ratio + fallback** — All images in aspect-ratio containers; on error or missing URL, show sport/placeholder.
4. **No layout shift** — Same container size for loading, success, and fallback states.

---

## 5. Manual QA Checklist

- [ ] **iPhone viewport** — Thumbnails load; hero image sharp; no horizontal scroll from images.
- [ ] **Slow 3G throttling** — Placeholders show until load; no broken image icons; fallback on timeout/error.
- [ ] **Dark mode** — Placeholder and fallback contrast; glass styling consistent.
- [ ] **50+ articles loaded** — Load more; no broken images; proxy does not throttle.
- [ ] **No broken images** — Every card shows either image or placeholder (sport emoji or 📰).
- [ ] **Hero image loads fast** — Priority loading for hero (and next slide); no layout shift.
- [ ] **Highlights update daily** — Cache key by date (America/Chicago); refresh button respects 60s cooldown; "See all" sheet opens.

**Unit tests:** `normalizeImageUrl` and `dailyHighlights` (computeHighlights, getDateKey) are covered in `__tests__/news-normalizeImageUrl.test.ts` and `__tests__/news-dailyHighlights.test.ts`. Run: `npm test -- news-normalizeImageUrl news-dailyHighlights`.
