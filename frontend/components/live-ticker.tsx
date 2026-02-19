"use client";

import { useCallback } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { LeagueGroup, LiveTickerResponse } from "@/lib/types";

interface LiveTickerProps {
  leagues: LeagueGroup[];
  onMatchSelect: (matchId: string) => void;
}

function TickerItem({
  match,
  onClick,
}: {
  match: LiveTickerResponse["matches"][number];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <span className="font-medium">{match.home_team.short_name}</span>
      <span className="font-mono font-bold text-text-primary">
        {match.score.home}-{match.score.away}
      </span>
      <span className="font-medium">{match.away_team.short_name}</span>
      {match.clock && (
        <span className="text-[9px] font-semibold text-accent-green">{match.clock}</span>
      )}
    </button>
  );
}

export function LiveTicker({ leagues, onMatchSelect }: LiveTickerProps) {
  const fetcher = useCallback(() => fetchLiveMatches(leagues), [leagues]);

  const { data } = usePolling<LiveTickerResponse>({
    fetcher,
    interval: 15000,
    enabled: leagues.length > 0,
    key: "live-ticker",
  });

  const liveMatches = data?.matches || [];

  if (liveMatches.length === 0) return null;

  // ~4 seconds per match, minimum 20s so short lists don't fly by
  const duration = Math.max(20, liveMatches.length * 4);

  return (
    <div className="flex h-8 items-center border-b border-surface-border bg-surface-raised overflow-hidden">
      {/* Fixed LIVE label */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-r border-surface-border bg-surface-raised px-2.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
        <span className="text-[10px] font-bold uppercase text-accent-red">
          Live
        </span>
      </div>

      {/* Scrolling track — matches are duplicated for seamless loop */}
      <div className="relative flex-1 overflow-hidden">
        <div
          className="ticker-track flex items-center gap-4 whitespace-nowrap"
          style={{ "--ticker-duration": `${duration}s` } as React.CSSProperties}
        >
          {liveMatches.map((m) => (
            <TickerItem
              key={`a-${m.id}`}
              match={m}
              onClick={() => onMatchSelect(m.id)}
            />
          ))}

          {/* Separator dot between the two copies */}
          <span className="mx-2 h-1 w-1 shrink-0 rounded-full bg-surface-border" />

          {/* Second copy for seamless wrap */}
          {liveMatches.map((m) => (
            <TickerItem
              key={`b-${m.id}`}
              match={m}
              onClick={() => onMatchSelect(m.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
