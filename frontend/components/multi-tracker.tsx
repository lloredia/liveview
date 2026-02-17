"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMatch } from "@/lib/api";
import { getPinnedMatches, setPinnedMatches } from "@/lib/pinned-matches";
import { usePolling } from "@/hooks/use-polling";
import { isLive, phaseColor, phaseLabel } from "@/lib/utils";
import { TeamLogo } from "./team-logo";
import { AnimatedScore } from "./animated-score";
import { Countdown } from "./countdown";
import type { MatchDetailResponse } from "@/lib/types";

interface MultiTrackerProps {
  pinnedIds: string[];
  onPinnedChange: (ids: string[]) => void;
  onMatchSelect: (matchId: string) => void;
}

export function MultiTracker({ pinnedIds, onPinnedChange, onMatchSelect }: MultiTrackerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (pinnedIds.length === 0) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 transition-all duration-300 ${
        collapsed ? "w-12" : "w-72"
      }`}
    >
      {/* Collapsed toggle */}
      {collapsed ? (
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl border border-surface-border bg-surface-card shadow-2xl transition-colors hover:bg-surface-hover"
          title="Expand tracker"
        >
          <span className="relative text-lg">📌</span>
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-accent-blue text-[9px] font-bold text-white">
            {pinnedIds.length}
          </span>
        </button>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-surface-border px-3.5 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="text-sm">📌</span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
                Tracking {pinnedIds.length}/3
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setPinnedMatches([]);
                  onPinnedChange([]);
                }}
                className="rounded p-1 text-[10px] text-text-muted transition-colors hover:bg-surface-hover hover:text-accent-red"
                title="Unpin all"
              >
                ✕ Clear
              </button>
              <button
                onClick={() => setCollapsed(true)}
                className="rounded p-1 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary"
                title="Minimize"
              >
                ▼
              </button>
            </div>
          </div>

          {/* Pinned matches */}
          <div className="max-h-[360px] overflow-y-auto">
            {pinnedIds.map((id) => (
              <TrackerCard
                key={id}
                matchId={id}
                onRemove={() => {
                  const next = pinnedIds.filter((p) => p !== id);
                  setPinnedMatches(next);
                  onPinnedChange(next);
                }}
                onClick={() => onMatchSelect(id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TrackerCard({
  matchId,
  onRemove,
  onClick,
}: {
  matchId: string;
  onRemove: () => void;
  onClick: () => void;
}) {
  const fetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data } = usePolling<MatchDetailResponse>({
    fetcher,
    interval: 10000,
    key: `tracker-${matchId}`,
  });

  if (!data) {
    return (
      <div className="flex items-center justify-center border-b border-surface-border px-3 py-4 last:border-0">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
      </div>
    );
  }

  const { match, state } = data;
  const live = isLive(match.phase);
  const scheduled = match.phase === "scheduled" || match.phase === "pre_match";
  const color = phaseColor(match.phase);
  const scoreHome = state?.score_home ?? 0;
  const scoreAway = state?.score_away ?? 0;

  return (
    <div
      className={`group relative cursor-pointer border-b border-surface-border px-3.5 py-3 transition-colors last:border-0 hover:bg-surface-hover/50 ${
        live ? "bg-red-500/[0.03]" : ""
      }`}
      onClick={onClick}
    >
      {/* Live shimmer */}
      {live && (
        <div className="absolute inset-x-0 top-0 h-[1.5px] animate-shimmer bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
      )}

      {/* Phase + Clock row */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {live ? (
            <div className="relative h-[5px] w-[5px]">
              <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
              <div className="relative h-[5px] w-[5px] rounded-full bg-red-500" />
            </div>
          ) : (
            <div className="h-[5px] w-[5px] rounded-full" style={{ background: color }} />
          )}
          <span
            className="text-[9px] font-bold uppercase tracking-wider"
            style={{ color: live ? "#f87171" : color }}
          >
            {phaseLabel(match.phase)}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {scheduled && match.start_time ? (
            <Countdown startTime={match.start_time} className="text-[9px]" />
          ) : state?.clock ? (
            <span className={`font-mono text-[10px] font-bold ${live ? "text-red-400" : "text-text-muted"}`}>
              {state.clock}
            </span>
          ) : null}

          {/* Remove button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded p-0.5 text-[10px] text-text-dim opacity-0 transition-all group-hover:opacity-100 hover:bg-surface-hover hover:text-accent-red"
            title="Unpin"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Teams row */}
      <div className="flex items-center gap-2">
        {/* Home */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <TeamLogo url={match.home_team?.logo_url} name={match.home_team?.short_name} size={18} />
          <span className={`truncate text-[11px] ${scoreHome > scoreAway ? "font-bold text-text-primary" : "text-text-secondary"}`}>
            {match.home_team?.short_name}
          </span>
        </div>

        {/* Score */}
        <div className="flex items-center gap-1 font-mono text-sm font-black">
          <AnimatedScore
            value={scoreHome}
            className={`${live ? "text-text-primary" : "text-text-secondary"}`}
          />
          <span className="text-[10px] text-surface-border-light">:</span>
          <AnimatedScore
            value={scoreAway}
            className={`${live ? "text-text-primary" : "text-text-secondary"}`}
          />
        </div>

        {/* Away */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          <span className={`truncate text-[11px] ${scoreAway > scoreHome ? "font-bold text-text-primary" : "text-text-secondary"}`}>
            {match.away_team?.short_name}
          </span>
          <TeamLogo url={match.away_team?.logo_url} name={match.away_team?.short_name} size={18} />
        </div>
      </div>
    </div>
  );
}