"use client";

import Link from "next/link";
import { memo, useEffect, useRef, useState } from "react";
import type { MatchSummary } from "@/lib/types";
import { formatTime, isLive, phaseLabel, phaseShortLabel, phaseShortLabelWithClock } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TeamLogo } from "./team-logo";
import { GlassPill } from "./ui/glass";
import { TrackButton } from "./track-button";
import { hapticSelection } from "@/lib/haptics";

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
      : "text-white [text-shadow:0_0_10px_rgba(0,230,118,0.25)]";

  return (
    <span
      className={`inline-block font-mono text-score-md tabular-nums ${
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
    // Parse M:SS or MM:SS (optional .decimals) so we can tick every second between API polls
    const clockMatch = serverClock?.trim().match(/^(\d+):(\d{2})(?:\.\d+)?$/);
    if (clockMatch) {
      const m = parseInt(clockMatch[1], 10);
      const s = parseInt(clockMatch[2], 10);
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

    // No clock from API: use start_time for elapsed time so the display at least ticks
    if (!serverClock && startTime && (phase.startsWith("live_") || phase === "break")) {
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
  leagueNameForLink?: string;
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: (matchId: string) => void;
  /** Favorite team IDs — show star and highlight when match involves a favorite */
  favoriteTeamIds?: string[];
  onToggleFavoriteTeam?: (teamId: string) => void;
}

function buildMatchHref(matchId: string, leagueName?: string): string {
  const base = `/match/${matchId}`;
  if (!leagueName?.trim()) return base;
  return `${base}?league=${encodeURIComponent(leagueName.trim())}`;
}

function FavoriteStar({
  teamId,
  isFavorite,
  onToggle,
}: {
  teamId: string;
  isFavorite: boolean;
  onToggle: (teamId: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        hapticSelection();
        onToggle(teamId);
      }}
      data-testid="favorite-btn"
      className="shrink-0 rounded p-0.5 text-text-muted hover:text-accent-amber focus:outline-none focus:ring-2 focus:ring-accent-amber/50"
      aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={isFavorite}
    >
      {isFavorite ? (
        <span className="text-[14px]" aria-hidden>★</span>
      ) : (
        <span className="text-[14px] opacity-60" aria-hidden>☆</span>
      )}
    </button>
  );
}

export const MatchCard = memo(function MatchCard({
  match,
  leagueNameForLink,
  pinned = false,
  onTogglePin,
  favoriteTeamIds = [],
  onToggleFavoriteTeam,
}: MatchCardProps) {
  const live = isLive(match.phase);
  const finished = match.phase === "finished";
  const scheduled = match.phase === "scheduled" || match.phase === "pre_match";
  const homeFav = favoriteTeamIds.includes(match.home_team.id);
  const awayFav = favoriteTeamIds.includes(match.away_team.id);
  const hasFavorite = homeFav || awayFav;

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
      data-testid="match-item"
      className={`
        group relative flex h-12 items-center
        border-b border-glass-border-light
        transition-all duration-150
        hover:bg-glass-hover glass-press
        ${live ? "bg-accent-red/[0.03]" : ""}
        ${flash ? "score-flash" : ""}
        ${hasFavorite ? "border-l-2 border-l-accent-amber/70" : ""}
      `}
      aria-label={`${match.home_team.name} ${match.score.home} ${match.score.away} ${match.away_team.name}, ${live ? "live" : finished ? "full time" : "view match"}`}
    >
      {/* Status column */}
      <div className="flex w-[60px] shrink-0 flex-col items-center justify-center px-1">
        {live ? (
          <>
            <GlassPill variant="live" size="xs" pulse>
              {phaseShortLabelWithClock(match.phase, match.clock)}
            </GlassPill>
            <span className="mt-0.5 font-mono text-label-sm font-bold leading-tight text-accent-green tabular-nums">
              <LiveClock
                serverClock={match.clock}
                startTime={match.start_time}
                phase={match.phase}
                period={match.period}
              />
            </span>
          </>
        ) : finished ? (
          <GlassPill variant="ft" size="xs">FT</GlassPill>
        ) : scheduled && match.start_time ? (
          <span className="text-label-md text-text-muted">
            {formatTime(match.start_time)}
          </span>
        ) : (
          <span className="text-label-sm text-text-muted">
            {phaseLabel(match.phase)}
          </span>
        )}
      </div>

      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-2">
        {onToggleFavoriteTeam && (
          <FavoriteStar
            teamId={match.home_team.id}
            isFavorite={homeFav}
            onToggle={onToggleFavoriteTeam}
          />
        )}
        <span
          className={`truncate text-right text-body-sm ${
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
      <div
        className="flex shrink-0 flex-col items-center justify-center gap-0"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Score: ${match.score.home} to ${match.score.away}`}
      >
        <div className="flex items-center justify-center gap-1">
          {scheduled ? (
            <span className="text-label-md text-text-muted">vs</span>
          ) : (
            <>
              <AnimatedScore
                value={match.score.home}
                live={live || (finished && match.score.home > match.score.away)}
              />
              <span className="text-label-sm text-text-dim">-</span>
              <AnimatedScore
                value={match.score.away}
                live={live || (finished && match.score.away > match.score.home)}
              />
            </>
          )}
        </div>
        {!scheduled &&
          typeof match.score.aggregate_home === "number" &&
          typeof match.score.aggregate_away === "number" && (
            <span className="text-label-xs tabular-nums text-text-secondary" title="Aggregate score (two legs)">
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
          className={`truncate text-body-sm ${
            !finished || match.score.away > match.score.home
              ? "font-semibold text-text-primary"
              : "text-text-secondary"
          }`}
        >
          {match.away_team.name}
        </span>
        {onToggleFavoriteTeam && (
          <FavoriteStar
            teamId={match.away_team.id}
            isFavorite={awayFav}
            onToggle={onToggleFavoriteTeam}
          />
        )}
      </div>

      {/* Track */}
      {onTogglePin && (
        <div className={`mr-1 shrink-0 transition-opacity ${
          pinned ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        }`}>
          <TrackButton
            matchId={match.id}
            pinned={pinned}
            onToggle={() => onTogglePin(match.id)}
          />
        </div>
      )}
    </Link>
  );
});
