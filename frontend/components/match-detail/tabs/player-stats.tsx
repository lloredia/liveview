"use client";

import { useState } from "react";
import { isLive } from "@/lib/utils";
import { TeamLogo } from "../../team-logo";
import { getLeagueMapping, HIGHLIGHT_STATS, STAT_DISPLAY } from "../helpers";
import type { MatchCenterPlayerStatsSection, PlayerStatLine } from "../types";

interface PlayerStatsTabProps {
  section: MatchCenterPlayerStatsSection | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  phase?: string;
  onPlayerClick?: (
    player: PlayerStatLine,
    teamName: string,
    teamLogo: string | null,
    side: "home" | "away",
  ) => void;
}

export function PlayerStatsTab({
  section,
  loading,
  homeTeamLogo,
  awayTeamLogo,
  homeTeamName,
  awayTeamName,
  leagueName,
  phase,
  onPlayerClick,
}: PlayerStatsTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
  const live = isLive(phase ?? "");
  const mapping = getLeagueMapping(leagueName);
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  if (!mapping) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">Player Stats Unavailable</div>
        <div className="text-label-lg text-text-muted">Not supported for this league</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex border-b border-surface-border">
          <div className="flex-1 py-3 text-center"><div className="mx-auto h-3 w-24 animate-pulse rounded bg-surface-hover" /></div>
          <div className="w-px bg-surface-border" />
          <div className="flex-1 py-3 text-center"><div className="mx-auto h-3 w-24 animate-pulse rounded bg-surface-hover" /></div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-2.5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="flex-1" />
            {Array.from({ length: 5 }).map((_, j) => (<div key={j} className="h-3 w-8 animate-pulse rounded bg-surface-hover" />))}
          </div>
        ))}
      </div>
    );
  }

  if (!section || (!section.home.players.length && !section.away.players.length)) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">No Player Stats</div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Player stats will be available once the match starts"
            : live
              ? "Player stats will populate as the match progresses"
              : "Player statistics were not available for this match"}
        </div>
      </div>
    );
  }

  const usingFallback = section.source !== "espn";
  const homeSource = section.home;
  const awaySource = section.away;

  const teamData = activeSide === "home" ? homeSource : awaySource;
  const highlights = HIGHLIGHT_STATS[section.sport] || [];
  const displayMap = STAT_DISPLAY[section.sport] || {};
  const visibleColumns = teamData.statColumns.filter(
    (col) => Object.keys(displayMap).length === 0 || displayMap[col],
  );

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortedPlayers = [...teamData.players];
  if (sortCol) {
    sortedPlayers.sort((a, b) => {
      const aNum = parseFloat(String(a.stats[sortCol] ?? "").replace(/[^0-9.\-]/g, ""));
      const bNum = parseFloat(String(b.stats[sortCol] ?? "").replace(/[^0-9.\-]/g, ""));
      if (!isNaN(aNum) && !isNaN(bNum)) return sortAsc ? aNum - bNum : bNum - aNum;
      return sortAsc
        ? String(a.stats[sortCol] ?? "").localeCompare(String(b.stats[sortCol] ?? ""))
        : String(b.stats[sortCol] ?? "").localeCompare(String(a.stats[sortCol] ?? ""));
    });
  } else {
    sortedPlayers.sort((a, b) => (a.starter === b.starter ? 0 : a.starter ? -1 : 1));
  }

  const starters = sortedPlayers.filter((p) => p.starter);
  const bench = sortedPlayers.filter((p) => !p.starter);
  const injuries = activeSide === "home" ? section.injuries.home : section.injuries.away;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {usingFallback && (
        <div className="border-b border-surface-border px-3 py-2 text-label-md text-text-muted">
          Data by {section.source === "football_data" ? "Football-Data.org" : section.source}
        </div>
      )}
      {/* Team toggle */}
      <div className="flex border-b border-surface-border">
        <button onClick={() => { setActiveSide("home"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-label-lg font-semibold transition-all ${activeSide === "home" ? "border-b-2 border-accent-blue bg-accent-blue/5 text-accent-blue" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={homeTeamLogo} name={homeTeamName} size={18} />
          <span className="truncate">{homeSource.teamName || homeTeamName}</span>
        </button>
        <div className="w-px bg-surface-border" />
        <button onClick={() => { setActiveSide("away"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-label-lg font-semibold transition-all ${activeSide === "away" ? "border-b-2 border-accent-red bg-accent-red/5 text-accent-red" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={awayTeamLogo} name={awayTeamName} size={18} />
          <span className="truncate">{awaySource.teamName || awayTeamName}</span>
        </button>
      </div>

      <TopPerformers
        players={teamData.players}
        highlights={highlights}
        onPlayerSelect={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
      />

      {teamData.players.length === 0 ? (
        <div className="py-8 text-center text-label-lg text-text-muted">Player statistics not yet available</div>
      ) : (
        <div className="overflow-x-auto">
          {starters.length > 0 && (
            <PlayerTable
              label="Starters"
              players={starters}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
          {bench.length > 0 && (
            <PlayerTable
              label="Bench"
              players={bench}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
          {starters.length === 0 && bench.length === 0 && (
            <PlayerTable
              players={sortedPlayers}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
        </div>
      )}

      {injuries && injuries.length > 0 && (
        <div className="border-t border-surface-border">
          <div className="bg-surface-hover/30 px-4 py-2 text-label-xs font-bold uppercase tracking-widest text-text-dim">Injuries</div>
          {injuries.map((inj, i) => (
            <div key={`${inj.name}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < injuries.length - 1 ? "border-b border-surface-border/30" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {inj.jersey && <span className="font-mono text-label-xs font-bold text-text-dim">#{inj.jersey}</span>}
                  <span className="text-label-lg font-semibold text-text-primary">{inj.name}</span>
                  {inj.position && <span className="text-label-xs font-semibold text-text-dim">{inj.position}</span>}
                </div>
                {inj.type && <div className="mt-0.5 text-label-sm text-text-muted">{inj.type}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-label-xs font-bold uppercase ${inj.status.toLowerCase().includes("out") ? "bg-accent-red/10 text-accent-red" : inj.status.toLowerCase().includes("day-to-day") || inj.status.toLowerCase().includes("questionable") ? "bg-accent-amber/10 text-accent-amber" : "bg-surface-hover text-text-muted"}`}>
                {inj.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopPerformers({
  players,
  highlights,
  onPlayerSelect,
}: {
  players: PlayerStatLine[];
  highlights: string[];
  onPlayerSelect?: (player: PlayerStatLine) => void;
}) {
  const topPlayers: { player: PlayerStatLine; stat: string; value: string }[] = [];
  for (const stat of highlights) {
    let best: PlayerStatLine | null = null;
    let bestVal = -Infinity;
    for (const p of players) {
      const raw = p.stats[stat];
      if (raw == null || raw === "-" || raw === "") continue;
      const num = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
      if (!isNaN(num) && num > bestVal) {
        bestVal = num;
        best = p;
      }
    }
    if (best && bestVal > 0) topPlayers.push({ player: best, stat, value: String(best.stats[stat]) });
  }
  if (topPlayers.length === 0) return null;

  return (
    <div className="border-b border-surface-border bg-surface-hover/15 px-4 py-3">
      <div className="mb-2 text-label-xs font-bold uppercase tracking-widest text-text-dim">Top Performers</div>
      <div className="flex gap-2.5 overflow-x-auto">
        {topPlayers.map(({ player, stat, value }) => (
          <button
            key={`${player.name}-${stat}`}
            type="button"
            onClick={onPlayerSelect ? () => onPlayerSelect(player) : undefined}
            className={`flex min-w-[110px] items-center gap-2 rounded-lg border border-surface-border/50 bg-surface-card px-3 py-2 text-left transition-colors ${onPlayerSelect ? "cursor-pointer hover:border-accent-blue/40 hover:bg-surface-hover/30" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-label-md font-semibold text-text-primary">{player.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-black text-accent-green">{value}</span>
                <span className="text-label-xs font-bold uppercase text-text-dim">{stat}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerTable({
  label,
  players,
  columns,
  displayMap,
  highlights,
  sortCol,
  sortAsc,
  onSort,
  onRowClick,
}: {
  label?: string;
  players: PlayerStatLine[];
  columns: string[];
  displayMap: Record<string, string>;
  highlights: string[];
  sortCol: string | null;
  sortAsc: boolean;
  onSort: (col: string) => void;
  onRowClick?: (player: PlayerStatLine) => void;
}) {
  return (
    <div>
      {label && <div className="bg-surface-hover/30 px-4 py-1.5 text-label-xs font-bold uppercase tracking-widest text-text-dim">{label}</div>}
      <table className="w-full text-label-md">
        <thead>
          <tr className="border-b border-surface-border text-label-xs font-bold uppercase tracking-wider text-text-dim">
            <th className="sticky left-0 z-10 bg-surface-card px-3 py-2 text-left">Player</th>
            {columns.map((col) => (
              <th key={col} onClick={() => onSort(col)} className={`cursor-pointer whitespace-nowrap px-2 py-2 text-center transition-colors hover:text-text-secondary ${sortCol === col ? "text-accent-blue" : ""} ${highlights.includes(col) ? "text-text-muted" : ""}`}>
                {displayMap[col] || col}{sortCol === col && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, i) => (
            <tr
              key={`${player.name}-${i}`}
              className={`transition-colors hover:bg-surface-hover/30 ${i < players.length - 1 ? "border-b border-surface-border/50" : ""} ${onRowClick ? "cursor-pointer" : ""}`}
              onClick={onRowClick ? () => onRowClick(player) : undefined}
            >
              <td className="sticky left-0 z-10 bg-surface-card px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {player.jersey && <span className="font-mono text-label-xs font-bold text-text-dim">#{player.jersey}</span>}
                  <span className="truncate font-medium text-text-primary">{player.name}</span>
                  <span className="text-[8px] font-semibold text-text-dim">{player.position}</span>
                </div>
              </td>
              {columns.map((col) => {
                const val = player.stats[col] ?? "-";
                const isHighlight = highlights.includes(col);
                const numVal = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
                const isGood = isHighlight && !isNaN(numVal) && numVal > 0;
                return (
                  <td key={col} className={`whitespace-nowrap px-2 py-2 text-center font-mono ${isGood ? "font-bold text-text-primary" : val === "-" || val === "0" ? "text-text-dim" : "text-text-secondary"}`}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
