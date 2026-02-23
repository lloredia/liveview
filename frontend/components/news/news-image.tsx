"use client";

import { useEffect, useState, type ReactNode } from "react";
import { sportIcon } from "@/lib/utils";

function sanitizeImageSrc(src: string | null | undefined): string | null {
  if (src == null || typeof src !== "string") return null;
  const trimmed = src.trim();
  if (!trimmed || !trimmed.startsWith("http")) return null;
  return trimmed;
}

interface NewsImageProps {
  src: string | null;
  alt?: string;
  className?: string;
  /** Optional sport for placeholder emoji when image fails */
  sport?: string | null;
  /** Placeholder when no src or on error */
  placeholder?: ReactNode;
  /** Container class for the wrapper (e.g. aspect-video, h-20 w-20) */
  containerClassName?: string;
  /** Eager load + high priority (e.g. hero first/active slide) */
  priority?: boolean;
}

const defaultPlaceholder = (
  <div
    className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-hover to-surface-card"
    aria-hidden
  >
    <span className="text-2xl opacity-50">📰</span>
  </div>
);

export function NewsImage({
  src: rawSrc,
  alt = "",
  className = "h-full w-full object-cover",
  sport,
  placeholder = defaultPlaceholder,
  containerClassName,
  priority = false,
}: NewsImageProps) {
  const src = sanitizeImageSrc(rawSrc);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [src]);

  const showImage = src && !error;

  const content = showImage ? (
    <>
      {/* Loading overlay: hides partial image until fully loaded */}
      {!loaded && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-surface-hover to-surface-card transition-opacity duration-200"
          aria-hidden
        >
          {sport ? (
            <span className="text-3xl opacity-70" title={sport}>
              {sportIcon(sport)}
            </span>
          ) : (
            <span className="text-2xl opacity-50">📰</span>
          )}
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
      />
    </>
  ) : (
    <div
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-surface-hover to-surface-card"
      aria-hidden
    >
      {sport ? (
        <span className="text-3xl opacity-70" title={sport}>
          {sportIcon(sport)}
        </span>
      ) : (
        placeholder
      )}
    </div>
  );

  if (containerClassName) {
    return (
      <div className={`relative overflow-hidden ${containerClassName}`}>
        {content}
      </div>
    );
  }
  return <div className="relative">{content}</div>;
}
