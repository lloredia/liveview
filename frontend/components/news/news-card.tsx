"use client";

import type { NewsArticle } from "@/lib/types";
import { relativeTime } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_LABELS, SOURCE_LOGOS } from "./news-constants";

interface NewsCardProps {
  article: NewsArticle;
  variant?: "featured" | "compact";
}

function CategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general;
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${style.bg} ${style.text} ${style.border} border`}
    >
      {label}
    </span>
  );
}

export function NewsCard({ article, variant = "featured" }: NewsCardProps) {
  const logoUrl = SOURCE_LOGOS[article.source];

  if (variant === "compact") {
    return (
      <a
        href={article.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3 rounded-lg border border-surface-border bg-surface-card p-3 transition-shadow hover:shadow-md active:scale-[0.99]"
      >
        {article.image_url ? (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-surface-hover">
            <img
              src={article.image_url}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-20 w-20 shrink-0 rounded-lg bg-surface-hover" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-[13px] font-semibold text-text-primary">
            {article.title}
          </h3>
          {article.summary && (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-text-secondary">
              {article.summary}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="h-3.5 w-3.5 rounded-full object-contain"
              />
            )}
            <span>{article.source}</span>
            <span>·</span>
            <span>{relativeTime(article.published_at)}</span>
            <CategoryBadge category={article.category} />
          </div>
        </div>
      </a>
    );
  }

  return (
    <a
      href={article.source_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block overflow-hidden rounded-lg border border-surface-border bg-surface-card transition-shadow hover:shadow-lg active:scale-[0.99]"
    >
      <div className="relative aspect-video w-full bg-surface-hover">
        {article.image_url ? (
          <img
            src={article.image_url}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : null}
      </div>
      <div className="p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={article.category} />
          {article.leagues?.length ? (
            <span className="text-[10px] text-text-muted">
              · {article.leagues.slice(0, 2).join(", ")}
            </span>
          ) : null}
        </div>
        <h3 className="line-clamp-2 text-[15px] font-semibold text-text-primary">
          {article.title}
        </h3>
        {article.summary && (
          <p className="mt-1 line-clamp-3 text-[13px] text-text-secondary">
            {article.summary}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
          {logoUrl && (
            <img
              src={logoUrl}
              alt=""
              className="h-3.5 w-3.5 rounded-full object-contain"
            />
          )}
          <span>{article.source}</span>
          <span>·</span>
          <span>{relativeTime(article.published_at)}</span>
        </div>
      </div>
    </a>
  );
}
