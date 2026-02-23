"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { CATEGORY_LABELS } from "./news-constants";
import { NewsImage } from "./news-image";

const HERO_SLIDES = 5;
const SLIDE_INTERVAL_MS = 6000;

export function NewsHero({ refreshTrigger = 0 }: { refreshTrigger?: number }) {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetchNews({ limit: HERO_SLIDES })
      .then((res) => res.articles)
      .then(setArticles)
      .catch(() => setArticles([]));
  }, [refreshTrigger]);

  useEffect(() => {
    if (articles.length <= 1) return;
    const t = setInterval(() => {
      setIndex((i) => (i + 1) % articles.length);
    }, SLIDE_INTERVAL_MS);
    return () => clearInterval(t);
  }, [articles.length]);

  const goTo = useCallback((i: number) => {
    setIndex(i);
  }, []);

  if (articles.length === 0) return null;

  return (
    <div
      className="group relative mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-card md:mb-8"
      role="region"
      aria-label="Featured news slideshow"
    >
      <div className="relative h-[200px] w-full md:h-[280px]">
        {articles.map((article, i) => {
          const label = CATEGORY_LABELS[article.category] ?? article.category;
          const isActive = i === index;
          return (
            <a
              key={article.id}
              href={article.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className={`absolute inset-0 flex flex-col transition-opacity duration-500 ${
                isActive ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
              }`}
              aria-hidden={!isActive}
            >
              <NewsImage
                src={article.image_url}
                sport={article.sport}
                alt={article.title}
                containerClassName="absolute inset-0"
                priority={i === index || i === (index + 1) % articles.length}
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
            </a>
          );
        })}

        {articles.length > 1 ? (
          <div className="absolute bottom-3 left-4 right-4 z-20 flex justify-center gap-1.5 md:bottom-4 md:left-6 md:right-6">
            {articles.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index ? "w-5 bg-white" : "w-1.5 bg-white/50 hover:bg-white/70"
                }`}
                aria-label={`Go to slide ${i + 1} of ${articles.length}`}
                aria-current={i === index ? "true" : undefined}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
