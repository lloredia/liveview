"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNews, fetchTrendingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { NewsCard } from "./news-card";
import { NewsFeedSkeletons } from "./news-skeleton";
import { NewsHeader } from "./news-header";
import { NewsCategoryPills } from "./news-category-pills";
import { NewsFilterSheet } from "./news-filter-sheet";
import { NewsTrending, NewsTrendingSheetContent } from "./news-trending";
import { NewsHero } from "./news-hero";
import { getSavedArticleIds } from "@/lib/news-saved";
import { GlassModalSheet } from "@/components/ui/glass";

export function NewsFeed({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [heroTrigger, setHeroTrigger] = useState(0);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [category, setCategory] = useState("all");
  const [sport, setSport] = useState("");
  const [hours, setHours] = useState(0);
  const [query, setQuery] = useState("");
  const [filterOpen, setFilterOpen] = useState(false);
  const [trendingSheetOpen, setTrendingSheetOpen] = useState(false);
  const [savedIds, setSavedIds] = useState<string[]>([]);

  useEffect(() => {
    setSavedIds(getSavedArticleIds());
    const handler = () => setSavedIds(getSavedArticleIds());
    window.addEventListener("news-saved-change", handler);
    return () => window.removeEventListener("news-saved-change", handler);
  }, []);

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
      if (category !== "all") params.category = category;
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
    if (refreshTrigger > 0) {
      load(1, false);
      setHeroTrigger((t) => t + 1);
    }
  }, [refreshTrigger, load]);

  const handleLoadMore = () => {
    if (!loading && hasNext) {
      setLoadMoreError(false);
      load(page + 1, true);
    }
  };

  return (
    <>
      <main id="main-content" className="min-h-[100dvh]" role="main" aria-label="News feed">
      <NewsHeader
        onSearch={setQuery}
        onOpenFilter={() => setFilterOpen(true)}
      />
      <div className="flex flex-col gap-6 px-3 pb-8 md:px-4 lg:flex-row lg:gap-8">
        <div className="min-w-0 flex-1">
          <div className="mb-4">
            <NewsCategoryPills sport={sport} onSportChange={setSport} />
          </div>

          {category !== "trending" && (
            <NewsHero refreshTrigger={heroTrigger + refreshTrigger} />
          )}

          {category !== "trending" ? (
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setTrendingSheetOpen(true)}
                className="mb-4 w-full rounded-[16px] border border-glass-border bg-glass/60 py-3 text-body-sm font-semibold text-text-primary transition-colors hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-accent-green/50"
              >
                Trending
              </button>
            </div>
          ) : null}

          {loading && articles.length === 0 ? (
            <NewsFeedSkeletons count={6} />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {articles.map((a, i) => (
                <div key={a.id} className={i === 0 ? "sm:col-span-2" : undefined}>
                  <NewsCard
                    article={a}
                    variant={i === 0 ? "featured" : "compact"}
                    headingLevel={i === 0 ? "h2" : "h3"}
                    savedIds={savedIds}
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
                className="rounded-[12px] bg-accent-green px-4 py-2 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-green/50"
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
                  <p className="text-center text-body-sm text-text-muted">Couldn&apos;t load more.</p>
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    className="rounded-[12px] bg-accent-green px-4 py-2 text-body-sm font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent-green/50"
                  >
                    Try again
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={handleLoadMore}
                  disabled={loading}
                  className="rounded-[12px] border border-glass-border bg-glass/80 px-4 py-2 text-body-sm font-semibold text-text-primary transition-colors hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-accent-green/50 disabled:opacity-50"
                >
                  {loading ? "Loading…" : "Load more"}
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="hidden w-full shrink-0 lg:block lg:w-[300px] lg:sticky lg:top-14 lg:max-h-[calc(100dvh-3.5rem)] lg:overflow-y-auto">
          <div className="rounded-[16px] border border-glass-border bg-glass/60 p-4">
            <NewsTrending variant="sidebar" />
          </div>
        </aside>
      </div>

      <NewsFilterSheet
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        sport={sport}
        category={category}
        hours={hours}
        onSportChange={setSport}
        onCategoryChange={setCategory}
        onHoursChange={setHours}
      />

      <GlassModalSheet
        open={trendingSheetOpen}
        onClose={() => setTrendingSheetOpen(false)}
        title="Trending"
      >
        <NewsTrendingSheetContent />
      </GlassModalSheet>
      </main>
    </>
  );
}
