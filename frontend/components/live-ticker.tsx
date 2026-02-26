"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchLiveMatches } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { phaseShortLabelWithClock } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
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
      className="flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-text-primary"
      aria-label={`${match.home_team.short_name} ${match.score.home} ${match.score.away} ${match.away_team.short_name}, live`}
    >
      <span className="font-medium">{match.home_team.short_name}</span>
      <span className={scoreClass}>
        <TickerScore value={match.score.home} />
        <span className="text-text-dim/50">-</span>
        <TickerScore value={match.score.away} />
      </span>
      <span className="font-medium">{match.away_team.short_name}</span>
      <span className="rounded bg-accent-red/15 px-1 py-px text-[8px] font-bold text-accent-red">
        {phaseShortLabelWithClock(match.phase, match.clock)}
      </span>
      {match.clock && (
        <span className="text-[9px] font-semibold tabular-nums text-accent-green">{match.clock}</span>
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
      // Clear after 2 consecutive empty polls to avoid flicker from a single transient blip
      if (emptyStreakRef.current >= 2) {
        setStableMatches([]);
      }
    }
  }, [data]);

  if (stableMatches.length === 0) return null;

  const duration = Math.max(20, stableMatches.length * 4);

  return (
    <div
      className="flex h-8 items-center border-b border-surface-border bg-surface-raised overflow-hidden"
      aria-hidden="true"
    >
      {/* Fixed LIVE label — decorative; main match list is the accessible source */}
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 border-r border-surface-border bg-surface-raised px-2.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
        <span className="text-[10px] font-bold uppercase text-accent-red">
          Live
        </span>
      </div>

      {/* Scrolling track — matches duplicated for seamless loop; single overflow container */}
      <div className="relative flex-1 overflow-x-auto overflow-y-hidden" style={{ WebkitOverflowScrolling: "touch" }}>
        <div
          className="ticker-track flex items-center gap-4 whitespace-nowrap"
          style={{ "--ticker-duration": `${duration}s` } as React.CSSProperties}
        >
          {stableMatches.map((m) => (
            <TickerItem key={`a-${m.id}`} match={m} />
          ))}

          <span className="mx-2 h-1 w-1 shrink-0 rounded-full bg-surface-border" aria-hidden="true" />

          {stableMatches.map((m) => (
            <TickerItem key={`b-${m.id}`} match={m} />
          ))}
        </div>
      </div>
    </div>
  );
}
