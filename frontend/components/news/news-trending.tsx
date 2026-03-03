"use client";

import { useEffect, useState } from "react";
import { fetchTrendingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { FAKE_GLASS, GLASS_RADII } from "@/components/ui/glass/tokens";

interface NewsTrendingProps {
  /** When true, render in a compact list for sidebar; when false, can be used in a sheet. */
  variant?: "sidebar" | "sheet";
  className?: string;
}

export function NewsTrending({ variant = "sidebar", className = "" }: NewsTrendingProps) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    const load = () => {
      fetchTrendingNews()
        .then(setArticles)
        .catch(() => setArticles([]));
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  if (articles.length === 0) return null;

  return (
    <div
      className={`${variant === "sheet" ? "p-4" : ""} ${className}`}
      role="region"
      aria-label="Trending news"
    >
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-muted">
        Trending
      </h3>
      <ol className="space-y-2">
        {articles.slice(0, 10).map((a, i) => (
          <li key={a.id}>
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`
                flex gap-2 rounded-[12px] py-2 pr-2 transition-colors
                hover:bg-glass-hover focus:outline-none focus:ring-2 focus:ring-accent-green/40
                ${variant === "sheet" ? "px-2" : ""}
              `}
            >
              <span
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-glass-elevated text-[12px] font-bold text-accent-green"
                aria-hidden
              >
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-text-primary">
                  {a.title}
                </span>
                <p className="mt-0.5 text-[11px] text-text-muted">
                  {a.source} · {relativeTime(a.published_at)}
                </p>
              </div>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function NewsTrendingSheetContent() {
  return (
    <div className={`rounded-[16px] border border-glass-border ${FAKE_GLASS} p-4`}>
      <NewsTrending variant="sheet" />
    </div>
  );
}
