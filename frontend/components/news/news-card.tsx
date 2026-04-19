"use client";

import { memo, useCallback, useState } from "react";
import type { NewsArticle } from "@/lib/types";
import { relativeTime, sportIcon } from "@/lib/utils";
import { CATEGORY_COLORS, CATEGORY_LABELS, SOURCE_LOGOS } from "./news-constants";
import { NewsImage } from "./news-image";
import { getSavedArticleIds, isSaved, toggleSaved } from "@/lib/news-saved";
import { FAKE_GLASS, GLASS_RADII, GLASS_INTERACTIVE } from "@/components/ui/glass/tokens";

interface NewsCardProps {
  article: NewsArticle;
  variant?: "featured" | "compact";
  headingLevel?: "h2" | "h3";
  /** Pass from parent so bookmark toggle triggers re-render */
  savedIds?: string[];
}

function CategoryBadge({ category }: { category: string }) {
  const style = CATEGORY_COLORS[category] ?? CATEGORY_COLORS.general;
  const label = CATEGORY_LABELS[category] ?? category;
  return (
    <span
      className={`inline-flex rounded-full border px-2 py-0.5 text-label-sm font-semibold uppercase tracking-wide ${style.bg} ${style.text} ${style.border}`}
    >
      {label}
    </span>
  );
}

function SourceLogo({
  source,
  logoUrl,
  className,
}: {
  source: string;
  logoUrl: string | undefined;
  className?: string;
}) {
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
      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-glass-hover text-label-xs font-bold text-text-muted ${className ?? ""}`}
      aria-hidden
    >
      {source.charAt(0).toUpperCase()}
    </span>
  );
}

export const NewsCard = memo(function NewsCard({
  article,
  variant = "compact",
  headingLevel = "h3",
  savedIds,
}: NewsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const saved = savedIds ? savedIds.includes(article.id) : isSaved(article.id);
  const Heading = headingLevel === "h2" ? "h2" : "h3";
  const logoUrl = SOURCE_LOGOS[article.source];

  const handleBookmark = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      toggleSaved(article.id);
      // Force re-render of parent if it tracks saved state; otherwise local state would need to be lifted
      window.dispatchEvent(new CustomEvent("news-saved-change", { detail: { id: article.id } }));
    },
    [article.id],
  );

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      if (variant === "compact" && (e.target as HTMLElement).closest("[data-bookmark]")) return;
      if (variant === "compact") {
        e.preventDefault();
        setExpanded((x) => !x);
      }
    },
    [variant],
  );

  const openSource = useCallback(() => {
    window.open(article.source_url, "_blank", "noopener,noreferrer");
  }, [article.source_url]);

  if (variant === "compact") {
    return (
      <article
        className={`
          relative overflow-hidden rounded-[16px] border border-glass-border
          ${FAKE_GLASS} ${GLASS_INTERACTIVE}
          transition-all duration-200
          hover:shadow-glass-md hover:border-glass-border-light
          motion-reduce:transition-none
        `}
      >
        <button
          type="button"
          onClick={handleCardClick}
          className="flex w-full gap-3 p-3 text-left"
          aria-expanded={expanded}
        >
          <NewsImage
            src={article.image_url}
            sport={article.sport}
            containerClassName="h-20 w-20 shrink-0 rounded-[10px] overflow-hidden bg-glass-hover"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {article.sport ? (
                <span className="text-body-md" title={article.sport ?? undefined} aria-hidden>
                  {sportIcon(article.sport)}
                </span>
              ) : null}
              <Heading className="line-clamp-2 flex-1 text-body-sm font-semibold leading-snug text-text-primary">
                {article.title}
              </Heading>
            </div>
            {article.teams?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {article.teams.slice(0, 3).map((t) => (
                  <span
                    key={t}
                    className="rounded bg-glass-hover px-1.5 py-0.5 text-label-sm font-medium text-text-secondary"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
            {!expanded && article.summary && (
              <p className="mt-0.5 line-clamp-2 text-label-md text-text-secondary">
                {article.summary}
              </p>
            )}
            <div className="mt-1.5 flex items-center gap-2 text-label-md text-text-muted">
              <SourceLogo source={article.source} logoUrl={logoUrl} className="h-3.5 w-3.5 rounded-full object-contain" />
              <span>{article.source}</span>
              <span aria-hidden>·</span>
              <span>{relativeTime(article.published_at)}</span>
              <CategoryBadge category={article.category} />
            </div>
          </div>
        </button>

        {expanded && (
          <div
            className="border-t border-glass-border-light px-3 pb-3 pt-2"
            role="region"
            aria-label="Article preview"
          >
            {article.summary && (
              <p className="mb-3 text-body-sm leading-relaxed text-text-secondary">
                {article.summary}
              </p>
            )}
            <div className="flex items-center justify-between gap-2">
              <a
                href={article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-body-sm font-semibold text-accent-green hover:underline focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:ring-offset-2 focus:ring-offset-[var(--glass-bg)] rounded"
              >
                Read more
              </a>
            </div>
          </div>
        )}

        <button
          type="button"
          data-bookmark
          onClick={handleBookmark}
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-glass/90 text-text-muted transition-colors hover:bg-glass-hover hover:text-accent-amber focus:outline-none focus:ring-2 focus:ring-accent-amber/50"
          aria-label={saved ? "Remove from saved" : "Save for later"}
        >
          {saved ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
            </svg>
          )}
        </button>
      </article>
    );
  }

  return (
    <article
      className={`
        relative overflow-hidden rounded-[16px] border border-glass-border
        ${FAKE_GLASS} ${GLASS_INTERACTIVE}
        transition-all duration-200
        hover:shadow-glass-lg hover:border-glass-border-light
        motion-reduce:transition-none
      `}
    >
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="block w-full text-left"
        aria-expanded={expanded}
      >
        <NewsImage
          src={article.image_url}
          sport={article.sport}
          containerClassName="relative aspect-video w-full bg-glass-hover"
          className="h-full w-full object-cover"
        />
        <div className="p-4">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            {article.sport ? (
              <span className="text-[16px]" title={article.sport ?? undefined} aria-hidden>
                {sportIcon(article.sport)}
              </span>
            ) : null}
            <CategoryBadge category={article.category} />
            {article.leagues?.length ? (
              <span className="text-label-sm text-text-muted">
                · {article.leagues.slice(0, 2).join(", ")}
              </span>
            ) : null}
          </div>
          <Heading className="line-clamp-2 text-heading-sm font-semibold leading-snug text-text-primary">
            {article.title}
          </Heading>
          {article.teams?.length ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {article.teams.slice(0, 4).map((t) => (
                <span
                  key={t}
                  className="rounded bg-glass-hover px-2 py-0.5 text-label-md font-medium text-text-secondary"
                >
                  {t}
                </span>
              ))}
            </div>
          ) : null}
          {!expanded && article.summary && (
            <p className="mt-1 line-clamp-3 text-body-sm leading-relaxed text-text-secondary">
              {article.summary}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2 text-label-md text-text-muted">
            <SourceLogo source={article.source} logoUrl={logoUrl} className="h-3.5 w-3.5 rounded-full object-contain" />
            <span>{article.source}</span>
            <span aria-hidden>·</span>
            <span>{relativeTime(article.published_at)}</span>
          </div>
        </div>
      </button>

      {expanded && (
        <div
          className="border-t border-glass-border-light px-4 pb-4 pt-2"
          role="region"
          aria-label="Article preview"
        >
          {article.summary && (
            <p className="mb-3 text-body-sm leading-relaxed text-text-secondary">
              {article.summary}
            </p>
          )}
          <a
            href={article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-body-sm font-semibold text-accent-green hover:underline focus:outline-none focus:ring-2 focus:ring-accent-green/50 focus:ring-offset-2 rounded"
          >
            Read more
          </a>
        </div>
      )}

      <button
        type="button"
        data-bookmark
        onClick={handleBookmark}
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-glass/90 text-text-muted transition-colors hover:bg-glass-hover hover:text-accent-amber focus:outline-none focus:ring-2 focus:ring-accent-amber/50"
        aria-label={saved ? "Remove from saved" : "Save for later"}
      >
        {saved ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" />
          </svg>
        )}
      </button>
    </article>
  );
});
