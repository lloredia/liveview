"use client";

import {
  CircleDot,
  Circle,
  Trophy,
  Flag,
  Play,
  Pause,
  RefreshCw,
  Send,
  Zap,
  Square,
  type LucideIcon,
} from "lucide-react";

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function normalizeSport(sport: string): string {
  const s = (sport || "").toLowerCase().trim();
  if (s === "football" || s === "nfl" || s === "american-football") return "football";
  if (s === "basketball" || s === "hoops") return "basketball";
  if (s === "soccer" || s === "football-soccer") return "soccer";
  if (s === "hockey" || s === "ice-hockey") return "hockey";
  if (s === "baseball") return "baseball";
  return s;
}

/**
 * Sport icon — returns currentColor-tinted SVG.
 * Uses lucide where a good fit exists; falls back to inline SVG for sport-specific shapes.
 */
export function SportIcon({
  sport,
  size = 16,
  className = "",
  strokeWidth = 2,
}: IconProps & { sport: string }) {
  const s = normalizeSport(sport);
  const stroke = { size, className, strokeWidth };

  if (s === "soccer") return <CircleDot aria-hidden {...stroke} />;

  if (s === "basketball") {
    // Basketball — circle with seams
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M4.9 4.9L19.1 19.1" />
        <path d="M19.1 4.9L4.9 19.1" />
        <path d="M2 12h20" />
        <path d="M12 2v20" />
      </svg>
    );
  }

  if (s === "hockey") {
    // Hockey puck — filled oval
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="currentColor"
        className={className}
      >
        <ellipse cx="12" cy="14" rx="9" ry="4" />
        <ellipse cx="12" cy="10" rx="9" ry="4" fillOpacity="0.4" />
      </svg>
    );
  }

  if (s === "baseball") {
    // Baseball — circle with seam curves
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M5 7c2 2 2 8 0 10" />
        <path d="M19 7c-2 2-2 8 0 10" />
      </svg>
    );
  }

  if (s === "football") {
    // American football — pointy ellipse with laces
    return (
      <svg
        aria-hidden
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
      >
        <path d="M3 12C5 5 12 3 19 5c2 7 0 14-7 16-7 2-11-2-9-9z" />
        <path d="M10 10l4 4" />
        <path d="M12 8l-1 1" />
        <path d="M14 10l-1 1" />
        <path d="M10 14l1-1" />
      </svg>
    );
  }

  // Fallback: generic circle
  return <Circle aria-hidden {...stroke} />;
}

/**
 * Event icon — for notifications / play-by-play / match-state changes.
 */
export function EventIcon({
  type,
  size = 16,
  className = "",
  strokeWidth = 2,
}: IconProps & { type: string }) {
  const t = (type || "").toLowerCase();
  const stroke = { size, className, strokeWidth };

  if (t === "goal" || t === "score") return <Zap aria-hidden {...stroke} />;
  if (t === "assist") return <Send aria-hidden {...stroke} />;
  if (t === "substitution" || t === "sub") return <RefreshCw aria-hidden {...stroke} />;
  if (t === "match_start" || t === "kick_off" || t === "start") return <Play aria-hidden {...stroke} />;
  if (t === "halftime" || t === "break") return <Pause aria-hidden {...stroke} />;
  if (t === "match_end" || t === "finished" || t === "full_time") return <Flag aria-hidden {...stroke} />;
  if (t === "final" || t === "winner") return <Trophy aria-hidden {...stroke} />;

  if (t === "yellow_card") {
    return (
      <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={className}>
        <rect x="8" y="4" width="10" height="16" rx="1" fill="#f59e0b" />
      </svg>
    );
  }

  if (t === "red_card") {
    return (
      <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" className={className}>
        <rect x="8" y="4" width="10" height="16" rx="1" fill="#ef4444" />
      </svg>
    );
  }

  // Fallback: empty square
  return <Square aria-hidden {...stroke} />;
}

// Re-export common icons directly for convenience.
export { Trophy, Flag, MapPin, BarChart3, Users, Bell, Search } from "lucide-react";
export type { LucideIcon };
