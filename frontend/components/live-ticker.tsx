"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { phaseShortLabelWithClock } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TeamLogo } from "./team-logo";
import { GlassPill } from "./ui/glass";
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

function buildMatchHref(matchId: string, leagueName?: string): string {
  const base = `/match/${matchId}`;
  if (!leagueName?.trim()) return base;
  return `${base}?league=${encodeURIComponent(leagueName.trim())}`;
}

function TickerItem({ match }: { match: MatchSummaryWithLeague }) {
  const { theme } = useTheme();
  const scoreClass = theme === "light" ? "font-mono font-extrabold text-text-primary" : "font-mono font-extrabold text-white";
  const href = buildMatchHref(match.id, match.league_name ?? undefined);
  return (
    <Link
      href={href}
      className="flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1 text-label-md text-text-secondary transition-all duration-150 hover:bg-glass-hover hover:text-text-primary glass-press"
      aria-label={`${match.home_team.short_name} ${match.score.home} ${match.score.away} ${match.away_team.short_name}, live`}
    >
      <TeamLogo url={match.home_team.logo_url} name={match.home_team.short_name} size={14} />
      <span className="font-medium">{match.home_team.short_name}</span>
      <span className={scoreClass}>
        <TickerScore value={match.score.home} />
        <span className="text-text-dim/40 mx-0.5">-</span>
        <TickerScore value={match.score.away} />
      </span>
      <span className="font-medium">{match.away_team.short_name}</span>
      <TeamLogo url={match.away_team.logo_url} name={match.away_team.short_name} size={14} />
      <GlassPill variant="live" size="xs">
        {phaseShortLabelWithClock(match.phase, match.clock)}
      </GlassPill>
      {match.clock && (
        <span className="text-label-xs tabular-nums text-accent-green">{match.clock}</span>
      )}
    </Link>
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
      if (emptyStreakRef.current >= 2) {
        setStableMatches([]);
      }
    }
  }, [data]);

  if (stableMatches.length === 0) return null;

  const duration = Math.max(20, stableMatches.length * 4);

  return (
    <div
      className="flex h-9 items-center border-b border-glass-border glass-surface-elevated glass-blur overflow-hidden"
      aria-hidden="true"
    >
      {/* Fixed LIVE label */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-r border-glass-border px-3 bg-glass-elevated">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
        <span className="text-label-sm font-bold uppercase text-accent-red">
          Live
        </span>
      </div>

      {/* Scrolling track */}
      <div className="relative flex-1 overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          className="ticker-track flex items-center gap-3 whitespace-nowrap"
          style={{ "--ticker-duration": `${duration}s` } as React.CSSProperties}
        >
          {stableMatches.map((m) => (
            <TickerItem key={`a-${m.id}`} match={m} />
          ))}

          <span className="mx-2 h-1 w-1 shrink-0 rounded-full bg-glass-border" aria-hidden="true" />

          {stableMatches.map((m) => (
            <TickerItem key={`b-${m.id}`} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
