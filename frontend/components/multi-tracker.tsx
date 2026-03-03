"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchMatch } from "@/lib/api";
import { setPinnedMatches, togglePinned, MAX_PINNED } from "@/lib/pinned-matches";
import { usePolling } from "@/hooks/use-polling";
import { isLive, phaseLabel } from "@/lib/utils";
import { endLiveActivity, updateLiveActivity } from "@/lib/live-activity";
import { TeamLogo } from "./team-logo";
import { GlassPill } from "./ui/glass";
import type { MatchDetailResponse } from "@/lib/types";

interface MultiTrackerProps {
  pinnedIds: string[];
  onPinnedChange: (ids: string[]) => void;
  onMatchSelect: (matchId: string) => void;
}

export function MultiTracker({ pinnedIds, onPinnedChange, onMatchSelect }: MultiTrackerProps) {
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (pinnedIds.length === 0) {
      endLiveActivity();
      return;
    }
    const sync = async () => {
      const results = await Promise.all(pinnedIds.map((id) => fetchMatch(id)));
      const games = results
        .filter((r): r is MatchDetailResponse => r != null)
        .map((r) => ({
          matchId: r.match.id,
          homeName: r.match.home_team?.short_name ?? r.match.home_team?.name ?? "Home",
          awayName: r.match.away_team?.short_name ?? r.match.away_team?.name ?? "Away",
          scoreHome: r.state?.score_home ?? 0,
          scoreAway: r.state?.score_away ?? 0,
          isLive: isLive(r.match.phase),
          phaseLabel: phaseLabel(r.match.phase),
        }));
      await updateLiveActivity(games);
    };
    sync();
    const interval = setInterval(sync, 15000);
    return () => clearInterval(interval);
  }, [pinnedIds]);

  if (pinnedIds.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
      <div className="glass-surface-prominent glass-blur border-t border-glass-border">
        {/* Header bar */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-2 glass-press"
        >
          <div className="flex items-center gap-2">
            <span className="text-label-md font-bold uppercase tracking-wider text-text-muted">
              Tracking
            </span>
            <GlassPill variant="info" size="xs">
              {pinnedIds.length}/{MAX_PINNED}
            </GlassPill>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setPinnedMatches([]);
                onPinnedChange([]);
              }}
              className="rounded-[8px] px-2 py-0.5 text-label-sm text-text-dim transition-colors hover:bg-glass-hover hover:text-accent-red"
            >
              Clear all
            </button>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className={`text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </button>

        {/* Collapsed: horizontal chips */}
        {!expanded && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {pinnedIds.map((id) => (
              <TrackerChip key={id} matchId={id} onClick={() => onMatchSelect(id)} />
            ))}
          </div>
        )}

        {/* Expanded: full mini-scoreboards */}
        {expanded && (
          <div className="max-h-[50vh] overflow-y-auto px-3 pb-3">
            {pinnedIds.map((id) => (
              <TrackerCard
                key={id}
                matchId={id}
                onClick={() => onMatchSelect(id)}
                onRemove={() => {
                  const next = togglePinned(id);
                  onPinnedChange(next);
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerChip({ matchId, onClick }: { matchId: string; onClick: () => void }) {
  const fetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data } = usePolling<MatchDetailResponse>({ fetcher, interval: 10000, key: `tracker-${matchId}` });

  if (!data) {
    return (
      <div className="flex h-7 w-20 shrink-0 items-center justify-center rounded-[10px] glass-surface">
        <div className="h-3 w-3 animate-spin rounded-full border border-glass-border border-t-accent-green" />
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
      className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-label-md font-semibold transition-all glass-press ${
        live
          ? "bg-accent-red/10 text-text-primary border border-accent-red/20"
          : "glass-surface text-text-secondary hover:bg-glass-hover"
      }`}
    >
      {live && (
        <span className="relative mr-0.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
      )}
      <span className="max-w-[40px] truncate">{home}</span>
      <span className="font-mono text-text-primary">{sh}-{sa}</span>
      <span className="max-w-[40px] truncate">{away}</span>
    </button>
  );
}

function TrackerCard({
  matchId,
  onClick,
  onRemove,
}: {
  matchId: string;
  onClick: () => void;
  onRemove: () => void;
}) {
  const fetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data } = usePolling<MatchDetailResponse>({ fetcher, interval: 10000, key: `tracker-card-${matchId}` });

  if (!data) {
    return (
      <div className="mb-1.5 flex h-14 items-center justify-center rounded-[14px] glass-surface">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
      </div>
    );
  }

  const { match, state } = data;
  const live = isLive(match.phase);
  const sh = state?.score_home ?? 0;
  const sa = state?.score_away ?? 0;

  return (
    <div
      onClick={onClick}
      className={`mb-1.5 flex cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 transition-all glass-press ${
        live
          ? "bg-accent-red/5 border border-accent-red/15"
          : "glass-surface hover:bg-glass-hover"
      }`}
    >
      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamLogo url={match.home_team?.logo_url} name={match.home_team?.name || "Home"} size={20} />
        <span className="truncate text-label-lg text-text-primary">
          {match.home_team?.short_name || match.home_team?.name || "Home"}
        </span>
      </div>

      {/* Score */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">
          {live && (
            <span className="relative mr-1 flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
            </span>
          )}
          <span className="font-mono text-score-md text-text-primary">{sh}</span>
          <span className="text-label-sm text-text-dim">-</span>
          <span className="font-mono text-score-md text-text-primary">{sa}</span>
        </div>
        <span className="text-label-xs text-text-muted">{phaseLabel(match.phase)}</span>
      </div>

      {/* Away team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right text-label-lg text-text-primary">
          {match.away_team?.short_name || match.away_team?.name || "Away"}
        </span>
        <TeamLogo url={match.away_team?.logo_url} name={match.away_team?.name || "Away"} size={20} />
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-1 shrink-0 rounded-[8px] p-1 text-text-dim transition-colors hover:bg-glass-hover hover:text-accent-red"
        aria-label="Remove from tracker"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
}
