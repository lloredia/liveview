"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNews, fetchTrendingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { CATEGORY_LABELS } from "./news-constants";
import { NewsCard } from "./news-card";
import { NewsFeedSkeletons } from "./news-skeleton";
import { NewsSearch } from "./news-search";
import { NewsTrending } from "./news-trending";

const CATEGORIES = [
  "all",
  "trending",
  "transfer",
  "injury",
  "trade",
  "draft",
  "result",
  "breaking",
  "rumor",
  "club",
  "analysis",
  "general",
];

const SPORTS = [
  { value: "", label: "All sports" },
  { value: "soccer", label: "Soccer" },
  { value: "basketball", label: "Basketball" },
  { value: "football", label: "Football" },
  { value: "baseball", label: "Baseball" },
  { value: "hockey", label: "Hockey" },
];

const TIME_FILTERS = [
  { value: 0, label: "All time" },
  { value: 6, label: "Last 6h" },
  { value: 24, label: "Last 24h" },
];

export function NewsFeed({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [sport, setSport] = useState<string>("");
  const [hours, setHours] = useState<number>(0);
  const [query, setQuery] = useState("");

  const load = useCallback(
    (pageNum: number, append: boolean) => {
      if (pageNum === 1) {
        setLoading(true);
        setError(null);
        setLoadMoreError(false);
      }

      if (category === "trending") {
        fetchTrendingNews()
          .then((list) => {
            setArticles(list);
            setTotal(list.length);
            setHasNext(false);
            setPage(1);
            setError(null);
          })
          .catch(() => {
            setArticles([]);
            setError("Could not load trending news.");
          })
          .finally(() => setLoading(false));
        return;
      }

      const params: Parameters<typeof fetchNews>[0] = {
        page: pageNum,
        limit: 20,
      };
      if (category !== "all") {
        params.category = category;
      }
      if (sport) params.sport = sport;
      if (hours > 0) params.hours = hours;
      if (query) params.q = query;

      fetchNews(params)
        .then((res) => {
          setTotal(res.total);
          setHasNext(res.has_next);
          setPage(res.page);
          setArticles((prev) => (append ? [...prev, ...res.articles] : res.articles));
          setError(null);
          setLoadMoreError(false);
        })
        .catch(() => {
          if (pageNum === 1) {
            setArticles([]);
            setHasNext(false);
            setError("Could not load news. Check your connection and try again.");
          } else {
            setLoadMoreError(true);
            // Keep hasNext true so user can retry load more
          }
        })
        .finally(() => setLoading(false));
    },
    [category, sport, hours, query],
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  useEffect(() => {
    if (refreshTrigger > 0) load(1, false);
  }, [refreshTrigger, load]);

  const handleLoadMore = () => {
    if (!loading && hasNext) {
      setLoadMoreError(false);
      load(page + 1, true);
    }
  };

  const handleSearch = useCallback((q: string) => {
    setQuery(q);
    setPage(1);
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
      <div className="min-w-0 flex-1">
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <NewsSearch onSearch={handleSearch} />
        </div>

        <div className="mb-3 overflow-x-auto pb-1 md:overflow-visible">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-dim">Sport</p>
          <div className="flex gap-1.5 md:flex-wrap">
            {SPORTS.map((s) => (
              <button
                key={s.value || "all"}
                type="button"
                onClick={() => setSport(s.value)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  sport === s.value
                    ? "bg-accent-green text-white"
                    : "bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 overflow-x-auto pb-1 md:overflow-visible">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-dim">Time</p>
          <div className="flex gap-1.5">
            {TIME_FILTERS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setHours(t.value)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  hours === t.value
                    ? "bg-accent-green text-white"
                    : "bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 overflow-x-auto pb-1 md:overflow-visible">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-text-dim">Category</p>
          <div className="flex gap-1.5 md:flex-wrap">
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(cat)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                  category === cat
                    ? "bg-accent-green text-white"
                    : "bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                }`}
              >
                {cat === "all" ? "All" : cat === "trending" ? "Trending" : CATEGORY_LABELS[cat] ?? cat}
              </button>
            ))}
          </div>
        </div>

        {category !== "trending" ? (
          <div className="lg:hidden">
            <NewsTrending />
          </div>
        ) : null}

        {loading && articles.length === 0 ? (
          <NewsFeedSkeletons count={6} />
        ) : (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a, i) => (
              <div key={a.id} className={i === 0 ? "sm:col-span-2" : undefined}>
                <NewsCard
                  article={a}
                  variant={i === 0 ? "featured" : "compact"}
                  headingLevel={i === 0 ? "h2" : "h3"}
                />
              </div>
            ))}
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <p className="text-center text-text-muted">{error}</p>
            <button
              type="button"
              onClick={() => load(1, false)}
              className="rounded-lg bg-accent-green px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!loading && !error && articles.length === 0 && (
          <p className="py-8 text-center text-text-muted">No articles found.</p>
        )}

        {hasNext && articles.length > 0 && category !== "trending" && (
          <div className="mt-6 flex flex-col items-center gap-2">
            {loadMoreError ? (
              <>
                <p className="text-center text-[13px] text-text-muted">Couldn&apos;t load more.</p>
                <button
                  type="button"
                  onClick={handleLoadMore}
                  className="rounded-lg bg-accent-green px-4 py-2 text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
                >
                  Try again
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loading}
                className="rounded-lg border border-surface-border bg-surface-card px-4 py-2 text-[14px] font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
              >
                {loading ? "Loading…" : "Load more"}
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-[44px] lg:h-[calc(100vh-44px)] lg:w-[300px] lg:overflow-y-auto">
        <NewsTrending />
      </aside>
    </div>
  );
}
