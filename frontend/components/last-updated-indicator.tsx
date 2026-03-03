"use client";

import { useEffect, useState } from "react";

interface LastUpdatedIndicatorProps {
  lastSuccessAt: number | null;
  /** Only show when there are live games (hide when FINAL) */
  show: boolean;
  className?: string;
}

function formatSecondsAgo(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function LastUpdatedIndicator({
  lastSuccessAt,
  show,
  className = "",
}: LastUpdatedIndicatorProps) {
  const [label, setLabel] = useState<string>("");

  useEffect(() => {
    if (!show || lastSuccessAt == null) {
      setLabel("");
      return;
    }
    const update = () => setLabel(formatSecondsAgo(lastSuccessAt));
    update();
    const timer = setInterval(update, 10_000);
    return () => clearInterval(timer);
  }, [show, lastSuccessAt]);

  if (!show || !label) return null;

  return (
    <p
      className={`text-label-xs text-text-dim ${className}`}
      aria-live="polite"
    >
      Updated {label}
    </p>
  );
}
