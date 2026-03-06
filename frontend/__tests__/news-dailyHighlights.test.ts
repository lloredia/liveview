import {
  computeHighlights,
  getDateKey,
} from "@/lib/news/dailyHighlights";
import type { NewsArticle } from "@/lib/types";

function makeArticle(
  overrides: Partial<NewsArticle> & { id: string; published_at: string }
): NewsArticle {
  const { id, published_at, sport, trending_score, ...rest } = overrides;
  return {
    id,
    title: "Title",
    summary: null,
    content_snippet: null,
    source: "Test",
    source_url: "https://example.com/1",
    image_url: null,
    category: "general",
    sport: sport ?? null,
    leagues: [],
    teams: [],
    published_at,
    fetched_at: new Date().toISOString(),
    trending_score: trending_score ?? 0,
    is_breaking: false,
    ...rest,
  };
}

describe("getDateKey", () => {
  it("returns YYYY-MM-DD format", () => {
    const key = getDateKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("computeHighlights", () => {
  const now = Date.now();
  const oneHourAgo = new Date(now - 60 * 60 * 1000).toISOString();
  const tenHoursAgo = new Date(now - 10 * 60 * 60 * 1000).toISOString();
  const twentyFiveHoursAgo = new Date(now - 25 * 60 * 60 * 1000).toISOString();

  it("filters to last 24h only", () => {
    const articles = [
      makeArticle({ id: "1", published_at: oneHourAgo }),
      makeArticle({ id: "2", published_at: twentyFiveHoursAgo }),
    ];
    const result = computeHighlights(articles);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
  });

  it("prefers diversity across sports", () => {
    const articles = [
      makeArticle({ id: "1", published_at: oneHourAgo, sport: "soccer" }),
      makeArticle({ id: "2", published_at: oneHourAgo, sport: "soccer" }),
      makeArticle({ id: "3", published_at: tenHoursAgo, sport: "basketball" }),
      makeArticle({ id: "4", published_at: tenHoursAgo, sport: "football" }),
    ];
    const result = computeHighlights(articles);
    expect(result.length).toBeGreaterThanOrEqual(2);
    const sports = result.map((a) => a.sport);
    const unique = new Set(sports);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it("caps at 10 highlights", () => {
    const articles = Array.from({ length: 30 }, (_, i) =>
      makeArticle({
        id: `id-${i}`,
        published_at: new Date(now - (i + 1) * 3600 * 1000).toISOString(),
        sport: "soccer",
      })
    );
    const result = computeHighlights(articles);
    expect(result).toHaveLength(10);
  });

  it("boosts trending articles", () => {
    const articles = [
      makeArticle({ id: "1", published_at: tenHoursAgo, sport: "soccer" }),
      makeArticle({ id: "2", published_at: oneHourAgo, sport: "soccer" }),
    ];
    const trendingIds = new Set(["1"]);
    const result = computeHighlights(articles, trendingIds);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].id).toBe("1");
  });
});
