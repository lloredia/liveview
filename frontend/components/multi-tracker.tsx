"use client";

import { useCallback, useState } from "react";
import { fetchMatch } from "@/lib/api";
import { setPinnedMatches } from "@/lib/pinned-matches";
import { usePolling } from "@/hooks/use-polling";
import { isLive } from "@/lib/utils";
import type { MatchDetailResponse } from "@/lib/types";

interface MultiTrackerProps {
  pinnedIds: string[];
  onPinnedChange: (ids: string[]) => void;
  onMatchSelect: (matchId: string) => void;
}

export function MultiTracker({ pinnedIds, onPinnedChange, onMatchSelect }: MultiTrackerProps) {
  const [collapsed, setCollapsed] = useState(false);

  if (pinnedIds.length === 0) return null;

  const visibleIds = pinnedIds.slice(0, 3);
  const extra = pinnedIds.length - 3;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
      <div className="border-t border-surface-border bg-surface-raised/95 backdrop-blur-sm">
        {collapsed ? (
          <button
            onClick={() => setCollapsed(false)}
            className="flex w-full items-center justify-center gap-1.5 px-3 py-2 text-[11px] text-text-muted hover:text-text-secondary"
          >
            <span className="font-semibold">{pinnedIds.length} pinned</span>
            <span>▲</span>
          </button>
        ) : (
          <div className="flex items-center gap-1.5 px-3 py-1.5">
            <div className="flex flex-1 items-center gap-1.5 overflow-x-auto scrollbar-hide">
              {visibleIds.map((id) => (
                <TrackerChip key={id} matchId={id} onClick={() => onMatchSelect(id)} />
              ))}
              {extra > 0 && (
                <span className="shrink-0 text-[10px] text-text-dim">+{extra}</span>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => {
                  setPinnedMatches([]);
                  onPinnedChange([]);
                }}
                className="rounded px-1.5 py-0.5 text-[10px] text-text-dim hover:bg-surface-hover hover:text-accent-red"
              >
                Clear
              </button>
              <button
                onClick={() => setCollapsed(true)}
                className="rounded px-1 py-0.5 text-[10px] text-text-dim hover:bg-surface-hover"
              >
                ▼
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerChip({ matchId, onClick }: { matchId: string; onClick: () => void }) {
  const fetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data } = usePolling<MatchDetailResponse>({
    fetcher,
    interval: 10000,
    key: `tracker-${matchId}`,
  });

  if (!data) {
    return (
      <div className="flex h-7 w-20 shrink-0 items-center justify-center rounded bg-surface-card">
        <div className="h-3 w-3 animate-spin rounded-full border border-surface-border border-t-accent-green" />
      </div>
    );
  }

  const { match, state } = data;
  const live = isLive(match.phase);
  const home = match.home_team?.short_name || "HOM";
  const away = match.away_team?.short_name || "AWY";
  const sh = state?.score_home ?? 0;
  const sa = state?.score_away ?? 0;

  return (
    <button
      onClick={onClick}
      className={`
        flex shrink-0 items-center gap-1 rounded px-2 py-1 text-[11px] font-semibold transition-colors
        ${live ? "bg-accent-red/10 text-text-primary" : "bg-surface-card text-text-secondary"}
        hover:bg-surface-hover
      `}
    >
      {live && (
        <span className="relative mr-0.5 flex h-1 w-1">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
          <span className="relative inline-flex h-1 w-1 rounded-full bg-accent-red" />
        </span>
      )}
      <span>{home}</span>
      <span className="font-mono">{sh}-{sa}</span>
      <span>{away}</span>
    </button>
  );
}
