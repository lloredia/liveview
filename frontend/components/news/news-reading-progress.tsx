"use client";

import { useEffect, useState } from "react";

/**
 * Thin top progress bar reflecting scroll position in the main content.
 * Respects prefers-reduced-motion (hides or keeps static).
 */
export function NewsReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const win = window;
      const doc = document.documentElement;
      const scrollTop = win.scrollY || doc.scrollTop;
      const scrollHeight = doc.scrollHeight - doc.clientHeight;
      if (scrollHeight <= 0) {
        setProgress(0);
        return;
      }
      setProgress(Math.min(100, (scrollTop / scrollHeight) * 100));
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="news-reading-progress fixed left-0 top-0 z-[60] h-0.5 w-full origin-left bg-accent-green/80 transition-transform duration-150"
      style={{ transform: `scaleX(${progress / 100})` }}
      role="progressbar"
      aria-valuenow={Math.round(progress)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Reading progress"
    />
  );
}

