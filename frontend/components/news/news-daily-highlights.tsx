"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNews, fetchTrendingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime, sportIcon } from "@/lib/utils";
import {
  computeHighlights,
  getCachedHighlights,
  setCachedHighlights,
} from "@/lib/news/dailyHighlights";
import { NewsImage } from "./news-image";
import { GlassModalSheet } from "@/components/ui/glass";
import { FAKE_GLASS } from "@/components/ui/glass/tokens";

const REFRESH_COOLDOWN_MS = 60_000;

export function NewsDailyHighlights() {
  const [items, setItems] = useState<NewsArticle[]>(() => getCachedHighlights() ?? []);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<number>(0);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [newsRes, trending] = await Promise.all([
        fetchNews({ limit: 50, hours: 24 }),
        fetchTrendingNews(),
      ]);
      const trendingIds = new Set(trending.map((a) => a.id));
      const highlights = computeHighlights(newsRes.articles, trendingIds);
      setItems(highlights);
      setCachedHighlights(highlights);
      setLastRefresh(Date.now());
    } catch {
      const cached = getCachedHighlights();
      if (cached?.length) setItems(cached);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const cached = getCachedHighlights();
    if (cached?.length) {
      setItems(cached);
      return;
    }
    load();
  }, [load]);

  const canRefresh = Date.now() - lastRefresh >= REFRESH_COOLDOWN_MS;

  const handleRefresh = () => {
    if (!canRefresh || refreshing) return;
    load();
  };

  if (items.length === 0) return null;

  return (
    <>
      <section
        className="mb-6 rounded-[16px] border border-glass-border bg-glass/80 p-4 md:mb-8"
        aria-labelledby="daily-highlights-title"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2
            id="daily-highlights-title"
            className="text-heading-sm font-semibold text-text-primary"
          >
            Daily Highlights
          </h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={!canRefresh || refreshing}
              className="flex h-8 w-8 items-center justify-center rounded-[8px] text-text-muted transition-colors hover:bg-glass-hover hover:text-text-primary disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent-green/50"
              aria-label={refreshing ? "Refreshing…" : canRefresh ? "Refresh highlights" : "Refresh available soon"}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className={refreshing ? "animate-spin" : ""}
              >
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" />
                <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" strokeLinecap="round" />
                <path d="M21 21v-5h-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="rounded-[8px] px-2 py-1 text-label-sm font-semibold text-accent-green hover:bg-accent-green/10 focus:outline-none focus:ring-2 focus:ring-accent-green/50"
            >
              See all
            </button>
          </div>
        </div>
        <ul className="space-y-2">
          {items.slice(0, 5).map((a) => (
            <li key={a.id}>
              <a
                href={a.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex gap-3 rounded-[12px] p-2 transition-colors hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-accent-green/40 ${FAKE_GLASS}`}
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[8px]">
                  <NewsImage
                    src={a.image_url}
                    sport={a.sport}
                    containerClassName="h-full w-full"
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {a.sport ? (
                    <span className="text-[12px]" title={a.sport} aria-hidden>
                      {sportIcon(a.sport)}
                    </span>
                  ) : null}
                  <p className="line-clamp-2 text-body-sm font-medium text-text-primary">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {a.source} · {relativeTime(a.published_at)}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <GlassModalSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Daily Highlights"
      >
        <ul className="space-y-2 max-h-[70vh] overflow-y-auto">
          {items.map((a) => (
            <li key={a.id}>
              <a
                href={a.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex gap-3 rounded-[12px] p-2 transition-colors hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-accent-green/40"
                onClick={() => setSheetOpen(false)}
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-[8px]">
                  <NewsImage
                    src={a.image_url}
                    sport={a.sport}
                    containerClassName="h-full w-full"
                    className="object-cover"
                    sizes="56px"
                  />
                </div>
                <div className="min-w-0 flex-1">
                  {a.sport ? (
                    <span className="text-[12px]" title={a.sport} aria-hidden>
                      {sportIcon(a.sport)}
                    </span>
                  ) : null}
                  <p className="line-clamp-2 text-body-sm font-medium text-text-primary">
                    {a.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-text-muted">
                    {a.source} · {relativeTime(a.published_at)}
                  </p>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </GlassModalSheet>
    </>
  );
}
