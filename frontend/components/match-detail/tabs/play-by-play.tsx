"use client";

import { useState } from "react";
import type { ESPNPlay } from "../types";

interface PlayByPlayTabProps {
  plays: ESPNPlay[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  loading: boolean;
  live: boolean;
  phase: string;
}

export function PlayByPlayTab({
  plays,
  homeTeamName,
  awayTeamName,
  homeTeamId,
  awayTeamId,
  loading,
  live,
  phase,
}: PlayByPlayTabProps) {
  const [collapsedPeriods, setCollapsedPeriods] = useState<Set<number>>(new Set());

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-3">
            <div className="h-3 w-10 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (plays.length === 0) {
    const isScheduled = phase === "scheduled" || phase === "pre_match";
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">{isScheduled ? "📅" : live ? "⏱" : "🏁"}</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">
          {isScheduled ? "Match Hasn't Started" : live ? "Waiting for Plays..." : "No Play Data Available"}
        </div>
        <div className="text-label-lg text-text-muted">
          {isScheduled ? "Play-by-play will appear once the game begins" : live ? "Events will stream in real time" : "Play-by-play data was not available for this match"}
        </div>
      </div>
    );
  }

  // Group by period, reverse order (latest period first)
  const periodMap = new Map<number, { label: string; plays: ESPNPlay[] }>();
  for (const play of plays) {
    const pNum = play.period.number;
    if (!periodMap.has(pNum)) periodMap.set(pNum, { label: play.period.displayValue || `Period ${pNum}`, plays: [] });
    periodMap.get(pNum)!.plays.push(play);
  }
  const periods = Array.from(periodMap.entries()).sort((a, b) => b[0] - a[0]);
  for (const [, group] of periods) group.plays.reverse();

  const togglePeriod = (pNum: number) => {
    setCollapsedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(pNum)) next.delete(pNum);
      else next.add(pNum);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {periods.map(([pNum, group], gi) => {
        const isCollapsed = collapsedPeriods.has(pNum);
        return (
          <div key={pNum}>
            <button
              onClick={() => togglePeriod(pNum)}
              className={`flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-surface-hover/40 ${gi > 0 ? "border-t border-surface-border" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-label-md font-bold uppercase tracking-widest text-text-primary">{group.label}</span>
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-label-xs font-semibold text-text-muted">{group.plays.length} plays</span>
              </div>
              <svg className={`h-3.5 w-3.5 text-text-muted transition-transform ${isCollapsed ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!isCollapsed && group.plays.map((play, i) => {
              const isHome = play.team?.id === homeTeamId;
              const isAway = play.team?.id === awayTeamId;

              return (
                <div
                  key={play.id || `${pNum}-${i}`}
                  className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover/20 ${
                    i < group.plays.length - 1 ? "border-b border-surface-border/30" : ""
                  } ${play.scoringPlay ? "bg-accent-green/[0.04]" : ""}`}
                >
                  <div className="flex w-[52px] shrink-0 items-center gap-2">
                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isHome ? "bg-accent-blue" : isAway ? "bg-accent-red/80" : "bg-surface-border"}`} />
                    <span className="font-mono text-label-md font-bold text-text-muted">{play.clock.displayValue || "—"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-label-md leading-relaxed text-text-secondary">
                      {play.scoringPlay && <span className="mr-1 text-label-sm">🏀</span>}
                      {play.text}
                    </div>
                  </div>
                  {play.scoringPlay && (
                    <div className="shrink-0 rounded-md bg-surface-hover px-2 py-1 font-mono text-label-md font-bold text-text-primary">
                      {homeTeamName} {play.homeScore} - {play.awayScore} {awayTeamName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {live && (
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-label-sm text-text-dim">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
          Live — plays update in real time
        </div>
      )}
    </div>
  );
}
