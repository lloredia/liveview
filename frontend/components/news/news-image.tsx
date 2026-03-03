"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";
import { sportIcon } from "@/lib/utils";
import { newsImageProxyUrl } from "@/lib/news/imageUrl";

interface NewsImageProps {
  src: string | null;
  alt?: string;
  className?: string;
  sport?: string | null;
  placeholder?: ReactNode;
  /** Must include aspect ratio or explicit size to avoid layout shift (e.g. aspect-video w-full, aspect-square h-20 w-20) */
  containerClassName?: string;
  priority?: boolean;
  /** Responsive sizes for next/image (default: card/hero friendly) */
  sizes?: string;
}

const defaultPlaceholder = (
  <div
    className="flex h-full w-full items-center justify-center bg-gradient-to-br from-glass-hover to-glass bg-glass/80"
    aria-hidden
  >
    <span className="text-2xl opacity-50">📰</span>
  </div>
);

function PlaceholderContent({ sport, placeholder }: { sport?: string | null; placeholder?: ReactNode }) {
  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-glass-hover to-glass bg-glass/80 transition-opacity duration-200"
      aria-hidden
    >
      {sport ? (
        <span className="text-3xl opacity-70" title={sport ?? undefined}>
          {sportIcon(sport)}
        </span>
      ) : (
        placeholder ?? defaultPlaceholder
      )}
    </div>
  );
}

export function NewsImage({
  src: rawSrc,
  alt = "",
  className = "object-cover",
  sport,
  placeholder = defaultPlaceholder,
  containerClassName,
  priority = false,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: NewsImageProps) {
  const proxyUrl = newsImageProxyUrl(rawSrc);
  const [error, setError] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setError(false);
    setLoaded(false);
  }, [proxyUrl]);

  const showImage = proxyUrl && !error;

  const containerCls = [
    "relative overflow-hidden",
    containerClassName ?? "aspect-video w-full",
  ].filter(Boolean).join(" ");

  const content = showImage ? (
    <>
      {!loaded && <PlaceholderContent sport={sport} placeholder={placeholder} />}
      <Image
        src={proxyUrl}
        alt={alt}
        fill
        sizes={sizes}
        className={`${className} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-300`}
        priority={priority}
        loading={priority ? "eager" : "lazy"}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        unoptimized={false}
      />
    </>
  ) : (
    <div
      className="flex h-full w-full items-center justify-center bg-gradient-to-br from-glass-hover to-glass bg-glass/80"
      aria-hidden
    >
      {sport ? (
        <span className="text-3xl opacity-70" title={sport ?? undefined}>
          {sportIcon(sport)}
        </span>
      ) : (
        placeholder
      )}
    </div>
  );

  return (
    <div className={containerCls}>
      {content}
    </div>
  );
}
