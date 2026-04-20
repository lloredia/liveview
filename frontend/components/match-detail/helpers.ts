import { LEAGUE_ESPN } from "@/lib/league-map";
import type { MatchEvent, MatchStatsResponse } from "@/lib/types";
import type { ESPNPlay, ESPNTeamStat, PlayerStatLine, Tab } from "./types";

export const TAB_LABELS: Record<Tab, string> = {
  play_by_play: "Play-by-Play",
  player_stats: "Player Stats",
  lineup: "Lineup",
  team_stats: "Team Stats",
};

/** Convert backend timeline events to ESPN-style plays for the Play-by-Play tab. */
export function backendEventsToPlays(events: MatchEvent[]): ESPNPlay[] {
  const periodLabel = (p: string | null) =>
    p === "1" ? "1st" : p === "2" ? "2nd" : p || "1";
  return events.map((e, i) => ({
    id: e.id,
    text: e.detail || e.event_type || "—",
    homeScore: e.score_home ?? 0,
    awayScore: e.score_away ?? 0,
    period: {
      number:
        typeof e.period === "string"
          ? e.period === "HT"
            ? 1
            : parseInt(e.period, 10) || 1
          : e.period ?? 1,
      displayValue: periodLabel(e.period),
    },
    clock: {
      displayValue:
        e.minute != null
          ? e.second != null
            ? `${e.minute}'${String(e.second).padStart(2, "0")}`
            : `${e.minute}'`
          : "—",
    },
    scoringPlay: /goal|score|gól/i.test(e.event_type || ""),
    scoreValue: 0,
    team: undefined,
    participants: e.player_name
      ? [{ athlete: { displayName: e.player_name } }]
      : [],
    type: { id: "", text: e.event_type || "" },
  }));
}

export function formatBackendStatLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function backendStatsToDisplay(
  statsData: MatchStatsResponse | null,
): { homeStats: ESPNTeamStat[]; awayStats: ESPNTeamStat[] } | null {
  if (!statsData?.teams?.length) return null;

  const convert = (side: "home" | "away") => {
    const team = statsData.teams.find((entry) => entry.side === side);
    if (!team?.stats) return [];
    return Object.entries(team.stats)
      .filter(([, value]) => value != null && typeof value !== "object")
      .map(([name, value]) => ({
        name,
        displayValue: String(value),
        label: formatBackendStatLabel(name),
      }));
  };

  return {
    homeStats: convert("home"),
    awayStats: convert("away"),
  };
}

/** Resolve league name to ESPN mapping (exact or fuzzy, e.g. "Major League Soccer" -> MLS). */
export function getLeagueMapping(
  leagueName: string,
): { sport: string; slug: string } | null {
  if (!leagueName) return null;
  const mapping = LEAGUE_ESPN[leagueName];
  if (mapping) return mapping;
  const n = leagueName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(LEAGUE_ESPN)) {
    const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n === kNorm || n.includes(kNorm) || kNorm.includes(n)) return v;
  }
  return null;
}

export const STAT_DISPLAY: Record<string, Record<string, string>> = {
  basketball: {
    MIN: "MIN", FG: "FG", "3PT": "3PT", FT: "FT", OREB: "OR", DREB: "DR",
    REB: "REB", AST: "AST", STL: "STL", BLK: "BLK", TO: "TO", PF: "PF", PTS: "PTS",
  },
  soccer: {
    SH: "SH", Shots: "SH", ST: "ST", Starts: "ST", G: "G", Goals: "G", A: "A", Assists: "A",
    OF: "OF", Offsides: "OF", FD: "FD", FoulsDrawn: "FD", FC: "FC", FoulsCommitted: "FC",
    SV: "SV", Saves: "SV", YC: "YC", "Yellow Cards": "YC", RC: "RC", "Red Cards": "RC",
    GP: "GP", MIN: "MIN", Minutes: "MIN",
  },
  hockey: { G: "G", A: "A", PTS: "PTS", "+/-": "+/-", PIM: "PIM", SOG: "SOG", HIT: "HIT", BLK: "BLK", FW: "FW", FL: "FL", TOI: "TOI" },
  baseball: { AB: "AB", R: "R", H: "H", HR: "HR", RBI: "RBI", BB: "BB", SO: "SO", AVG: "AVG", OBP: "OBP", SLG: "SLG" },
  football: { "C/ATT": "C/ATT", YDS: "YDS", TD: "TD", INT: "INT", CAR: "CAR", REC: "REC", TGTS: "TGTS", SACK: "SACK", TFL: "TFL" },
};

export const HIGHLIGHT_STATS: Record<string, string[]> = {
  basketball: ["PTS", "REB", "AST"],
  soccer: ["G", "A", "SH", "Goals", "Assists", "Shots", "Saves", "SV"],
  hockey: ["G", "A", "PTS"],
  baseball: ["H", "RBI", "HR"],
  football: ["YDS", "TD", "REC"],
};

/** Soccer player detail: stat keys to show (label, key). */
export const SOCCER_PLAYER_DETAIL_STATS: {
  label: string;
  keys: string[];
  fallback?: string;
}[] = [
  { label: "Matches", keys: [], fallback: "1" },
  { label: "Goals", keys: ["G", "Goals"] },
  { label: "Assists", keys: ["A", "Assists"] },
  { label: "Shots", keys: ["SH", "Shots"] },
  { label: "Saves", keys: ["SV", "Saves"] },
  { label: "Yellow Cards", keys: ["YC", "Yellow Cards"] },
  { label: "Red Cards", keys: ["RC", "Red Cards"] },
  { label: "Minutes", keys: ["MIN", "Minutes"] },
];

export const TEAM_STAT_DISPLAY_ORDER = [
  "fieldGoalsMade-fieldGoalsAttempted", "fieldGoalPct",
  "threePointFieldGoalsMade-threePointFieldGoalsAttempted", "threePointFieldGoalPct",
  "freeThrowsMade-freeThrowsAttempted", "freeThrowPct",
  "totalRebounds", "offensiveRebounds", "defensiveRebounds",
  "assists", "steals", "blocks", "turnovers", "fouls",
  "turnoverPoints", "fastBreakPoints", "pointsInPaint",
  "largestLead",
  "possession", "shots", "shotsOnTarget", "corners", "offsides",
  "saves", "yellowCards", "redCards",
  "hits", "powerPlayGoals", "powerPlayOpportunities", "penaltyMinutes",
  "faceoffWins", "giveaways", "takeaways",
];

export const EXCLUDED_TEAM_STATS = new Set([
  "teamTurnovers", "totalTurnovers", "technicalFouls", "totalTechnicalFouls",
  "flagrantFouls", "leadChanges", "leadPercentage",
]);

// ── Lineup helpers ───────────────────────────────────────────────────

/** Parse "4-2-3-1" -> [4, 2, 3, 1]. */
export function formationToRows(formation: string): number[] {
  const parts = formation
    .trim()
    .split(/-/)
    .map((s) => parseInt(s.replace(/\D/g, ""), 10))
    .filter((n) => !isNaN(n) && n > 0);
  if (parts.length === 0) return [1];
  return parts;
}

export const POSITION_ORDER: Record<string, number> = {
  GK: 0, G: 0, D: 1, DF: 1, DEF: 1, M: 2, MF: 2, MID: 2, F: 3, FW: 3, FWD: 3,
};

export function positionSortKey(pos: string): number {
  const u = pos.toUpperCase();
  for (const [k, v] of Object.entries(POSITION_ORDER)) {
    if (u.includes(k)) return v;
  }
  return 2;
}

/** Split starters into rows by formation. Sort by position (GK, D, M, F) then chunk by formation row counts. */
export function startersByFormationRows(
  starters: PlayerStatLine[],
  formation: string | undefined,
): PlayerStatLine[][] {
  if (starters.length === 0) return [];
  const sorted = [...starters].sort(
    (a, b) => positionSortKey(a.position) - positionSortKey(b.position),
  );
  const rows = formationToRows(formation || "4-4-2");
  const result: PlayerStatLine[][] = [];
  let idx = 0;
  for (const count of rows) {
    result.push(sorted.slice(idx, idx + count));
    idx += count;
    if (idx >= sorted.length) break;
  }
  if (idx < sorted.length) result.push(sorted.slice(idx));
  return result;
}

export function getCardFlags(
  p: PlayerStatLine,
): { yellow?: boolean; red?: boolean } {
  const yc = p.stats["YC"] ?? p.stats["Yellow Cards"];
  const rc = p.stats["RC"] ?? p.stats["Red Cards"];
  const y = Number(yc) || (String(yc).trim() && String(yc) !== "-" ? 1 : 0);
  const r = Number(rc) || (String(rc).trim() && String(rc) !== "-" ? 1 : 0);
  return { yellow: y > 0, red: r > 0 };
}

export function hasScored(p: PlayerStatLine): boolean {
  const g = p.stats["G"] ?? p.stats["Goals"];
  return (Number(g) || 0) > 0;
}
