"use client";

import { useCallback } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import type { LeagueGroup, LiveTickerResponse } from "@/lib/types";

interface LiveTickerProps {
  leagues: LeagueGroup[];
  onMatchSelect: (matchId: string) => void;
}

export function LiveTicker({ leagues, onMatchSelect }: LiveTickerProps) {
  const fetcher = useCallback(() => fetchLiveMatches(leagues), [leagues]);

  const { data } = usePolling<LiveTickerResponse>({
    fetcher,
    interval: 30000,
    enabled: leagues.length > 0,
    key: "live-ticker",
  });

  const liveMatches = data?.matches || [];

  if (liveMatches.length === 0) return null;

  return (
    <div className="flex h-7 items-center border-b border-surface-border bg-surface-raised overflow-hidden">
      <div className="flex shrink-0 items-center gap-1 px-2">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
        <span className="text-[10px] font-bold uppercase text-accent-red">Live</span>
      </div>

      <div className="flex flex-1 items-center gap-3 overflow-x-auto scrollbar-hide">
        {liveMatches.map((m) => (
          <button
            key={m.id}
            onClick={() => onMatchSelect(m.id)}
            className="flex shrink-0 items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary transition-colors"
          >
            <span className="font-medium">{m.home_team.short_name}</span>
            <span className="font-mono font-bold text-text-primary">{m.score.home}-{m.score.away}</span>
            <span className="font-medium">{m.away_team.short_name}</span>
            {m.clock && <span className="text-[9px] text-text-dim">{m.clock}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
