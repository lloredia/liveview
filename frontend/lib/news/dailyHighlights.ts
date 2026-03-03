import type { NewsArticle } from "@/lib/types";

const CACHE_KEY_PREFIX = "lv_news_highlights_";
const MAX_HIGHLIGHTS = 10;
const MAX_PER_SPORT = 2;
const HOURS_24_MS = 24 * 60 * 60 * 1000;

/** Date key for today in America/Chicago (YYYY-MM-DD) for cache. */
export function getDateKey(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Chicago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
}

function parsePublishedAt(article: NewsArticle): number {
  return new Date(article.published_at).getTime();
}

function isLast24h(article: NewsArticle): boolean {
  const t = parsePublishedAt(article);
  return Date.now() - t <= HOURS_24_MS;
}

/**
 * Score article for highlights: recency (newer = higher) + trending_score + sport diversity.
 * Trending list IDs get a boost.
 */
function score(
  article: NewsArticle,
  trendingIds: Set<string>,
): number {
  const age = Date.now() - parsePublishedAt(article);
  const recency = Math.max(0, 1 - age / HOURS_24_MS);
  const trendingBoost = trendingIds.has(article.id) ? 0.3 : 0;
  const trendScore = (article.trending_score ?? 0) * 0.01;
  return recency * 0.6 + trendingBoost + trendScore;
}

/**
 * Compute 5–10 daily highlights from articles:
 * - Filter last 24h
 * - Score by recency + trending
 * - Pick up to 2 per sport, then fill by score
 */
export function computeHighlights(
  articles: NewsArticle[],
  trendingIds: Set<string> = new Set(),
): NewsArticle[] {
  const recent = articles.filter(isLast24h);
  const scored = recent
    .map((a) => ({ article: a, score: score(a, trendingIds) }))
    .sort((a, b) => b.score - a.score);

  const bySport = new Map<string, NewsArticle[]>();
  const result: NewsArticle[] = [];
  const usedIds = new Set<string>();

  for (const { article } of scored) {
    if (result.length >= MAX_HIGHLIGHTS) break;
    if (usedIds.has(article.id)) continue;
    const sport = article.sport ?? "general";
    const list = bySport.get(sport) ?? [];
    if (list.length >= MAX_PER_SPORT) continue;
    list.push(article);
    bySport.set(sport, list);
    result.push(article);
    usedIds.add(article.id);
  }

  if (result.length < MAX_HIGHLIGHTS) {
    for (const { article } of scored) {
      if (result.length >= MAX_HIGHLIGHTS) break;
      if (!usedIds.has(article.id)) {
        result.push(article);
        usedIds.add(article.id);
      }
    }
  }

  return result.slice(0, MAX_HIGHLIGHTS);
}

export function getCachedHighlights(): NewsArticle[] | null {
  if (typeof window === "undefined") return null;
  try {
    const key = CACHE_KEY_PREFIX + getDateKey();
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as NewsArticle[];
  } catch {
    return null;
  }
}

export function setCachedHighlights(articles: NewsArticle[]): void {
  if (typeof window === "undefined") return;
  try {
    const key = CACHE_KEY_PREFIX + getDateKey();
    localStorage.setItem(key, JSON.stringify(articles));
  } catch {
    // quota or disabled
  }
}
