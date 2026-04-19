import type { Team } from "./types";
import { LEAGUE_ESPN } from "./league-map";

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

interface ESPNCompetitor {
  team?: {
    abbreviation?: string;
    displayName?: string;
    id?: string;
  };
  score?: string | number | { value?: number; displayValue?: string } | null;
  winner?: boolean;
}

// ESPN's team-schedule endpoint returns `score` as an object
// (`{ value: number, displayValue: string }`) on some sports/seasons and
// as a primitive string/number on others. Coerce safely for both shapes;
// `Number({...})` is NaN, which otherwise collapses every game to 0-0.
function readScore(raw: unknown): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string") {
    if (raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (typeof raw === "object") {
    const obj = raw as { value?: unknown; displayValue?: unknown };
    if (typeof obj.value === "number" && Number.isFinite(obj.value)) return obj.value;
    if (typeof obj.displayValue === "string" && obj.displayValue.trim() !== "") {
      const n = Number(obj.displayValue);
      return Number.isFinite(n) ? n : null;
    }
  }
  return null;
}

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
        (c: ESPNCompetitor) =>
          c.team?.abbreviation?.toLowerCase() === teamName.toLowerCase() ||
          c.team?.displayName?.toLowerCase() === teamName.toLowerCase() ||
          c.team?.id === teamId,
      );
      const them = competitors.find((c: ESPNCompetitor) => c !== us);

      if (!us || !them) continue;

      const ourScore = readScore(us.score);
      const theirScore = readScore(them.score);

      // Prefer ESPN's explicit `winner` boolean (set on completed games).
      // Fall back to score comparison only when both sides have real numeric
      // scores. If we cannot determine W/L with confidence, skip the event —
      // defaulting to "D" paints every unresolved game as a draw.
      let result: "W" | "L" | null = null;
      if (us.winner === true || them.winner === false) {
        result = "W";
      } else if (us.winner === false || them.winner === true) {
        result = "L";
      } else if (ourScore !== null && theirScore !== null && ourScore !== theirScore) {
        result = ourScore > theirScore ? "W" : "L";
      }

      if (result === null) continue;

      const scoreLabel =
        ourScore !== null && theirScore !== null
          ? `${ourScore}-${theirScore}`
          : "";

      results.push({
        result,
        score: scoreLabel,
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
/** @deprecated Import from `@/lib/league-map` instead. Kept as an alias for back-compat. */
export const LEAGUE_ESPN_SLUGS = LEAGUE_ESPN;