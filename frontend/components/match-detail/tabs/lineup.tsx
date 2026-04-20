"use client";

import {
  getCardFlags,
  hasScored,
  startersByFormationRows,
} from "../helpers";
import type {
  MatchCenterLineupSection,
  PlayerStatLine,
} from "../types";

interface LineupTabProps {
  section: MatchCenterLineupSection | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  phase?: string;
  onPlayerClick?: (
    player: PlayerStatLine,
    teamName: string,
    teamLogo: string | null,
    side: "home" | "away",
  ) => void;
}

export function LineupTab({
  section,
  loading,
  homeTeamLogo,
  awayTeamLogo,
  homeTeamName,
  awayTeamName,
  phase,
  onPlayerClick,
}: LineupTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex border-b border-surface-border">
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
          <div className="w-px bg-surface-border" />
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
        </div>
        <div className="h-64 bg-pitch/20" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="flex-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  const fdLineup = section?.fallback ?? null;
  const hasFdLineup = !!(fdLineup?.source && (fdLineup.home?.lineup?.length || fdLineup.away?.lineup?.length));
  const homeStarters = section?.homeStarters ?? [];
  const awayStarters = section?.awayStarters ?? [];
  const homeBench = section?.homeBench ?? [];
  const awayBench = section?.awayBench ?? [];
  const hasPrimaryLineup = !!(
    homeStarters.length ||
    awayStarters.length ||
    section?.homeFormation ||
    section?.awayFormation
  );

  if (!hasPrimaryLineup) {
    if (hasFdLineup && fdLineup) {
      const home = fdLineup.home ?? { formation: null, lineup: [], bench: [] };
      const away = fdLineup.away ?? { formation: null, lineup: [], bench: [] };
      return (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-3 py-2 text-label-md text-text-muted">
            Data by {fdLineup.source === "football_data" ? "Football-Data.org" : fdLineup.source}
          </div>
          <div className="relative bg-pitch text-white" style={{ minHeight: 280 }}>
            <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
            <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
            <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
              {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
              {home.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{home.formation}</span>}
            </div>
            <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-center gap-1 px-3">
              {home.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-label-lg">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-label-sm">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-label-sm opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-center gap-1 px-3">
              {away.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-label-lg">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-label-sm">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-label-sm opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
              {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
              {away.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{away.formation}</span>}
            </div>
          </div>
          {(home.bench?.length > 0 || away.bench?.length > 0) && (
            <div className="border-t border-surface-border bg-surface-card px-4 py-3">
              <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Bench</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-label-lg">
                <div>
                  {home.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-label-sm text-text-muted">{p.shirt_number}</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
                <div>
                  {away.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-label-sm text-text-muted">{p.shirt_number}</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">XI</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">Lineup Unavailable</div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Lineups are typically announced ~1 hour before kickoff"
            : "Lineup data was not available for this match"}
        </div>
      </div>
    );
  }

  const homeRows = startersByFormationRows(homeStarters, section?.homeFormation ?? undefined);
  const awayRows = startersByFormationRows(awayStarters, section?.awayFormation ?? undefined);
  const subs = section?.substitutions ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="relative bg-pitch text-white" style={{ minHeight: 320 }}>
        <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
        <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
        <div className="absolute left-1/2 top-0 h-12 w-24 -translate-x-1/2 rounded-b-[2rem] border-2 border-b-0 border-white/50" />
        <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-t-[2rem] border-2 border-t-0 border-white/50" />

        <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
          {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
          {section?.homeFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{section.homeFormation}</span>
          )}
        </div>

        <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-around px-2">
          {homeRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-around gap-1">
              {row.map((p, i) => (
                <LineupPlayerBadge
                  key={p.name ?? i}
                  player={p}
                  onClick={onPlayerClick ? () => onPlayerClick(p, homeTeamName, homeTeamLogo, "home") : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-around px-2">
          {awayRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-around gap-1">
              {row.map((p, i) => (
                <LineupPlayerBadge
                  key={p.name ?? i}
                  player={p}
                  onClick={onPlayerClick ? () => onPlayerClick(p, awayTeamName, awayTeamLogo, "away") : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
          {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
          {section?.awayFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{section.awayFormation}</span>
          )}
        </div>
      </div>

      {subs.length > 0 && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Substitutions</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {subs.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-label-lg">
                <span className="shrink-0 font-mono text-text-dim">{s.minute}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-red/90 text-[8px] text-white">-</span>
                    <span className="truncate text-text-primary">{s.playerOff}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-green/90 text-[8px] text-white">+</span>
                    <span className="truncate text-text-secondary">{s.playerOn}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(homeBench.length > 0 || awayBench.length > 0) && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Substitute Players</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="space-y-1.5">
              {homeBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-label-lg">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-label-sm font-bold text-text-secondary">
                    {p.jersey || "--"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "--"}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {awayBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-label-lg">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-label-sm font-bold text-text-secondary">
                    {p.jersey || "--"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "--"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineupPlayerBadge({
  player,
  onClick,
}: {
  player: PlayerStatLine;
  onClick?: () => void;
}) {
  const cards = getCardFlags(player);
  const scored = hasScored(player);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center ${onClick ? "cursor-pointer transition-transform hover:scale-105 active:scale-95" : ""}`}
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-pitch-accent font-mono text-body-sm font-bold text-white shadow">
        {player.jersey || "—"}
        {scored && <span className="absolute -right-0.5 -top-0.5 text-label-sm">⚽</span>}
        {cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-accent-red" title="Red card" />}
        {cards.yellow && !cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-accent-amber" title="Yellow card" />}
      </div>
      <span className="mt-0.5 max-w-[72px] truncate text-center text-label-sm font-medium text-white/95">{player.name ?? "—"}</span>
    </button>
  );
}
