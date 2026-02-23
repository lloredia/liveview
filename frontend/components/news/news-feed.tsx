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

export function NewsFeed() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");

  const load = useCallback(
    (pageNum: number, append: boolean) => {
      if (pageNum === 1) setLoading(true);

      if (category === "trending") {
        fetchTrendingNews()
          .then((list) => {
            setArticles(list);
            setTotal(list.length);
            setHasNext(false);
            setPage(1);
          })
          .catch(() => setArticles([]))
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
      if (query) params.q = query;

      fetchNews(params)
        .then((res) => {
          setTotal(res.total);
          setHasNext(res.has_next);
          setPage(res.page);
          setArticles((prev) => (append ? [...prev, ...res.articles] : res.articles));
        })
        .catch(() => {
          setArticles((prev) => (append ? prev : []));
          setHasNext(false);
        })
        .finally(() => setLoading(false));
    },
    [category, query],
  );

  useEffect(() => {
    load(1, false);
  }, [load]);

  const handleLoadMore = () => {
    if (!loading && hasNext) load(page + 1, true);
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

        <div className="mb-4 overflow-x-auto pb-1 md:overflow-visible">
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {articles.map((a, i) => (
              <NewsCard
                key={a.id}
                article={a}
                variant={i % 3 === 0 ? "featured" : "compact"}
              />
            ))}
          </div>
        )}

        {!loading && articles.length === 0 && (
          <p className="py-8 text-center text-text-muted">No articles found.</p>
        )}

        {hasNext && articles.length > 0 && category !== "trending" && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loading}
              className="rounded-lg border border-surface-border bg-surface-card px-4 py-2 text-[14px] font-semibold text-text-primary transition-colors hover:bg-surface-hover disabled:opacity-50"
            >
              {loading ? "Loading…" : "Load more"}
            </button>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:sticky lg:top-[44px] lg:h-[calc(100vh-44px)] lg:w-[300px] lg:overflow-y-auto">
        <NewsTrending />
      </aside>
    </div>
  );
}
