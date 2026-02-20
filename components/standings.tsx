"use client";

import { useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { TeamLogo } from "./team-logo";

interface StandingsProps {
  leagueId: string;
  leagueName: string;
  leagueShortName: string;
}

interface StandingsRow {
  position: number;
  teamName: string;
  teamLogo: string | null;
  teamAbbr: string;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  points: number;
}

const ESPN_STANDINGS_MAP: Record<string, { sport: string; league: string }> = {
  "Premier League": { sport: "soccer", league: "eng.1" },
  "La Liga": { sport: "soccer", league: "esp.1" },
  "Bundesliga": { sport: "soccer", league: "ger.1" },
  "Serie A": { sport: "soccer", league: "ita.1" },
  "Ligue 1": { sport: "soccer", league: "fra.1" },
  "MLS": { sport: "soccer", league: "usa.1" },
  "Champions League": { sport: "soccer", league: "uefa.champions" },
  "NBA": { sport: "basketball", league: "nba" },
  "WNBA": { sport: "basketball", league: "wnba" },
  "NCAAM": { sport: "basketball", league: "mens-college-basketball" },
  "NCAAW": { sport: "basketball", league: "womens-college-basketball" },
  "NHL": { sport: "hockey", league: "nhl" },
  "MLB": { sport: "baseball", league: "mlb" },
};

const SOCCER_LEAGUES = new Set([
  "Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "MLS", "Champions League",
]);

async function fetchESPNStandings(shortName: string): Promise<StandingsRow[]> {
  const mapping = ESPN_STANDINGS_MAP[shortName];
  if (!mapping) return [];

  const url =
    mapping.sport === "soccer"
      ? `https://site.api.espn.com/apis/v2/sports/soccer/${mapping.league}/standings`
      : `https://site.api.espn.com/apis/v2/sports/${mapping.sport}/${mapping.league}/standings`;

  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();

  const rows: StandingsRow[] = [];

  // ESPN nests standings under children[] or top-level standings
  const groups = data?.children || [];
  for (const group of groups) {
    const entries = group?.standings?.entries || [];
    for (const entry of entries) {
      rows.push(parseEntry(entry));
    }
  }

  // Fallback: top-level standings
  if (rows.length === 0) {
    const entries = data?.standings?.entries || [];
    for (const entry of entries) {
      rows.push(parseEntry(entry));
    }
  }

  rows.sort((a, b) => b.points - a.points || b.differential - a.differential || b.pointsFor - a.pointsFor);
  rows.forEach((r, i) => (r.position = i + 1));

  return rows;
}

function parseEntry(entry: any): StandingsRow {
  const team = entry.team || {};
  const stats: Record<string, number> = {};
  for (const stat of entry.stats || []) {
    stats[stat.name] = Number(stat.value) || 0;
  }

  return {
    position: 0,
    teamName: team.displayName || team.name || "Unknown",
    teamLogo: team.logos?.[0]?.href || null,
    teamAbbr: team.abbreviation || "",
    gamesPlayed: stats["gamesPlayed"] || stats["GP"] || 0,
    wins: stats["wins"] || stats["W"] || 0,
    draws: stats["ties"] || stats["draws"] || stats["D"] || stats["T"] || 0,
    losses: stats["losses"] || stats["L"] || 0,
    pointsFor: stats["pointsFor"] || stats["PF"] || stats["goalsFor"] || 0,
    pointsAgainst: stats["pointsAgainst"] || stats["PA"] || stats["goalsAgainst"] || 0,
    differential: stats["pointDifferential"] || stats["goalDifference"] || stats["differential"] || 0,
    points: stats["points"] || stats["PTS"] || stats["OVWins"] || 0,
  };
}

export function Standings({ leagueId, leagueName, leagueShortName }: StandingsProps) {
  const fetcher = useCallback(() => fetchESPNStandings(leagueShortName), [leagueShortName]);

  const { data: rows, loading, error } = usePolling<StandingsRow[]>({
    fetcher,
    interval: 300000,
    enabled: !!leagueShortName,
    key: `standings-${leagueShortName}`,
  });

  const isSoccer = SOCCER_LEAGUES.has(leagueShortName);

  if (loading && !rows) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (error || !rows || rows.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
        <div className="mb-2 text-2xl">📊</div>
        <div className="text-[13px] text-text-tertiary">
          Standings not available for this league
        </div>
      </div>
    );
  }

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
              {isSoccer && <th className="w-[36px] px-2 py-2.5 text-center">D</th>}
              <th className="w-[36px] px-2 py-2.5 text-center">L</th>
              <th className="w-[45px] px-2 py-2.5 text-center">{isSoccer ? "GD" : "DIFF"}</th>
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
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold ${
                      row.position <= 4
                        ? "bg-accent-green/10 text-accent-green"
                        : row.position > rows.length - 3
                          ? "bg-accent-red/10 text-accent-red"
                          : "text-text-muted"
                    }`}
                  >
                    {row.position}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <TeamLogo url={row.teamLogo} name={row.teamAbbr} size={20} />
                    <span className="truncate font-medium text-text-primary">{row.teamName}</span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.gamesPlayed}</td>
                <td className="px-2 py-2.5 text-center font-semibold text-text-primary">{row.wins}</td>
                {isSoccer && <td className="px-2 py-2.5 text-center text-text-secondary">{row.draws}</td>}
                <td className="px-2 py-2.5 text-center text-text-secondary">{row.losses}</td>
                <td className="px-2 py-2.5 text-center">
                  <span
                    className={`font-mono text-[11px] font-semibold ${
                      row.differential > 0
                        ? "text-accent-green"
                        : row.differential < 0
                          ? "text-accent-red"
                          : "text-text-muted"
                    }`}
                  >
                    {row.differential > 0 ? "+" : ""}
                    {row.differential}
                  </span>
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