"use client";

import { Countdown } from "./countdown";
import type { MatchSummary } from "@/lib/types";
import { formatTime, isLive, phaseColor, phaseLabel } from "@/lib/utils";
import { TeamLogo } from "./team-logo";

interface MatchCardProps {
  match: MatchSummary;
  onClick: () => void;
  compact?: boolean;
  pinned?: boolean;
  onTogglePin?: (matchId: string) => void;
}

export function MatchCard({ match, onClick, compact = false, pinned = false, onTogglePin }: MatchCardProps) {
  const live = isLive(match.phase);
  const finished = match.phase === "finished";
  const scheduled = match.phase === "scheduled" || match.phase === "pre_match";
  const color = phaseColor(match.phase);

  return (
    <div
      onClick={onClick}
      className={`
        group relative cursor-pointer overflow-hidden rounded-xl border
        transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98]
        ${live
          ? "border-red-500/20 bg-gradient-to-br from-surface-card via-[#1a0f0f] to-surface-card shadow-[0_0_20px_rgba(239,68,68,0.05)] hover:border-red-500/35"
          : "border-surface-border bg-surface-card hover:border-surface-border-light hover:shadow-lg hover:shadow-black/10"
        }
        ${compact ? "px-4 py-3" : "px-5 py-4"}
      `}
    >
      {/* Live shimmer bar */}
      {live && (
        <div className="absolute inset-x-0 top-0 h-[2px] animate-shimmer bg-gradient-to-r from-transparent via-red-500 to-transparent" />
      )}

      {/* Pin button */}
      {onTogglePin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(match.id);
          }}
          className={`absolute right-2 top-2 z-10 rounded-lg p-1 text-[11px] transition-all ${
            pinned
              ? "text-accent-blue opacity-100"
              : "text-text-dim opacity-0 group-hover:opacity-100 hover:text-accent-blue"
          }`}
          title={pinned ? "Unpin from tracker" : "Pin to tracker"}
        >
          📌
        </button>
      )}

      {/* Status row */}
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-3"}`}>
        <div className="flex items-center gap-1.5">
          {live ? (
            <div className="relative h-[7px] w-[7px]">
              <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
              <div className="relative h-[7px] w-[7px] rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
            </div>
          ) : (
            <div
              className="h-[7px] w-[7px] rounded-full"
              style={{ background: color }}
            />
          )}
          <span
            className={`text-[11px] font-semibold uppercase tracking-wider ${live ? "text-red-400" : ""}`}
            style={live ? undefined : { color }}
          >
            {phaseLabel(match.phase)}
          </span>
        </div>

        {/* Clock / Countdown / Time */}
        {scheduled && match.start_time ? (
          <Countdown startTime={match.start_time} className="text-[11px] font-semibold" />
        ) : match.clock && !scheduled ? (
          <span
            className={`font-mono text-xs font-bold ${live ? "text-red-400" : "text-text-secondary"}`}
          >
            {match.clock}
          </span>
        ) : match.start_time ? (
          <span className="text-[11px] text-text-muted">
            {formatTime(match.start_time)}
          </span>
        ) : null}
      </div>

      {/* Teams */}
      <div className={`flex flex-col ${compact ? "gap-1.5" : "gap-2.5"}`}>
        <TeamRow
          team={match.home_team}
          score={match.score.home}
          winning={match.score.home > match.score.away}
          live={live}
          finished={finished}
        />
        <TeamRow
          team={match.away_team}
          score={match.score.away}
          winning={match.score.away > match.score.home}
          live={live}
          finished={finished}
        />
      </div>

      {/* Venue */}
      {match.venue && !compact && (
        <div className="mt-2.5 truncate text-[10px] text-text-muted">
          📍 {match.venue}
        </div>
      )}
    </div>
  );
}

function TeamRow({
  team,
  score,
  winning,
  live,
  finished,
}: {
  team: MatchSummary["home_team"];
  score: number;
  winning: boolean;
  live: boolean;
  finished: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <TeamLogo url={team.logo_url} name={team.short_name} size={28} />
        <span
          className={`truncate text-sm ${
            winning ? "font-bold text-text-primary" : finished ? "text-text-tertiary" : "font-medium text-text-secondary"
          }`}
        >
          {team.name}
        </span>
      </div>
      <span
        className={`min-w-[30px] text-right font-mono text-xl font-extrabold ${
          winning && live ? "text-red-400" : winning ? "text-text-primary" : finished ? "text-text-tertiary" : "text-text-secondary"
        }`}
      >
        {score}
      </span>
    </div>
  );
}