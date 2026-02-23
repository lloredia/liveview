"use client";

import { useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { relativeTime, sportIcon } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_LABELS, SOURCE_LOGOS } from "./news-constants";
import { NewsImage } from "./news-image";

interface NewsCardProps {
  article: NewsArticle;
  variant?: "featured" | "compact";
  /** Use h2 for the lead card (featured), h3 otherwise */
  headingLevel?: "h2" | "h3";
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

function SourceLogo({ source, logoUrl, className }: { source: string; logoUrl: string | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={className}
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <span
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-surface-hover text-[9px] font-bold text-text-muted ${className ?? ""}`}
      aria-hidden
    >
      {source.charAt(0).toUpperCase()}
    </span>
  );
}

export function NewsCard({ article, variant = "featured", headingLevel }: NewsCardProps) {
  const logoUrl = SOURCE_LOGOS[article.source];
  const Heading = headingLevel === "h2" ? "h2" : "h3";

  if (variant === "compact") {
    return (
      <a
        href={article.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex gap-3 rounded-lg border border-surface-border bg-surface-card p-3 transition-shadow hover:shadow-md active:scale-[0.99]"
      >
        <NewsImage
          src={article.image_url}
          sport={article.sport}
          containerClassName="h-20 w-20 shrink-0 rounded-lg bg-surface-hover"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {article.sport ? (
              <span className="text-[14px]" title={article.sport ?? undefined}>
                {sportIcon(article.sport)}
              </span>
            ) : null}
            <Heading className="line-clamp-2 flex-1 text-[13px] font-semibold text-text-primary">
              {article.title}
            </Heading>
          </div>
          {article.teams?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {article.teams.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {article.summary && (
            <p className="mt-0.5 line-clamp-2 text-[12px] text-text-secondary">
              {article.summary}
            </p>
          )}
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
            <SourceLogo source={article.source} logoUrl={logoUrl} className="h-3.5 w-3.5 rounded-full object-contain" />
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
      <NewsImage
        src={article.image_url}
        sport={article.sport}
        containerClassName="relative aspect-video w-full bg-surface-hover"
        className="h-full w-full object-cover"
      />
      <div className="p-3">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          {article.sport ? (
            <span className="text-[16px]" title={article.sport ?? undefined}>
              {sportIcon(article.sport)}
            </span>
          ) : null}
          <CategoryBadge category={article.category} />
          {article.leagues?.length ? (
            <span className="text-[10px] text-text-muted">
              · {article.leagues.slice(0, 2).join(", ")}
            </span>
          ) : null}
        </div>
        <Heading className="line-clamp-2 text-[15px] font-semibold text-text-primary">
          {article.title}
        </Heading>
        {article.teams?.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {article.teams.slice(0, 4).map((t) => (
              <span
                key={t}
                className="rounded bg-surface-hover px-2 py-0.5 text-[11px] font-medium text-text-secondary"
              >
                {t}
              </span>
            ))}
          </div>
        ) : null}
        {article.summary && (
          <p className="mt-1 line-clamp-3 text-[13px] text-text-secondary">
            {article.summary}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-text-muted">
          <SourceLogo source={article.source} logoUrl={logoUrl} className="h-3.5 w-3.5 rounded-full object-contain" />
          <span>{article.source}</span>
          <span>·</span>
          <span>{relativeTime(article.published_at)}</span>
        </div>
      </div>
    </a>
  );
}
