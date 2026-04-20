"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchNews } from "@/lib/api";
import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { CATEGORY_LABELS } from "./news-constants";
import { NewsImage } from "./news-image";
import { FAKE_GLASS, GLASS_RADII } from "@/components/ui/glass/tokens";

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

  const article = articles[index];
  const label = CATEGORY_LABELS[article.category] ?? article.category;

  return (
    <div
      className={`relative mb-4 overflow-hidden ${GLASS_RADII.card} border border-glass-border ${FAKE_GLASS}`}
      role="region"
      aria-label="Featured news"
    >
      <div className="relative aspect-[16/10] w-full md:aspect-[21/9]">
        {articles.map((a, i) => {
          const isActive = i === index;
          return (
            <div
              key={a.id}
              className={`absolute inset-0 transition-opacity duration-500 ${
                isActive ? "z-10 opacity-100" : "z-0 opacity-0 pointer-events-none"
              }`}
              aria-hidden={!isActive}
            >
              <a
                href={a.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex h-full w-full flex-col focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:ring-inset"
              >
                <NewsImage
                  src={a.image_url}
                  sport={a.sport}
                  alt={a.title}
                  containerClassName="absolute inset-0"
                  priority={i === index || i === (index + 1) % articles.length}
                  placeholder={
                    <div className="h-full w-full bg-gradient-to-br from-accent-green/10 to-glass-hover" />
                  }
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.02] motion-reduce:transition-none"
                />
                <div
                  className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-transparent"
                  aria-hidden
                />
                <div className="absolute bottom-0 left-0 right-0 p-4 md:p-5">
                  <div className="mb-1.5 flex items-center gap-2 text-label-xs text-white/70">
                    <span className="rounded-full border border-white/25 bg-white/10 px-2 py-0.5 font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                      {label}
                    </span>
                    <span className="truncate">
                      {a.source} · {relativeTime(a.published_at)}
                    </span>
                  </div>
                  <h2 className="line-clamp-2 text-body-md font-bold leading-tight text-white md:text-xl">
                    {a.title}
                  </h2>
                </div>
              </a>
            </div>
          );
        })}

        {articles.length > 1 ? (
          <div className="absolute bottom-3 left-4 right-4 z-20 flex justify-center gap-1.5">
            {articles.map((_, i) => (
              <button
                key={i}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  goTo(i);
                }}
                className={`h-1 rounded-full transition-all focus:outline-none focus:ring-2 focus:ring-white/50 ${
                  i === index ? "w-4 bg-white" : "w-1 bg-white/40 hover:bg-white/70"
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
