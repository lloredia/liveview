"use client";

import { useEffect, useState } from "react";
import { fetchBreakingNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";

const DISMISS_KEY = "liveview_news_breaking_dismissed";

export function NewsBreaking() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
      } catch {
        setDismissed(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchBreakingNews()
      .then(setArticles)
      .catch(() => setArticles([]));
  }, []);

  useEffect(() => {
    if (articles.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % articles.length);
    }, 6000);
    return () => clearInterval(t);
  }, [articles.length]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  };

  if (dismissed || articles.length === 0) return null;

  const article = articles[index];

  return (
    <div
      className="border-b border-red-500/30 bg-red-600/15 px-3 py-2 md:px-4"
      role="region"
      aria-label="Breaking news"
    >
      <div className="flex items-center justify-between gap-2">
        <a
          href={article.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="min-w-0 flex-1"
        >
          <span className="mr-2 inline-flex items-center gap-1 text-[11px] font-bold text-red-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            BREAKING
          </span>
          <span className="text-[13px] font-semibold text-text-primary">
            {article.title}
          </span>
          <span className="ml-1.5 text-[11px] text-text-muted">
            {article.source} · {relativeTime(article.published_at)}
          </span>
        </a>
        <button
          type="button"
          onClick={handleDismiss}
          className="shrink-0 rounded p-1 text-text-muted transition-colors hover:bg-red-500/20 hover:text-text-primary"
          aria-label="Dismiss breaking news"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
