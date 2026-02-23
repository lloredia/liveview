"use client";

import { useState, type ReactNode } from "react";
import { sportIcon } from "@/lib/utils";

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
  src,
  alt = "",
  className = "h-full w-full object-cover",
  sport,
  placeholder = defaultPlaceholder,
  containerClassName,
}: NewsImageProps) {
  const [error, setError] = useState(false);
  const showImage = src && !error;

  const content = showImage ? (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setError(true)}
    />
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
      <div className={`overflow-hidden ${containerClassName}`}>
        {content}
      </div>
    );
  }
  return <>{content}</>;
}
