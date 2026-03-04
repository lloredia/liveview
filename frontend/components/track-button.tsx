"use client";

import { useCallback, useState } from "react";
import { isPinned, togglePinned } from "@/lib/pinned-matches";
import { trackGameOnServer, untrackGameOnServer } from "@/lib/notification-api";

interface TrackButtonProps {
  matchId: string;
  sport?: string;
  league?: string;
  size?: "sm" | "md";
  /** When provided, button is controlled by parent (no local storage or device API); click only calls onToggle. */
  pinned?: boolean;
  onToggle?: (pinned?: string[]) => void;
  className?: string;
}

export function TrackButton({
  matchId,
  sport,
  league,
  size = "sm",
  pinned: controlledPinned,
  onToggle,
  className = "",
}: TrackButtonProps) {
  const [uncontrolledTracked, setUncontrolledTracked] = useState(() => isPinned(matchId));
  const [loading, setLoading] = useState(false);
  const tracked = controlledPinned !== undefined ? controlledPinned : uncontrolledTracked;

  const handleClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (loading) return;

      setLoading(true);
      try {
        if (controlledPinned !== undefined) {
          // Controlled (auth flow): parent handles backend; just notify.
          onToggle?.();
          return;
        }
        const wasPinned = isPinned(matchId);
        const next = togglePinned(matchId);
        setUncontrolledTracked(!wasPinned);
        onToggle?.(next);
        if (wasPinned) {
          await untrackGameOnServer(matchId);
        } else {
          await trackGameOnServer(matchId, sport, league);
        }
      } catch {
        if (controlledPinned === undefined) setUncontrolledTracked(isPinned(matchId));
      } finally {
        setLoading(false);
      }
    },
    [matchId, sport, league, loading, onToggle, controlledPinned]
  );

  const sizeClasses = size === "sm" ? "h-7 w-7" : "h-8 w-8";

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className={`
        inline-flex items-center justify-center rounded-[8px] transition-all glass-press
        ${tracked
          ? "bg-accent-blue/10 text-accent-blue"
          : "text-text-dim hover:text-text-muted hover:bg-glass-hover"
        }
        ${sizeClasses}
        ${loading ? "opacity-60" : ""}
        ${className}
      `}
      aria-label={tracked ? "Stop tracking this game" : "Track this game"}
      title={tracked ? "Tracking • Tap to stop" : "Track this game"}
    >
      {tracked ? (
        <svg width={size === "sm" ? 14 : 16} height={size === "sm" ? 14 : 16} viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      ) : (
        <svg width={size === "sm" ? 14 : 16} height={size === "sm" ? 14 : 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      )}
    </button>
  );
}
