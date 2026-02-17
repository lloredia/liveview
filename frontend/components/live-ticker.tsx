"use client";

import { useCallback } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { phaseLabel } from "@/lib/utils";
import { TeamLogo } from "./team-logo";
import type { LeagueGroup, LiveTickerResponse, MatchSummaryWithLeague } from "@/lib/types";

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
    <div className="border-b border-surface-border bg-surface-raised/80 backdrop-blur-sm">
      <div className="flex items-center gap-3 overflow-x-auto px-4 py-2 scrollbar-hide">
        {/* Live badge */}
        <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1">
          <div className="relative h-2 w-2">
            <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
            <div className="relative h-2 w-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
          </div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-red-400">
            Live
          </span>
        </div>

        {/* Scrollable match chips */}
        {liveMatches.map((match) => (
          <LiveMatchChip
            key={match.id}
            match={match}
            onClick={() => onMatchSelect(match.id)}
          />
        ))}
      </div>
    </div>
  );
}

function LiveMatchChip({
  match,
  onClick,
}: {
  match: MatchSummaryWithLeague;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-2 rounded-lg border border-surface-border bg-surface-card px-3 py-1.5 transition-all hover:border-red-500/30 hover:bg-surface-hover active:scale-[0.98]"
    >
      <TeamLogo url={match.home_team.logo_url} name={match.home_team.short_name} size={18} />
      <span className="font-mono text-xs font-bold text-text-primary">
        {match.score.home}
      </span>
      <span className="text-[10px] text-text-muted">-</span>
      <span className="font-mono text-xs font-bold text-text-primary">
        {match.score.away}
      </span>
      <TeamLogo url={match.away_team.logo_url} name={match.away_team.short_name} size={18} />
      <span className="text-[10px] text-text-muted">
        {match.clock || phaseLabel(match.phase)}
      </span>
    </button>
  );
}