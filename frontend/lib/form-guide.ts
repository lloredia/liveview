import type { Team } from "./types";

export interface FormResult {
  result: "W" | "L" | "D";
  score: string;
  opponent: string;
  date: string;
}

export interface TeamForm {
  teamName: string;
  results: FormResult[];
}

const ESPN_TEAM_SCHEDULE_MAP: Record<string, string> = {
  soccer: "soccer",
  baseball: "baseball",
  basketball: "basketball",
  hockey: "hockey",
};

/**
 * Fetch a team's recent results from ESPN to build a form guide.
 * Returns last 5 completed matches as W/L/D results.
 */
export async function fetchTeamForm(
  teamId: string,
  teamName: string,
  sport: string,
  leagueSlug: string,
): Promise<TeamForm> {
  try {
    const espnSport = ESPN_TEAM_SCHEDULE_MAP[sport] || sport;
    const url = `/api/espn/site/${espnSport}/${leagueSlug}/teams/${teamId}/schedule`;
    const res = await fetch(url);
    if (!res.ok) return { teamName, results: [] };

    const data = await res.json();
    const events = data?.events || [];

    const results: FormResult[] = [];

    for (const event of events) {
      if (results.length >= 5) break;

      const competition = event.competitions?.[0];
      if (!competition) continue;

      const status = competition.status?.type?.name;
      if (status !== "STATUS_FINAL") continue;

      const competitors = competition.competitors || [];
      const us = competitors.find(
        (c: any) => c.team?.abbreviation?.toLowerCase() === teamName.toLowerCase() ||
          c.team?.displayName?.toLowerCase() === teamName.toLowerCase() ||
          c.team?.id === teamId,
      );
      const them = competitors.find((c: any) => c !== us);

      if (!us || !them) continue;

      const ourScore = Number(us.score) || 0;
      const theirScore = Number(them.score) || 0;
      const winner = us.winner;

      let result: "W" | "L" | "D";
      if (ourScore === theirScore) {
        result = "D";
      } else if (winner === true) {
        result = "W";
      } else {
        result = "L";
      }

      results.push({
        result,
        score: `${ourScore}-${theirScore}`,
        opponent: them.team?.abbreviation || them.team?.displayName || "???",
        date: event.date || "",
      });
    }

    return { teamName, results: results.reverse() };
  } catch {
    return { teamName, results: [] };
  }
}

/**
 * Maps our league names to ESPN API slugs for team schedule lookups.
 */
export const LEAGUE_ESPN_SLUGS: Record<string, { sport: string; slug: string }> = {
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