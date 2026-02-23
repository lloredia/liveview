"use client";

import { useEffect, useState } from "react";
import { fetchNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { CATEGORY_LABELS } from "./news-constants";
import { NewsImage } from "./news-image";

export function NewsHero({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [article, setArticle] = useState<NewsArticle | null>(null);

  useEffect(() => {
    fetchNews({ limit: 1 })
      .then((res) => res.articles[0] ?? null)
      .then(setArticle)
      .catch(() => setArticle(null));
  }, [refreshTrigger]);

  if (!article) return null;

  const label = CATEGORY_LABELS[article.category] ?? article.category;

  return (
    <a
      href={article.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="group relative mb-6 block overflow-hidden rounded-xl border border-surface-border bg-surface-card md:mb-8"
    >
      <div className="relative h-[200px] w-full md:h-[280px]">
        <NewsImage
          src={article.image_url}
          sport={article.sport}
          alt={article.title}
          containerClassName="absolute inset-0"
          placeholder={
            <div className="h-full w-full bg-gradient-to-br from-accent-green/20 to-surface-hover" />
          }
          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
          aria-hidden
        />
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6">
          <span className="mb-2 inline-block rounded-full bg-white/20 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
            {label}
          </span>
          <p className="text-[11px] text-white/80">
            {article.source} · {relativeTime(article.published_at)}
          </p>
          <h2 className="mt-1 text-[20px] font-bold leading-tight text-white md:text-2xl">
            {article.title}
          </h2>
          {article.summary && (
            <p className="mt-2 line-clamp-2 text-[13px] text-white/90">
              {article.summary}
            </p>
          )}
        </div>
      </div>
    </a>
  );
}
