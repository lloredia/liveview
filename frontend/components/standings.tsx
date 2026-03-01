"use client";

import { useCallback, useMemo, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { TeamLogo } from "./team-logo";
import { KnockoutBracket } from "./knockout-bracket";
import {
  getCompetitionMeta,
  isSoccerCompetition,
  fetchSoccerStandings,
  fetchOtherStandings,
  fetchKnockoutBracket,
  OTHER_STANDINGS_MAP,
} from "@/lib/espn-standings";
import type {
  CompetitionType,
  StandingsRow,
  StandingsGroup,
  StandingsResult,
  KnockoutBracket as KnockoutBracketData,
} from "@/lib/types";

// ── Props ───────────────────────────────────────────────────────────

interface StandingsProps {
  leagueId: string;
  leagueName: string;
  leagueShortName: string;
}

// ── Sub-tab types ───────────────────────────────────────────────────

type StandingsMode = "table" | "knockout";

// ── Main component ──────────────────────────────────────────────────

export function Standings({ leagueId, leagueName, leagueShortName }: StandingsProps) {
  const soccer = isSoccerCompetition(leagueShortName);
  const meta = getCompetitionMeta(leagueShortName);
  const compType: CompetitionType = meta?.type ?? "league";

  const showKnockout = compType === "cup" || compType === "hybrid";
  const showTable = compType !== "cup";
  const defaultMode: StandingsMode = compType === "cup" ? "knockout" : "table";

  const [mode, setMode] = useState<StandingsMode>(defaultMode);
  const [selectedGroup, setSelectedGroup] = useState(0);

  // Reset mode when league changes
  useMemo(() => {
    setMode(compType === "cup" ? "knockout" : "table");
    setSelectedGroup(0);
  }, [leagueShortName, compType]);

  // ── Soccer standings (table data) ─────────────────────────────────

  const tableFetcher = useCallback(() => {
    if (!soccer || !meta) return Promise.resolve(null);
    return fetchSoccerStandings(meta.espnLeague);
  }, [soccer, meta]);

  const { data: tableData, loading: tableLoading } = usePolling<StandingsResult | null>({
    fetcher: tableFetcher,
    interval: 120_000,
    enabled: soccer && showTable,
    key: `standings-table-${leagueShortName}`,
  });

  // ── Soccer knockout (bracket data) ────────────────────────────────

  const bracketFetcher = useCallback(() => {
    if (!soccer || !meta) return Promise.resolve(null);
    return fetchKnockoutBracket(meta.espnLeague, leagueShortName);
  }, [soccer, meta, leagueShortName]);

  const { data: bracketData, loading: bracketLoading } = usePolling<KnockoutBracketData | null>({
    fetcher: bracketFetcher,
    interval: 300_000,
    enabled: soccer && showKnockout,
    key: `standings-bracket-${leagueShortName}`,
  });

  // ── Non-soccer standings (legacy path) ────────────────────────────

  const otherMapping = OTHER_STANDINGS_MAP[leagueShortName];

  const otherFetcher = useCallback(() => {
    if (!otherMapping) return Promise.resolve([]);
    return fetchOtherStandings(otherMapping.sport, otherMapping.league);
  }, [otherMapping]);

  const { data: otherRows, loading: otherLoading } = usePolling<StandingsRow[]>({
    fetcher: otherFetcher,
    interval: 300_000,
    enabled: !soccer && !!otherMapping,
    key: `standings-other-${leagueShortName}`,
  });

  // ── Non-soccer path ───────────────────────────────────────────────

  if (!soccer) {
    if (otherMapping) {
      return (
        <OtherSportsStandings
          rows={otherRows ?? []}
          loading={otherLoading}
          leagueShortName={leagueShortName}
        />
      );
    }
    return <EmptyState />;
  }

  // ── Soccer path ───────────────────────────────────────────────────

  const groups = tableData?.groups ?? [];
  const currentGroup = groups[selectedGroup] ?? null;

  return (
    <div className="animate-fade-in space-y-3">
      {/* Mode tabs (Table / Knockout) if hybrid or cup */}
      {(showTable && showKnockout) && (
        <div className="flex gap-1 rounded-lg bg-surface-hover/40 p-1">
          {showTable && (
            <ModeButton active={mode === "table"} onClick={() => setMode("table")}>
              Table
            </ModeButton>
          )}
          {showKnockout && (
            <ModeButton active={mode === "knockout"} onClick={() => setMode("knockout")}>
              Knockout
            </ModeButton>
          )}
        </div>
      )}

      {/* Pure cup: only knockout, no table tabs */}
      {compType === "cup" && !showTable && null}

      {/* ── TABLE MODE ─────────────────────────────────────────────── */}
      {mode === "table" && showTable && (
        <>
          {tableLoading && !tableData ? (
            <LoadingSpinner />
          ) : groups.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Group selector pills */}
              {groups.length > 1 && (
                <div className="flex flex-wrap gap-1.5">
                  {groups.map((g, i) => (
                    <button
                      key={g.name}
                      onClick={() => setSelectedGroup(i)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
                        selectedGroup === i
                          ? "bg-accent-green text-white"
                          : "bg-surface-hover text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              )}

              {currentGroup && (
                <SoccerTable
                  rows={currentGroup.rows}
                  groupName={groups.length > 1 ? currentGroup.name : undefined}
                />
              )}
            </>
          )}

          {/* Debug indicator (dev only) */}
          {process.env.NODE_ENV === "development" && tableData && (
            <DebugFooter
              provider="ESPN"
              competitionType={compType}
              fetchedAt={tableData.fetchedAt}
            />
          )}
        </>
      )}

      {/* ── KNOCKOUT MODE ──────────────────────────────────────────── */}
      {mode === "knockout" && showKnockout && (
        <>
          {bracketLoading && !bracketData ? (
            <LoadingSpinner />
          ) : !bracketData || bracketData.rounds.length === 0 ? (
            <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
              <div className="mb-2 text-2xl">&#127942;</div>
              <div className="text-[13px] text-text-tertiary">
                Knockout bracket not available yet
              </div>
              <div className="mt-1 text-[11px] text-text-muted">
                Bracket data will appear once knockout rounds are scheduled
              </div>
            </div>
          ) : (
            <KnockoutBracket bracket={bracketData} leagueName={leagueShortName} />
          )}

          {process.env.NODE_ENV === "development" && bracketData && (
            <DebugFooter
              provider="ESPN"
              competitionType={compType}
              fetchedAt={bracketData.fetchedAt}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Soccer standings table ──────────────────────────────────────────

function SoccerTable({ rows, groupName }: { rows: StandingsRow[]; groupName?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          {groupName ?? "Standings"}
        </h3>
        <span className="text-[10px] text-text-muted">{rows.length} teams</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-surface-border text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <th className="w-[40px] px-3 py-2.5 text-center">#</th>
              <th className="min-w-[160px] px-3 py-2.5">Team</th>
              <th className="w-[40px] px-2 py-2.5 text-center">Pld</th>
              <th className="w-[36px] px-2 py-2.5 text-center">W</th>
              <th className="w-[36px] px-2 py-2.5 text-center">D</th>
              <th className="w-[36px] px-2 py-2.5 text-center">L</th>
              <th className="w-[36px] px-2 py-2.5 text-center">GF</th>
              <th className="w-[36px] px-2 py-2.5 text-center">GA</th>
              <th className="w-[45px] px-2 py-2.5 text-center">GD</th>
              <th className="w-[48px] px-2 py-2.5 text-center font-extrabold">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.teamAbbr}-${i}`}
                className="border-b border-surface-border/50 transition-colors hover:bg-surface-hover/30"
              >
                <td className="px-3 py-2.5 text-center">
                  <PositionBadge position={row.position} total={rows.length} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <TeamLogo url={row.teamLogo} name={row.teamAbbr} size={20} />
                    <span className="truncate font-medium text-text-primary">
                      {row.teamName}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.gamesPlayed}</td>
                <td className="px-2 py-2.5 text-center font-semibold text-text-primary">{row.wins}</td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.draws}</td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.losses}</td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.goalsFor}</td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.goalsAgainst}</td>
                <td className="px-2 py-2.5 text-center">
                  <DiffBadge value={row.goalDifference} />
                </td>
                <td className="px-2 py-2.5 text-center font-mono text-sm font-extrabold text-text-primary">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Non-soccer standings table (legacy) ─────────────────────────────

function OtherSportsStandings({
  rows,
  loading,
  leagueShortName,
}: {
  rows: StandingsRow[];
  loading: boolean;
  leagueShortName: string;
}) {
  if (loading && rows.length === 0) return <LoadingSpinner />;
  if (rows.length === 0) return <EmptyState />;

  return (
    <div className="animate-fade-in overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <h3 className="text-[12px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Standings
        </h3>
        <span className="text-[10px] text-text-muted">{rows.length} teams</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-surface-border text-[10px] font-bold uppercase tracking-wider text-text-muted">
              <th className="w-[40px] px-3 py-2.5 text-center">#</th>
              <th className="min-w-[160px] px-3 py-2.5">Team</th>
              <th className="w-[40px] px-2 py-2.5 text-center">GP</th>
              <th className="w-[36px] px-2 py-2.5 text-center">W</th>
              <th className="w-[36px] px-2 py-2.5 text-center">L</th>
              <th className="w-[45px] px-2 py-2.5 text-center">DIFF</th>
              <th className="w-[48px] px-2 py-2.5 text-center font-extrabold">PTS</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={`${row.teamAbbr}-${i}`}
                className="border-b border-surface-border/50 transition-colors hover:bg-surface-hover/30"
              >
                <td className="px-3 py-2.5 text-center">
                  <PositionBadge position={row.position} total={rows.length} />
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <TeamLogo url={row.teamLogo} name={row.teamAbbr} size={20} />
                    <span className="truncate font-medium text-text-primary">
                      {row.teamName}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.gamesPlayed}</td>
                <td className="px-2 py-2.5 text-center font-semibold text-text-primary">{row.wins}</td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.losses}</td>
                <td className="px-2 py-2.5 text-center">
                  <DiffBadge value={row.goalDifference} />
                </td>
                <td className="px-2 py-2.5 text-center font-mono text-sm font-extrabold text-text-primary">
                  {row.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Shared UI pieces ────────────────────────────────────────────────

function ModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider transition-all ${
        active
          ? "bg-surface-card text-text-primary shadow-sm"
          : "text-text-muted hover:text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

function PositionBadge({ position, total }: { position: number; total: number }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
        position <= 4
          ? "bg-accent-green/10 text-accent-green"
          : position > total - 3
            ? "bg-accent-red/10 text-accent-red"
            : "text-text-muted"
      }`}
    >
      {position}
    </span>
  );
}

function DiffBadge({ value }: { value: number }) {
  return (
    <span
      className={`font-mono text-[11px] font-semibold ${
        value > 0
          ? "text-accent-green"
          : value < 0
            ? "text-accent-red"
            : "text-text-muted"
      }`}
    >
      {value > 0 ? "+" : ""}
      {value}
    </span>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
      <div className="mb-2 text-2xl">&#128202;</div>
      <div className="text-[13px] text-text-tertiary">
        Standings not available for this league
      </div>
    </div>
  );
}

function DebugFooter({
  provider,
  competitionType,
  fetchedAt,
}: {
  provider: string;
  competitionType: CompetitionType;
  fetchedAt: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 rounded border border-dashed border-surface-border/60 px-3 py-1.5 text-[10px] text-text-muted">
      <button onClick={() => setOpen(!open)} className="font-mono hover:text-text-secondary">
        [debug] {open ? "hide" : "show"}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 font-mono">
          <div>Provider: {provider}</div>
          <div>Type: {competitionType}</div>
          <div>Fetched: {new Date(fetchedAt).toLocaleTimeString()}</div>
        </div>
      )}
    </div>
  );
}
