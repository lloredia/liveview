"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

const WIDGET_LIMIT = 5;
const REFRESH_MS = 60_000;

export function HomeNewsWidget() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);

  useEffect(() => {
    const load = () => {
      fetchNews({ limit: WIDGET_LIMIT })
        .then((res) => setArticles(res.articles))
        .catch(() => setArticles([]));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  if (articles.length === 0) return null;

  return (
    <section
      className="mx-3 mb-4 rounded-lg border border-surface-border bg-surface-card p-3 md:mx-0 md:p-4"
      aria-label="Latest news"
    >
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-dim">
          Latest News
        </h2>
        <Link
          href="/news"
          className="text-[12px] font-semibold text-accent-green hover:underline"
        >
          See all news →
        </Link>
      </div>
      <ul className="space-y-1.5">
        {articles.map((a) => (
          <li key={a.id}>
            <a
              href={a.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 rounded py-1 pr-1 transition-colors hover:bg-surface-hover"
            >
              {a.is_breaking && (
                <span className="shrink-0 text-[10px] font-semibold text-accent-red">
                  BREAKING
                </span>
              )}
              <span className="min-w-0 flex-1 line-clamp-1 text-[13px] font-medium text-text-primary">
                {a.title}
              </span>
              <span className="shrink-0 text-[11px] text-text-muted">
                {a.source} · {relativeTime(a.published_at)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
