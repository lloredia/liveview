"use client";

import { TeamLogo } from "../../team-logo";
import { BarChart3 } from "../../ui/icons";
import { EXCLUDED_TEAM_STATS, TEAM_STAT_DISPLAY_ORDER } from "../helpers";
import type { ESPNTeamStat } from "../types";

interface TeamStatsTabProps {
  homeStats: ESPNTeamStat[];
  awayStats: ESPNTeamStat[];
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  loading: boolean;
  live: boolean;
  phase?: string;
}

export function TeamStatsTab({
  homeStats,
  awayStats,
  homeTeamLogo,
  awayTeamLogo,
  homeTeamName,
  awayTeamName,
  loading,
  live,
  phase,
}: TeamStatsTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-3">
          <div className="h-6 w-6 animate-pulse rounded-full bg-surface-hover" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-surface-hover" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-surface-border/30 px-6 py-3.5">
            <div className="h-3 w-12 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-12 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (homeStats.length === 0 && awayStats.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 flex justify-center text-text-dim"><BarChart3 size={32} /></div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">
          {isScheduled ? "Pre-Match Stats" : live ? "Waiting for Statistics" : "No Statistics Available"}
        </div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Season statistics will appear here. In-match stats available during the game."
            : live
              ? "Stats will populate as the match progresses"
              : "Match stats were not available for this game"}
        </div>
      </div>
    );
  }

  // Build stat map keyed by stat name
  const homeMap = new Map(homeStats.map((s) => [s.name, s]));
  const awayMap = new Map(awayStats.map((s) => [s.name, s]));
  const allStatNames = Array.from(new Set([...homeStats.map((s) => s.name), ...awayStats.map((s) => s.name)]));

  const ordered: string[] = [];
  for (const name of TEAM_STAT_DISPLAY_ORDER) {
    if (allStatNames.includes(name) && !EXCLUDED_TEAM_STATS.has(name)) ordered.push(name);
  }
  for (const name of allStatNames) {
    if (!ordered.includes(name) && !EXCLUDED_TEAM_STATS.has(name)) ordered.push(name);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="flex items-center justify-between border-b border-surface-border px-6 py-3">
        <TeamLogo url={homeTeamLogo} name={homeTeamName} size={28} />
        <span className="text-label-sm font-bold uppercase tracking-[0.15em] text-text-dim">Team Stats</span>
        <TeamLogo url={awayTeamLogo} name={awayTeamName} size={28} />
      </div>

      {ordered.map((statName, i) => {
        const home = homeMap.get(statName);
        const away = awayMap.get(statName);
        const hStr = home?.displayValue || "—";
        const aStr = away?.displayValue || "—";
        const label = home?.label || away?.label || statName.replace(/([A-Z])/g, " $1").trim();

        const hNum = parseFloat(hStr.replace(/[^0-9.\-]/g, "")) || 0;
        const aNum = parseFloat(aStr.replace(/[^0-9.\-]/g, "")) || 0;
        const homeLeads = hNum > aNum;
        const awayLeads = aNum > hNum;

        return (
          <div key={statName} className={`flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-hover/15 ${i < ordered.length - 1 ? "border-b border-surface-border/30" : ""}`}>
            <div className="w-[72px]">
              {homeLeads ? (
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-blue px-2.5 py-0.5 font-mono text-body-sm font-bold text-white">{hStr}</span>
              ) : (
                <span className="font-mono text-body-sm font-semibold text-text-primary">{hStr}</span>
              )}
            </div>
            <span className="flex-1 text-center text-label-md font-medium text-text-secondary">{label}</span>
            <div className="flex w-[72px] justify-end">
              {awayLeads ? (
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-red px-2.5 py-0.5 font-mono text-body-sm font-bold text-white">{aStr}</span>
              ) : (
                <span className="font-mono text-body-sm font-semibold text-text-primary">{aStr}</span>
              )}
            </div>
          </div>
        );
      })}

      {live && (
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-label-sm text-text-dim">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
          Stats update live
        </div>
      )}
    </div>
  );
}
