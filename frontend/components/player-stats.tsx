"use client";

import { useCallback, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { TeamLogo } from "./team-logo";

interface PlayerStatsProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  leagueName: string;
}

interface PlayerStatLine {
  name: string;
  jersey: string;
  position: string;
  stats: Record<string, string | number>;
  starter: boolean;
}

interface TeamPlayerStats {
  teamName: string;
  players: PlayerStatLine[];
  statColumns: string[];
}

interface PlayerStatsData {
  home: TeamPlayerStats;
  away: TeamPlayerStats;
  sport: string;
}

const LEAGUE_ESPN_MAP: Record<string, { sport: string; slug: string }> = {
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  NFL: { sport: "football", slug: "nfl" },
};

const STAT_DISPLAY: Record<string, Record<string, string>> = {
  basketball: {
    MIN: "MIN",
    FG: "FG",
    "3PT": "3PT",
    FT: "FT",
    OREB: "OR",
    DREB: "DR",
    REB: "REB",
    AST: "AST",
    STL: "STL",
    BLK: "BLK",
    TO: "TO",
    PF: "PF",
    PTS: "PTS",
  },
  soccer: {
    SH: "SH",
    ST: "ST",
    G: "G",
    A: "A",
    OF: "OF",
    FD: "FD",
    FC: "FC",
    SV: "SV",
    YC: "YC",
    RC: "RC",
  },
  hockey: {
    G: "G",
    A: "A",
    PTS: "PTS",
    "+/-": "+/-",
    PIM: "PIM",
    SOG: "SOG",
    HIT: "HIT",
    BLK: "BLK",
    FW: "FW",
    FL: "FL",
    TOI: "TOI",
  },
  baseball: {
    AB: "AB",
    R: "R",
    H: "H",
    HR: "HR",
    RBI: "RBI",
    BB: "BB",
    SO: "SO",
    AVG: "AVG",
    OBP: "OBP",
    SLG: "SLG",
  },
  football: {
    "C/ATT": "C/ATT",
    YDS: "YDS",
    TD: "TD",
    INT: "INT",
    CAR: "CAR",
    REC: "REC",
    TGTS: "TGTS",
    SACK: "SACK",
    TFL: "TFL",
  },
};

const HIGHLIGHT_STATS: Record<string, string[]> = {
  basketball: ["PTS", "REB", "AST"],
  soccer: ["G", "A", "SH"],
  hockey: ["G", "A", "PTS"],
  baseball: ["H", "RBI", "HR"],
  football: ["YDS", "TD", "REC"],
};

async function findEspnEventId(
  homeTeamName: string,
  awayTeamName: string,
  sport: string,
  slug: string,
): Promise<string | null> {
  try {
    const prefix = sport === "soccer" ? `soccer/${slug}` : `${sport}/${slug}`;
    const url = `https://site.api.espn.com/apis/site/v2/sports/${prefix}/scoreboard`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const events: any[] = data.events || [];

    const normalize = (s: string) =>
      s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const homeLower = normalize(homeTeamName);
    const awayLower = normalize(awayTeamName);

    for (const evt of events) {
      const comp = evt.competitions?.[0];
      if (!comp) continue;

      const competitors = comp.competitors || [];
      const names = competitors.map((c: any) =>
        normalize(c.team?.displayName || c.team?.name || ""),
      );
      const shortNames = competitors.map((c: any) =>
        normalize(c.team?.shortDisplayName || c.team?.name || ""),
      );

      const matchesHome =
        names.some((n: string) => n.includes(homeLower) || homeLower.includes(n)) ||
        shortNames.some((n: string) => n.includes(homeLower) || homeLower.includes(n));
      const matchesAway =
        names.some((n: string) => n.includes(awayLower) || awayLower.includes(n)) ||
        shortNames.some((n: string) => n.includes(awayLower) || awayLower.includes(n));

      if (matchesHome && matchesAway) {
        return evt.id;
      }
    }

    return null;
  } catch {
    return null;
  }
}

function extractPlayerStats(
  competitor: any,
  sport: string,
): { players: PlayerStatLine[]; statColumns: string[] } {
  const players: PlayerStatLine[] = [];
  const statColumns: string[] = [];

  const statGroups = competitor.statistics || [];

  if (statGroups.length === 0) {
    return { players, statColumns };
  }

  const primaryGroup = statGroups[0];
  const labels: string[] = primaryGroup.labels || [];
  const athletes: any[] = primaryGroup.athletes || [];

  for (const label of labels) {
    if (!statColumns.includes(label)) {
      statColumns.push(label);
    }
  }

  for (const athlete of athletes) {
    const ath = athlete.athlete || {};
    const statsArr: string[] = athlete.stats || [];
    const statsMap: Record<string, string | number> = {};

    labels.forEach((label: string, idx: number) => {
      statsMap[label] = statsArr[idx] ?? "-";
    });

    players.push({
      name: ath.displayName || ath.shortName || "Unknown",
      jersey: ath.jersey || "",
      position: ath.position?.abbreviation || "",
      stats: statsMap,
      starter: athlete.starter ?? false,
    });
  }

  if (statGroups.length > 1) {
    for (let i = 1; i < statGroups.length; i++) {
      const group = statGroups[i];
      const groupLabels: string[] = group.labels || [];
      const groupAthletes: any[] = group.athletes || [];

      for (const label of groupLabels) {
        if (!statColumns.includes(label)) {
          statColumns.push(label);
        }
      }

      for (const athlete of groupAthletes) {
        const ath = athlete.athlete || {};
        const name = ath.displayName || ath.shortName || "Unknown";
        const existing = players.find((p) => p.name === name);
        const statsArr: string[] = athlete.stats || [];

        if (existing) {
          groupLabels.forEach((label: string, idx: number) => {
            existing.stats[label] = statsArr[idx] ?? "-";
          });
        } else {
          const statsMap: Record<string, string | number> = {};
          groupLabels.forEach((label: string, idx: number) => {
            statsMap[label] = statsArr[idx] ?? "-";
          });

          players.push({
            name,
            jersey: ath.jersey || "",
            position: ath.position?.abbreviation || "",
            stats: statsMap,
            starter: athlete.starter ?? false,
          });
        }
      }
    }
  }

  return { players, statColumns };
}

async function fetchPlayerStatsData(
  homeTeamName: string,
  awayTeamName: string,
  sport: string,
  slug: string,
): Promise<PlayerStatsData | null> {
  const eventId = await findEspnEventId(homeTeamName, awayTeamName, sport, slug);
  if (!eventId) return null;

  try {
    const prefix = sport === "soccer" ? `soccer/${slug}` : `${sport}/${slug}`;
    const url = `https://site.api.espn.com/apis/site/v2/sports/${prefix}/summary?event=${eventId}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const boxscore = data.boxscore;
    if (!boxscore) return null;

    const players = boxscore.players || [];
    if (players.length < 2) return null;

    const homeComp = players.find((p: any) => p.team?.id && p.homeAway === "home") || players[0];
    const awayComp = players.find((p: any) => p.team?.id && p.homeAway === "away") || players[1];

    const homeExtracted = extractPlayerStats(homeComp, sport);
    const awayExtracted = extractPlayerStats(awayComp, sport);

    if (homeExtracted.players.length === 0 && awayExtracted.players.length === 0) {
      return null;
    }

    const allColumns = [...new Set([...homeExtracted.statColumns, ...awayExtracted.statColumns])];

    return {
      home: {
        teamName: homeComp.team?.displayName || homeTeamName,
        players: homeExtracted.players,
        statColumns: allColumns,
      },
      away: {
        teamName: awayComp.team?.displayName || awayTeamName,
        players: awayExtracted.players,
        statColumns: allColumns,
      },
      sport,
    };
  } catch {
    return null;
  }
}

export function PlayerStats({
  homeTeamName,
  awayTeamName,
  homeTeamLogo,
  awayTeamLogo,
  leagueName,
}: PlayerStatsProps) {
  const mapping = LEAGUE_ESPN_MAP[leagueName];
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  const fetcher = useCallback(async (): Promise<PlayerStatsData | null> => {
    if (!mapping) return null;
    return fetchPlayerStatsData(homeTeamName, awayTeamName, mapping.sport, mapping.slug);
  }, [homeTeamName, awayTeamName, mapping]);

  const { data, loading } = usePolling<PlayerStatsData | null>({
    fetcher,
    interval: 60000,
    enabled: !!mapping,
    key: `pstats-${homeTeamName}-${awayTeamName}`,
  });

  if (!mapping) return null;
  if (loading && !data) return null;
  if (!data) return null;

  const teamData = activeSide === "home" ? data.home : data.away;
  const teamLogo = activeSide === "home" ? homeTeamLogo : awayTeamLogo;
  const highlights = HIGHLIGHT_STATS[data.sport] || [];

  const displayMap = STAT_DISPLAY[data.sport] || {};
  const visibleColumns = teamData.statColumns.filter(
    (col) => Object.keys(displayMap).length === 0 || displayMap[col],
  );

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortAsc(!sortAsc);
    } else {
      setSortCol(col);
      setSortAsc(false);
    }
  };

  const sortedPlayers = [...teamData.players];
  if (sortCol) {
    sortedPlayers.sort((a, b) => {
      const aVal = a.stats[sortCol] ?? "";
      const bVal = b.stats[sortCol] ?? "";
      const aNum = parseFloat(String(aVal).replace(/[^0-9.\-]/g, ""));
      const bNum = parseFloat(String(bVal).replace(/[^0-9.\-]/g, ""));

      if (!isNaN(aNum) && !isNaN(bNum)) {
        return sortAsc ? aNum - bNum : bNum - aNum;
      }
      return sortAsc
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
  } else {
    sortedPlayers.sort((a, b) => {
      if (a.starter && !b.starter) return -1;
      if (!a.starter && b.starter) return 1;
      return 0;
    });
  }

  const starters = sortedPlayers.filter((p) => p.starter);
  const bench = sortedPlayers.filter((p) => !p.starter);

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Player Statistics
        </h4>
      </div>

      {/* Team toggle */}
      <div className="flex border-b border-surface-border">
        <button
          onClick={() => { setActiveSide("home"); setSortCol(null); }}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-semibold transition-all ${
            activeSide === "home"
              ? "border-b-2 border-accent-blue bg-accent-blue/5 text-accent-blue"
              : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"
          }`}
        >
          <TeamLogo url={homeTeamLogo} name={homeTeamName} size={16} />
          <span className="truncate">{homeTeamName}</span>
        </button>
        <div className="w-px bg-surface-border" />
        <button
          onClick={() => { setActiveSide("away"); setSortCol(null); }}
          className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-semibold transition-all ${
            activeSide === "away"
              ? "border-b-2 border-accent-red bg-accent-red/5 text-accent-red"
              : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"
          }`}
        >
          <TeamLogo url={awayTeamLogo} name={awayTeamName} size={16} />
          <span className="truncate">{awayTeamName}</span>
        </button>
      </div>

      {/* Top performers summary */}
      {highlights.length > 0 && (
        <TopPerformers
          players={teamData.players}
          highlights={highlights}
          teamLogo={teamLogo}
          sport={data.sport}
        />
      )}

      {/* Stats table */}
      {teamData.players.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-text-muted">
          Player statistics not yet available
        </div>
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
            />
          )}
        </div>
      )}
    </div>
  );
}

function TopPerformers({
  players,
  highlights,
  teamLogo,
  sport,
}: {
  players: PlayerStatLine[];
  highlights: string[];
  teamLogo: string | null;
  sport: string;
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

    if (best && bestVal > 0) {
      topPlayers.push({
        player: best,
        stat,
        value: String(best.stats[stat]),
      });
    }
  }

  if (topPlayers.length === 0) return null;

  return (
    <div className="border-b border-surface-border bg-surface-hover/20 px-4 py-3">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-text-dim">
        Top Performers
      </div>
      <div className="flex gap-3 overflow-x-auto">
        {topPlayers.map(({ player, stat, value }) => (
          <div
            key={`${player.name}-${stat}`}
            className="flex min-w-[120px] items-center gap-2.5 rounded-lg border border-surface-border/50 bg-surface-card px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-text-primary">
                {player.name}
              </div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-black text-accent-green">
                  {value}
                </span>
                <span className="text-[9px] font-bold uppercase text-text-dim">
                  {stat}
                </span>
              </div>
            </div>
          </div>
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
}: {
  label?: string;
  players: PlayerStatLine[];
  columns: string[];
  displayMap: Record<string, string>;
  highlights: string[];
  sortCol: string | null;
  sortAsc: boolean;
  onSort: (col: string) => void;
}) {
  return (
    <div>
      {label && (
        <div className="bg-surface-hover/30 px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-text-dim">
          {label}
        </div>
      )}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-surface-border text-[9px] font-bold uppercase tracking-wider text-text-dim">
            <th className="sticky left-0 z-10 bg-surface-card px-3 py-2 text-left">Player</th>
            {columns.map((col) => (
              <th
                key={col}
                onClick={() => onSort(col)}
                className={`cursor-pointer whitespace-nowrap px-2 py-2 text-center transition-colors hover:text-text-secondary ${
                  sortCol === col ? "text-accent-blue" : ""
                } ${highlights.includes(col) ? "text-text-muted" : ""}`}
              >
                {displayMap[col] || col}
                {sortCol === col && (
                  <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, i) => (
            <tr
              key={`${player.name}-${i}`}
              className={`transition-colors hover:bg-surface-hover/30 ${
                i < players.length - 1 ? "border-b border-surface-border/50" : ""
              }`}
              style={{ animation: `fadeIn 0.2s ease ${i * 0.03}s both` }}
            >
              <td className="sticky left-0 z-10 bg-surface-card px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {player.jersey && (
                    <span className="font-mono text-[9px] font-bold text-text-dim">
                      #{player.jersey}
                    </span>
                  )}
                  <span className="truncate font-medium text-text-primary">
                    {player.name}
                  </span>
                  <span className="text-[8px] font-semibold text-text-dim">
                    {player.position}
                  </span>
                </div>
              </td>
              {columns.map((col) => {
                const val = player.stats[col] ?? "-";
                const isHighlight = highlights.includes(col);
                const numVal = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
                const isGood = isHighlight && !isNaN(numVal) && numVal > 0;

                return (
                  <td
                    key={col}
                    className={`whitespace-nowrap px-2 py-2 text-center font-mono ${
                      isGood
                        ? "font-bold text-text-primary"
                        : val === "-" || val === "0"
                          ? "text-text-dim"
                          : "text-text-secondary"
                    }`}
                  >
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
