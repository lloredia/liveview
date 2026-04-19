"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MatchSummary } from "@/lib/types";
import { formatTime, isLive, phaseLabel, phaseShortLabel, phaseShortLabelWithClock } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { TeamLogo } from "./team-logo";
import { GlassPill } from "./ui/glass";
import { TrackButton } from "./track-button";
import { hapticSelection } from "@/lib/haptics";
import { buildTeamGradient, getTeamColor } from "@/lib/team-colors";

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
      className={`inline-block font-mono text-lg md:text-xl font-bold tracking-tighter tabular-nums ${
        live ? liveScoreClass : "text-text-primary"
      } ${pop ? "score-pop-dramatic" : ""}`}
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
      className="relative z-10 shrink-0 rounded p-0.5 text-text-muted hover:text-accent-amber focus:outline-none focus:ring-2 focus:ring-accent-amber/50"
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
  const [scoringTeam, setScoringTeam] = useState<"home" | "away" | null>(null);

  useEffect(() => {
    const prev = prevScoreRef.current;
    if (live && (match.score.home !== prev.home || match.score.away !== prev.away)) {
      const team = match.score.home !== prev.home ? "home" : "away";
      prevScoreRef.current = { home: match.score.home, away: match.score.away };
      setScoringTeam(team);
      setFlash(true);
      const id = setTimeout(() => {
        setFlash(false);
        setScoringTeam(null);
      }, 1500);
      return () => clearTimeout(id);
    }
  }, [live, match.score.home, match.score.away]);

  // Team color gradient background — stronger in light mode
  const { theme } = useTheme();
  const teamGradient = useMemo(
    () => buildTeamGradient(match.home_team.name, match.away_team.name, theme === "light" ? 0.12 : 0.08),
    [match.home_team.name, match.away_team.name, theme],
  );

  // Scoring team flash color
  const scoringFlashColor = useMemo(() => {
    if (!scoringTeam) return undefined;
    const name = scoringTeam === "home" ? match.home_team.name : match.away_team.name;
    const hex = getTeamColor(name);
    if (!hex) return undefined;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},0.20)`;
  }, [scoringTeam, match.home_team.name, match.away_team.name]);

  const href = buildMatchHref(match.id, leagueNameForLink);

  // Period / extra info line
  const periodInfo = useMemo(() => {
    if (live && match.period) {
      const p = match.period.trim();
      // Show short period label prominently
      if (/^Q?\d+$/i.test(p)) return `Q${p.replace(/\D/g, "")}`;
      if (/half/i.test(p)) return p;
      if (/^OT/i.test(p) || /overtime/i.test(p)) return "OT";
      return p;
    }
    return null;
  }, [live, match.period]);

  return (
    <article
      data-testid="match-item"
      className={`
        group relative flex min-h-[56px] items-center touch-manipulation
        border-b border-glass-border-light
        transition-all duration-150
        [@media(hover:hover)]:hover:bg-glass-hover glass-press
        ${live ? "bg-accent-red/[0.03]" : ""}
        ${flash ? "score-flash-team" : ""}
        ${hasFavorite ? "border-l-2 border-l-accent-amber/70" : ""}
      `}
      style={{
        backgroundImage: teamGradient || undefined,
        WebkitTapHighlightColor: "transparent",
        ...(flash && scoringFlashColor
          ? { "--flash-color": scoringFlashColor } as React.CSSProperties
          : {}),
      }}
    >
      <Link
        href={href}
        aria-label={`${match.home_team.name} ${match.score.home} ${match.score.away} ${match.away_team.name}, ${live ? "live" : finished ? "full time" : "view match"}`}
        className="absolute inset-0 z-0"
      />

      {/* Status column */}
      <div className="flex w-[52px] shrink-0 flex-col items-center justify-center px-0.5">
        {live ? (
          <>
            <GlassPill variant="live" size="xs" pulse>
              {periodInfo || phaseShortLabelWithClock(match.phase, match.clock)}
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
          <div className="flex flex-col items-center">
            <span className="text-label-md text-text-muted">
              {formatTime(match.start_time)}
            </span>
            {match.venue && (
              <span className="mt-0.5 max-w-[48px] truncate text-center text-label-xs text-text-dim" title={match.venue}>
                {match.venue}
              </span>
            )}
          </div>
        ) : (
          <span className="text-label-sm text-text-muted">
            {phaseLabel(match.phase)}
          </span>
        )}
      </div>

      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 pr-1.5">
        {onToggleFavoriteTeam && (
          <FavoriteStar
            teamId={match.home_team.id}
            isFavorite={homeFav}
            onToggle={onToggleFavoriteTeam}
          />
        )}
        <span
          className={`min-w-0 truncate text-right text-body-sm ${
            !finished || match.score.home > match.score.away
              ? "font-semibold text-text-primary"
              : "text-text-secondary"
          }`}
        >
          <span className="md:hidden">{match.home_team.short_name || match.home_team.name}</span>
          <span className="hidden md:inline">{match.home_team.name}</span>
        </span>
        <TeamLogo
          url={match.home_team.logo_url}
          name={match.home_team.short_name}
          size={20}
          className="shrink-0 h-4 w-4 md:h-5 md:w-5"
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
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-1.5">
        <TeamLogo
          url={match.away_team.logo_url}
          name={match.away_team.short_name}
          size={20}
          className="shrink-0 h-4 w-4 md:h-5 md:w-5"
        />
        <span
          className={`min-w-0 truncate text-body-sm ${
            !finished || match.score.away > match.score.home
              ? "font-semibold text-text-primary"
              : "text-text-secondary"
          }`}
        >
          <span className="md:hidden">{match.away_team.short_name || match.away_team.name}</span>
          <span className="hidden md:inline">{match.away_team.name}</span>
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
        <div className={`relative z-10 mr-1 shrink-0 transition-opacity ${
          pinned
            ? "opacity-100"
            : "opacity-0 pointer-events-none [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-hover:pointer-events-auto"
        }`}>
          <TrackButton
            matchId={match.id}
            pinned={pinned}
            onToggle={() => onTogglePin(match.id)}
          />
        </div>
      )}
    </article>
  );
});
