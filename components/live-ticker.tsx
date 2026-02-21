"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { phaseShortLabel } from "@/lib/utils";
import type { LeagueGroup, LiveTickerResponse, MatchSummaryWithLeague } from "@/lib/types";

interface LiveTickerProps {
  leagues: LeagueGroup[];
  onMatchSelect: (matchId: string) => void;
}

function TickerScore({ value }: { value: number }) {
  const prevRef = useRef(value);
  const [pop, setPop] = useState(false);

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value;
      setPop(true);
      const id = setTimeout(() => setPop(false), 650);
      return () => clearTimeout(id);
    }
  }, [value]);

  return (
    <span className={`inline-block tabular-nums ${pop ? "score-pop" : ""}`}>
      {value}
    </span>
  );
}

function TickerItem({
  match,
  onClick,
}: {
  match: MatchSummaryWithLeague;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
    >
      <span className="font-medium">{match.home_team.short_name}</span>
      <span className="font-mono font-extrabold text-white">
        <TickerScore value={match.score.home} />
        <span className="text-text-dim/50">-</span>
        <TickerScore value={match.score.away} />
      </span>
      <span className="font-medium">{match.away_team.short_name}</span>
      <span className="rounded bg-accent-red/15 px-1 py-px text-[8px] font-bold text-accent-red">
        {phaseShortLabel(match.phase)}
      </span>
      {match.clock && (
        <span className="text-[9px] font-semibold tabular-nums text-accent-green">{match.clock}</span>
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

  const emptyStreakRef = useRef(0);
  const [stableMatches, setStableMatches] = useState<MatchSummaryWithLeague[]>([]);

  useEffect(() => {
    if (!data) return;
    const fresh = data.matches || [];
    if (fresh.length > 0) {
      emptyStreakRef.current = 0;
      setStableMatches(fresh);
    } else {
      emptyStreakRef.current += 1;
      // Clear after 2 consecutive empty polls to avoid flicker from a single transient blip
      if (emptyStreakRef.current >= 2) {
        setStableMatches([]);
      }
    }
  }, [data]);

  if (stableMatches.length === 0) return null;

  const duration = Math.max(20, stableMatches.length * 4);

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
          {stableMatches.map((m) => (
            <TickerItem
              key={`a-${m.id}`}
              match={m}
              onClick={() => onMatchSelect(m.id)}
            />
          ))}

          <span className="mx-2 h-1 w-1 shrink-0 rounded-full bg-surface-border" />

          {stableMatches.map((m) => (
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
