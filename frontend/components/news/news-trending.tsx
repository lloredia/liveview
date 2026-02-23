"use client";

import { useEffect, useState } from "react";
import { fetchTrendingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

export function NewsTrending() {
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
    <div className="mb-6 md:mb-0" role="region" aria-label="Trending news">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-text-dim">
        Trending
      </h3>
      <ol className="space-y-2">
        {articles.slice(0, 10).map((a, i) => (
          <li key={a.id}>
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex gap-2 rounded-lg py-1.5 pr-2 transition-colors hover:bg-surface-hover"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[12px] font-bold text-accent-green">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <span className="line-clamp-2 text-[13px] font-medium text-text-primary">
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
