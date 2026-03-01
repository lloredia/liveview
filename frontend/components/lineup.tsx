"use client";

import { useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { TeamLogo } from "./team-logo";

interface LineupProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  leagueName: string;
}

interface Player {
  name: string;
  position: string;
  jersey: string;
  status: "active" | "injured" | "doubtful" | "out" | "questionable";
  injuryNote: string;
}

interface TeamRoster {
  teamName: string;
  players: Player[];
  injuries: Player[];
}

interface LineupData {
  home: TeamRoster;
  away: TeamRoster;
}

const LEAGUE_ESPN_MAP: Record<string, { sport: string; slug: string }> = {
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  "Bundesliga": { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  "MLS": { sport: "soccer", slug: "usa.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  "NBA": { sport: "basketball", slug: "nba" },
  "WNBA": { sport: "basketball", slug: "wnba" },
  "NHL": { sport: "hockey", slug: "nhl" },
  "MLB": { sport: "baseball", slug: "mlb" },
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  active: { bg: "bg-emerald-500/10", text: "text-emerald-400" },
  injured: { bg: "bg-red-500/10", text: "text-red-400" },
  out: { bg: "bg-red-500/10", text: "text-red-400" },
  doubtful: { bg: "bg-amber-500/10", text: "text-amber-400" },
  questionable: { bg: "bg-amber-500/10", text: "text-amber-400" },
};

async function findTeamId(
  teamName: string,
  sport: string,
  slug: string,
): Promise<string | null> {
  try {
    const url = `/api/espn/site/${sport}/${slug}/teams?limit=100`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];

    const match = teams.find((t: any) => {
      const team = t.team;
      const name = teamName.toLowerCase();
      return (
        team.displayName?.toLowerCase() === name ||
        team.shortDisplayName?.toLowerCase() === name ||
        team.name?.toLowerCase() === name ||
        name.includes(team.name?.toLowerCase()) ||
        team.displayName?.toLowerCase().includes(name)
      );
    });

    return match?.team?.id || null;
  } catch {
    return null;
  }
}

async function fetchTeamRoster(
  teamName: string,
  sport: string,
  slug: string,
): Promise<TeamRoster> {
  const empty: TeamRoster = { teamName, players: [], injuries: [] };

  const teamId = await findTeamId(teamName, sport, slug);
  if (!teamId) return empty;

  try {
    // Fetch roster
    const rosterUrl = `/api/espn/site/${sport}/${slug}/teams/${teamId}/roster`;
    const rosterRes = await fetch(rosterUrl);

    const players: Player[] = [];
    const injuries: Player[] = [];

    if (rosterRes.ok) {
      const rosterData = await rosterRes.json();
      const athletes = rosterData?.athletes || [];

      for (const group of athletes) {
        for (const athlete of group.items || []) {
          const status = parseInjuryStatus(athlete.status?.type || "");
          const player: Player = {
            name: athlete.displayName || athlete.fullName || "",
            position: athlete.position?.abbreviation || group.position || "",
            jersey: athlete.jersey || "",
            status,
            injuryNote: athlete.injuries?.[0]?.details?.detail || athlete.status?.name || "",
          };

          if (status !== "active") {
            injuries.push(player);
          } else {
            players.push(player);
          }
        }
      }
    }

    return { teamName, players: players.slice(0, 15), injuries };
  } catch {
    return empty;
  }
}

function parseInjuryStatus(statusType: string): Player["status"] {
  const s = statusType.toLowerCase();
  if (s.includes("out") || s === "injured-reserve" || s === "ir") return "out";
  if (s.includes("doubtful")) return "doubtful";
  if (s.includes("questionable") || s.includes("day-to-day") || s === "day-to-day") return "questionable";
  if (s.includes("injured") || s.includes("suspend")) return "injured";
  return "active";
}

async function fetchLineupData(
  homeTeamName: string,
  awayTeamName: string,
  sport: string,
  slug: string,
): Promise<LineupData> {
  const [home, away] = await Promise.all([
    fetchTeamRoster(homeTeamName, sport, slug),
    fetchTeamRoster(awayTeamName, sport, slug),
  ]);
  return { home, away };
}

export function Lineup({
  homeTeamName,
  awayTeamName,
  homeTeamLogo,
  awayTeamLogo,
  leagueName,
}: LineupProps) {
  const mapping = LEAGUE_ESPN_MAP[leagueName];

  const fetcher = useCallback(async (): Promise<LineupData> => {
    if (!mapping) {
      return {
        home: { teamName: homeTeamName, players: [], injuries: [] },
        away: { teamName: awayTeamName, players: [], injuries: [] },
      };
    }
    return fetchLineupData(homeTeamName, awayTeamName, mapping.sport, mapping.slug);
  }, [homeTeamName, awayTeamName, mapping]);

  const { data, loading } = usePolling<LineupData>({
    fetcher,
    interval: 600000,
    enabled: !!mapping,
    key: `lineup-${homeTeamName}-${awayTeamName}`,
  });

  if (!mapping) return null;
  if (loading && !data) return null;
  if (!data) return null;

  const hasInjuries = data.home.injuries.length > 0 || data.away.injuries.length > 0;
  const hasRoster = data.home.players.length > 0 || data.away.players.length > 0;

  if (!hasInjuries && !hasRoster) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Roster & Injuries
        </h4>
      </div>

      {/* Injuries */}
      {hasInjuries && (
        <div className="border-b border-surface-border">
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-red-400">
            🏥 Injury Report
          </div>

          {data.home.injuries.length > 0 && (
            <TeamInjuryList
              teamName={homeTeamName}
              teamLogo={homeTeamLogo}
              injuries={data.home.injuries}
            />
          )}

          {data.away.injuries.length > 0 && (
            <TeamInjuryList
              teamName={awayTeamName}
              teamLogo={awayTeamLogo}
              injuries={data.away.injuries}
            />
          )}
        </div>
      )}

      {/* Key Players */}
      {hasRoster && (
        <div>
          <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-text-tertiary">
            Key Players
          </div>
          <div className="grid grid-cols-2 gap-px bg-surface-border/30">
            <TeamPlayerList
              teamName={homeTeamName}
              teamLogo={homeTeamLogo}
              players={data.home.players}
            />
            <TeamPlayerList
              teamName={awayTeamName}
              teamLogo={awayTeamLogo}
              players={data.away.players}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TeamInjuryList({
  teamName,
  teamLogo,
  injuries,
}: {
  teamName: string;
  teamLogo: string | null;
  injuries: Player[];
}) {
  return (
    <div className="px-4 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
        <TeamLogo url={teamLogo} name={teamName} size={14} />
        {teamName}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {injuries.map((p, i) => {
          const colors = STATUS_COLORS[p.status] || STATUS_COLORS.injured;
          return (
            <span
              key={i}
              title={`${p.name} — ${p.injuryNote}`}
              className={`inline-flex items-center gap-1 rounded-md border border-surface-border px-2 py-1 text-[10px] ${colors.bg}`}
            >
              {p.jersey && (
                <span className="font-mono text-[9px] text-text-muted">#{p.jersey}</span>
              )}
              <span className="font-medium text-text-secondary">{p.name}</span>
              <span className={`font-bold uppercase ${colors.text}`}>{p.status}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function TeamPlayerList({
  teamName,
  teamLogo,
  players,
}: {
  teamName: string;
  teamLogo: string | null;
  players: Player[];
}) {
  return (
    <div className="bg-surface-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-text-secondary">
        <TeamLogo url={teamLogo} name={teamName} size={14} />
        {teamName}
      </div>
      <div className="space-y-0.5">
        {players.slice(0, 8).map((p, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded px-1.5 py-1 text-[10px] transition-colors hover:bg-surface-hover/30"
            style={{ animation: `fadeIn 0.3s ease ${i * 0.04}s both` }}
          >
            {p.jersey && (
              <span className="min-w-[20px] font-mono text-[9px] font-bold text-text-muted">
                #{p.jersey}
              </span>
            )}
            <span className="flex-1 truncate text-text-secondary">{p.name}</span>
            <span className="text-[9px] font-semibold text-text-muted">{p.position}</span>
          </div>
        ))}
      </div>
    </div>
  );
}