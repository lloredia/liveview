"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import type { MatchSummary } from "@/lib/types";
import { formatTime, isLive, phaseLabel, phaseShortLabel } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TeamLogo } from "./team-logo";

/* ── Animated score digit ─────────────────────────────────────────── */

function AnimatedScore({ value, live }: { value: number; live: boolean }) {
  const { theme } = useTheme();
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

  const liveScoreClass =
    theme === "light"
      ? "text-text-primary"
      : "text-white [text-shadow:0_0_10px_rgba(0,230,118,0.3)]";

  return (
    <span
      className={`inline-block font-mono text-[17px] font-extrabold tabular-nums md:text-xl ${
        live ? liveScoreClass : "text-text-primary"
      } ${pop ? "score-pop" : ""}`}
    >
      {value}
    </span>
  );
}

/* ── Live clock with countdown ────────────────────────────────────── */

function LiveClock({
  serverClock,
  startTime,
  phase,
  period,
}: {
  serverClock: string | null;
  startTime: string | null;
  phase: string;
  period: string | null;
}) {
  // Baseball: show inning (period) instead of clock; MLB has no game clock
  const isBaseball = phase === "live_inning";
  const rawPeriod = period?.trim();
  const inningLabel = isBaseball && rawPeriod
    ? /^\d+$/.test(rawPeriod)
      ? `${rawPeriod}${rawPeriod === "1" ? "st" : rawPeriod === "2" ? "nd" : rawPeriod === "3" ? "rd" : "th"}`
      : rawPeriod
    : null;

  const [display, setDisplay] = useState(
    inningLabel ?? serverClock ?? phaseLabel(phase),
  );

  useEffect(() => {
    if (inningLabel) {
      setDisplay(inningLabel);
      return;
    }
    if (serverClock && /^\d+:\d{2}$/.test(serverClock)) {
      const [m, s] = serverClock.split(":").map(Number);
      const baseSecs = m * 60 + s;
      const capturedAt = Date.now();

      const isSoccer =
        phase.includes("half") ||
        phase.includes("extra") ||
        phase.includes("penalties") ||
        phase === "live_first_half" ||
        phase === "live_second_half";

      const tick = () => {
        const elapsed = Math.floor((Date.now() - capturedAt) / 1000);
        const current = isSoccer
          ? baseSecs + elapsed
          : Math.max(0, baseSecs - elapsed);
        const mm = Math.floor(current / 60);
        const ss = current % 60;
        setDisplay(`${mm}:${ss.toString().padStart(2, "0")}`);
      };

      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    if (!serverClock && startTime) {
      const startMs = new Date(startTime).getTime();
      const tick = () => {
        const elapsed = Math.max(0, Date.now() - startMs);
        const mm = Math.floor(elapsed / 60000);
        const ss = Math.floor((elapsed % 60000) / 1000);
        setDisplay(`${mm}:${ss.toString().padStart(2, "0")}`);
      };
      tick();
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }

    setDisplay(serverClock || phaseLabel(phase));
  }, [serverClock, startTime, phase, inningLabel]);

  return <>{display}</>;
}

/* ── Match card ───────────────────────────────────────────────────── */

interface MatchCardProps {
  match: MatchSummary;
  /** Optional league name to append as ?league= for match detail context */
  leagueNameForLink?: string;
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: (matchId: string) => void;
}

function buildMatchHref(matchId: string, leagueName?: string): string {
  const base = `/match/${matchId}`;
  if (!leagueName?.trim()) return base;
  return `${base}?league=${encodeURIComponent(leagueName.trim())}`;
}

export const MatchCard = memo(function MatchCard({
  match,
  leagueNameForLink,
  pinned = false,
  onTogglePin,
}: MatchCardProps) {
  const live = isLive(match.phase);
  const finished = match.phase === "finished";
  const scheduled = match.phase === "scheduled" || match.phase === "pre_match";

  const prevScoreRef = useRef({ home: match.score.home, away: match.score.away });
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const prev = prevScoreRef.current;
    if (live && (match.score.home !== prev.home || match.score.away !== prev.away)) {
      prevScoreRef.current = { home: match.score.home, away: match.score.away };
      setFlash(true);
      const id = setTimeout(() => setFlash(false), 1200);
      return () => clearTimeout(id);
    }
  }, [live, match.score.home, match.score.away]);

  const href = buildMatchHref(match.id, leagueNameForLink);

  return (
    <Link
      href={href}
      className={`
        group relative flex h-12 cursor-pointer items-center border-b border-surface-border
        transition-colors duration-150 hover:bg-surface-hover
        ${live ? "bg-accent-red/[0.04]" : ""}
        ${flash ? "score-flash" : ""}
      `}
      aria-label={`${match.home_team.name} ${match.score.home} ${match.score.away} ${match.away_team.name}, ${live ? "live" : finished ? "full time" : "view match"}`}
    >
      {/* Status column */}
      <div className="flex w-[60px] shrink-0 flex-col items-center justify-center px-1">
        {live ? (
          <>
            <span className="rounded bg-accent-red/15 px-1.5 py-px text-[9px] font-extrabold leading-tight text-accent-red">
              {phaseShortLabel(match.phase)}
            </span>
            <span className="mt-0.5 font-mono text-[10px] font-bold leading-tight text-accent-green tabular-nums">
              <LiveClock
                serverClock={match.clock}
                startTime={match.start_time}
                phase={match.phase}
                period={match.period}
              />
            </span>
          </>
        ) : finished ? (
          <span className="text-[11px] font-semibold text-text-muted">FT</span>
        ) : scheduled && match.start_time ? (
          <span className="text-[11px] font-medium text-text-muted">
            {formatTime(match.start_time)}
          </span>
        ) : (
          <span className="text-[10px] font-semibold text-text-muted">
            {phaseLabel(match.phase)}
          </span>
        )}
      </div>

      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-2">
        <span
          className={`truncate text-right text-[13px] md:text-sm ${
            !finished || match.score.home > match.score.away
              ? "font-semibold text-text-primary"
              : "text-text-secondary"
          }`}
        >
          {match.home_team.name}
        </span>
        <TeamLogo
          url={match.home_team.logo_url}
          name={match.home_team.short_name}
          size={20}
          className="shrink-0 md:h-5 md:w-5 h-4 w-4"
        />
      </div>

      {/* Score */}
      <div className="flex shrink-0 flex-col items-center justify-center gap-0">
        <div className="flex items-center justify-center gap-1">
          {scheduled ? (
            <span className="text-[11px] text-text-muted">vs</span>
          ) : (
            <>
              <AnimatedScore
                value={match.score.home}
                live={live || (finished && match.score.home > match.score.away)}
              />
              <span className="text-[10px] text-text-dim">-</span>
              <AnimatedScore
                value={match.score.away}
                live={live || (finished && match.score.away > match.score.home)}
              />
            </>
          )}
        </div>
        {!scheduled &&
          match.score.aggregate_home != null &&
          match.score.aggregate_away != null && (
            <span className="text-[9px] font-medium text-text-muted tabular-nums">
              {match.score.aggregate_home}-{match.score.aggregate_away} agg
            </span>
          )}
      </div>

      {/* Away team */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        <TeamLogo
          url={match.away_team.logo_url}
          name={match.away_team.short_name}
          size={20}
          className="shrink-0 md:h-5 md:w-5 h-4 w-4"
        />
        <span
          className={`truncate text-[13px] md:text-sm ${
            !finished || match.score.away > match.score.home
              ? "font-semibold text-text-primary"
              : "text-text-secondary"
          }`}
        >
          {match.away_team.name}
        </span>
      </div>

      {/* Pin (hover only) — stop propagation so Link doesn't navigate */}
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin(match.id);
          }}
          className={`mr-2 shrink-0 rounded p-1 text-[10px] transition-opacity ${
            pinned
              ? "text-accent-blue opacity-100"
              : "text-text-dim opacity-0 group-hover:opacity-100 hover:text-accent-blue"
          }`}
          aria-label={pinned ? "Unpin match" : "Pin match"}
        >
          {pinned ? "★" : "☆"}
        </button>
      )}
    </Link>
  );
});
