"use client";

import { memo, useEffect, useRef, useState } from "react";
import type { MatchSummary } from "@/lib/types";
import { formatTime, isLive, phaseLabel } from "@/lib/utils";
import { TeamLogo } from "./team-logo";

function LiveClock({
  serverClock,
  startTime,
  phase,
}: {
  serverClock: string | null;
  startTime: string | null;
  phase: string;
}) {
  const [display, setDisplay] = useState(serverClock || phaseLabel(phase));
  const serverRef = useRef(serverClock);

  // Re-sync when server sends a new clock value
  useEffect(() => {
    serverRef.current = serverClock;
  }, [serverClock]);

  useEffect(() => {
    // If we have a server clock in mm:ss format, use it as a base and tick
    if (serverClock && /^\d+:\d{2}$/.test(serverClock)) {
      const [m, s] = serverClock.split(":").map(Number);
      const baseSecs = m * 60 + s;
      const capturedAt = Date.now();

      // Detect sport from phase: soccer phases use "half"/"extra"/"penalties"
      const isSoccer =
        phase.includes("half") ||
        phase.includes("extra") ||
        phase.includes("penalties") ||
        phase === "live_first_half" ||
        phase === "live_second_half";

      const tick = () => {
        const elapsed = Math.floor((Date.now() - capturedAt) / 1000);
        // Soccer: count up; Basketball/Hockey: count down
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

    // No clock from server but match is live — compute from start_time (soccer-style)
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
  }, [serverClock, startTime, phase]);

  return <>{display}</>;
}

interface MatchCardProps {
  match: MatchSummary;
  onClick: () => void;
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: (matchId: string) => void;
}

export const MatchCard = memo(function MatchCard({ match, onClick, pinned = false, onTogglePin }: MatchCardProps) {
  const live = isLive(match.phase);
  const finished = match.phase === "finished";
  const scheduled = match.phase === "scheduled" || match.phase === "pre_match";

  return (
    <div
      onClick={onClick}
      className={`
        group relative flex h-12 cursor-pointer items-center border-b border-surface-border
        transition-colors duration-150 hover:bg-surface-hover
        ${live ? "bg-accent-red/[0.04]" : ""}
      `}
    >
      {/* Status column */}
      <div className="flex w-[60px] shrink-0 items-center justify-center px-2">
        {live ? (
          <div className="flex items-center gap-1">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
            </span>
            <span className="font-mono text-[11px] font-bold text-accent-green">
              <LiveClock
                serverClock={match.clock}
                startTime={match.start_time}
                phase={match.phase}
              />
            </span>
          </div>
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
        <TeamLogo url={match.home_team.logo_url} name={match.home_team.short_name} size={20} className="shrink-0 md:h-5 md:w-5 h-4 w-4" />
      </div>

      {/* Score */}
      <div className="flex w-[52px] shrink-0 items-center justify-center gap-1">
        {scheduled ? (
          <span className="text-[11px] text-text-muted">vs</span>
        ) : (
          <>
            <span
              className={`font-mono text-base font-bold md:text-lg ${
                live ? "text-text-primary" : finished && match.score.home > match.score.away ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              {match.score.home}
            </span>
            <span className="text-[10px] text-text-dim">-</span>
            <span
              className={`font-mono text-base font-bold md:text-lg ${
                live ? "text-text-primary" : finished && match.score.away > match.score.home ? "text-text-primary" : "text-text-secondary"
              }`}
            >
              {match.score.away}
            </span>
          </>
        )}
      </div>

      {/* Away team */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 pl-2">
        <TeamLogo url={match.away_team.logo_url} name={match.away_team.short_name} size={20} className="shrink-0 md:h-5 md:w-5 h-4 w-4" />
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

      {/* Pin (hover only) */}
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(match.id);
          }}
          className={`mr-2 shrink-0 rounded p-1 text-[10px] transition-opacity ${
            pinned
              ? "text-accent-blue opacity-100"
              : "text-text-dim opacity-0 group-hover:opacity-100 hover:text-accent-blue"
          }`}
          aria-label={pinned ? "Unpin" : "Pin"}
        >
          {pinned ? "★" : "☆"}
        </button>
      )}
    </div>
  );
});
