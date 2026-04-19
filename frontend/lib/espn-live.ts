/**
 * Client-side ESPN live data fetcher.
 * Supplements (or patches) backend data with real-time scores, phases,
 * and clocks directly from ESPN's public scoreboard API.
 */

import { isHalvesBasketball } from "./game-clock";
import { LEAGUE_ESPN } from "./league-map";

const ESPN_BASE = "/api/espn/site";

export interface ESPNLiveMatch {
  espnId: string;
  homeTeam: string;
  awayTeam: string;
  homeShort: string;
  awayShort: string;
  homeScore: number;
  awayScore: number;
  phase: string;
  clock: string | null;
  period: string | null;
  detail: string;
  isLive: boolean;
  isFinished: boolean;
}

// Raw types returned by ESPN API (minimum subset we care about)
interface RawESPNCompetitor {
  homeAway?: string;
  score?: string | number;
  winner?: boolean;
  team?: {
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    id?: string;
  };
}
interface RawESPNCompetition {
  competitors?: RawESPNCompetitor[];
  status?: {
    type?: { name?: string; detail?: string };
    displayClock?: string;
  };
}
interface RawESPNEvent {
  id?: string | number;
  competitions?: RawESPNCompetition[];
  date?: string;
}

function mapEspnPhase(
  statusName: string,
  statusDetail: string,
  sport: string,
  leagueSlug: string = "",
): string {
  // ESPN feeds `status.type.name` as STATUS_* tokens (STATUS_SCHEDULED,
  // STATUS_IN_PROGRESS, STATUS_FINAL, STATUS_POSTPONED, etc.). The rest of
  // this function expects the short tokens ("pre", "in", "post"), so
  // normalize first — without this, every game falls through to "scheduled"
  // and the scoreboard shows FT 0-0 on completed games.
  const raw = statusName.toLowerCase();
  const normalize = (s: string): string => {
    if (s.startsWith("status_")) {
      const tail = s.slice("status_".length);
      if (tail === "scheduled") return "pre";
      if (tail === "in_progress" || tail === "halftime" || tail === "end_period") return "in";
      if (tail === "final" || tail === "full_time") return "post";
      if (tail === "postponed") return "postponed";
      if (tail === "canceled" || tail === "cancelled") return "cancelled";
      if (tail === "suspended" || tail === "delayed" || tail === "rain_delay") return "suspended";
      return tail;
    }
    return s;
  };
  const st = normalize(raw);
  const detail = statusDetail.toLowerCase();

  if (st === "pre") return "scheduled";
  if (st === "post") return "finished";
  if (st === "postponed") return "postponed";
  if (st === "cancelled") return "cancelled";
  if (st === "suspended") return "suspended";

  if (st === "in") {
    if (sport === "soccer") {
      if (detail.includes("halftime")) return "live_halftime";
      if (detail.includes("2nd half")) return "live_second_half";
      if (detail.includes("extra")) return "live_extra_time";
      if (detail.includes("penal")) return "live_penalties";
      return "live_first_half";
    }
    if (sport === "basketball") {
      if (isHalvesBasketball(leagueSlug)) {
        if (detail.includes("ot") || detail.includes("overtime")) return "live_ot";
        if (detail.includes("halftime")) return "break";
        if (detail.includes("half") && detail.includes("time")) return "live_halftime";
        if (detail.includes("2nd")) return "live_h2";
        return "live_h1";
      }
      if (detail.includes("halftime")) return "break";
      if (detail.includes("1st")) return "live_q1";
      if (detail.includes("2nd")) return "live_q2";
      if (detail.includes("3rd")) return "live_q3";
      if (detail.includes("4th")) return "live_q4";
      if (detail.includes("ot") || detail.includes("overtime")) return "live_ot";
      return "live_q1";
    }
    if (sport === "hockey") {
      if (detail.includes("1st")) return "live_p1";
      if (detail.includes("2nd")) return "live_p2";
      if (detail.includes("3rd")) return "live_p3";
      if (detail.includes("ot") || detail.includes("overtime")) return "live_ot";
      if (detail.includes("shootout")) return "live_ot";
      return "live_p1";
    }
    if (sport === "baseball") {
      return "live_inning";
    }
    if (sport === "football") {
      if (detail.includes("1st")) return "live_q1";
      if (detail.includes("2nd")) return "live_q2";
      if (detail.includes("halftime")) return "break";
      if (detail.includes("3rd")) return "live_q3";
      if (detail.includes("4th")) return "live_q4";
      if (detail.includes("ot") || detail.includes("overtime")) return "live_ot";
      return "live_q1";
    }
  }

  return "scheduled";
}

function mapPeriodLabel(statusDetail: string, sport: string, leagueSlug: string = ""): string | null {
  const detail = statusDetail.toLowerCase();

  if (sport === "basketball" && isHalvesBasketball(leagueSlug)) {
    if (detail.includes("1st")) return "1st Half";
    if (detail.includes("2nd")) return "2nd Half";
    if (detail.includes("ot") || detail.includes("overtime")) return "OT";
    if (detail.includes("halftime")) return "Halftime";
    return null;
  }
  if (sport === "basketball" || sport === "football") {
    if (detail.includes("1st")) return "1st Quarter";
    if (detail.includes("2nd")) return "2nd Quarter";
    if (detail.includes("3rd")) return "3rd Quarter";
    if (detail.includes("4th")) return "4th Quarter";
    if (detail.includes("ot")) return "OT";
    if (detail.includes("halftime")) return "Halftime";
  }
  if (sport === "hockey") {
    if (detail.includes("1st")) return "1st Period";
    if (detail.includes("2nd")) return "2nd Period";
    if (detail.includes("3rd")) return "3rd Period";
    if (detail.includes("ot")) return "OT";
    if (detail.includes("shootout")) return "SO";
  }
  if (sport === "soccer") {
    if (detail.includes("1st half")) return "1st Half";
    if (detail.includes("2nd half")) return "2nd Half";
    if (detail.includes("halftime")) return "Half Time";
    if (detail.includes("extra")) return "Extra Time";
    if (detail.includes("penal")) return "Penalties";
  }
  if (sport === "baseball") {
    // ESPN detail e.g. "Top 3rd", "Bottom 5th", "Middle 8th", "End of 9th"
    if (detail.includes("top") && detail.includes("1st")) return "Top 1st";
    if (detail.includes("top") && detail.includes("2nd")) return "Top 2nd";
    if (detail.includes("top") && detail.includes("3rd")) return "Top 3rd";
    if (detail.includes("top") && detail.includes("4th")) return "Top 4th";
    if (detail.includes("top") && detail.includes("5th")) return "Top 5th";
    if (detail.includes("top") && detail.includes("6th")) return "Top 6th";
    if (detail.includes("top") && detail.includes("7th")) return "Top 7th";
    if (detail.includes("top") && detail.includes("8th")) return "Top 8th";
    if (detail.includes("top") && detail.includes("9th")) return "Top 9th";
    if (detail.includes("bottom") && detail.includes("1st")) return "Bottom 1st";
    if (detail.includes("bottom") && detail.includes("2nd")) return "Bottom 2nd";
    if (detail.includes("bottom") && detail.includes("3rd")) return "Bottom 3rd";
    if (detail.includes("bottom") && detail.includes("4th")) return "Bottom 4th";
    if (detail.includes("bottom") && detail.includes("5th")) return "Bottom 5th";
    if (detail.includes("bottom") && detail.includes("6th")) return "Bottom 6th";
    if (detail.includes("bottom") && detail.includes("7th")) return "Bottom 7th";
    if (detail.includes("bottom") && detail.includes("8th")) return "Bottom 8th";
    if (detail.includes("bottom") && detail.includes("9th")) return "Bottom 9th";
    if (detail.includes("middle")) return statusDetail.trim() || null;
    if (detail.includes("end of")) return statusDetail.trim() || null;
    if (detail.includes("top") || detail.includes("bottom")) return statusDetail.trim() || null;
  }
  return null;
}

export async function fetchESPNScoreboard(
  leagueName: string,
): Promise<ESPNLiveMatch[]> {
  const info = LEAGUE_ESPN[leagueName];
  if (!info) return [];

  try {
    const prefix =
      info.sport === "soccer"
        ? `soccer/${info.slug}`
        : `${info.sport}/${info.slug}`;
    const res = await fetch(`${ESPN_BASE}/${prefix}/scoreboard`);
    if (!res.ok) return [];

    const data = await res.json();
    const events: RawESPNEvent[] = data.events || [];
    const results: ESPNLiveMatch[] = [];

    for (const evt of events) {
      const comp = evt.competitions?.[0];
      if (!comp) continue;

      const competitors: RawESPNCompetitor[] = comp.competitors || [];
      const home = competitors.find((c) => c.homeAway === "home");
      const away = competitors.find((c) => c.homeAway === "away");
      if (!home || !away) continue;

      const status = comp.status || {};
      const statusName = status.type?.name || "pre";
      const statusDetail = status.type?.detail || "";
      const displayClock = status.displayClock || null;

      let phase = mapEspnPhase(statusName, statusDetail, info.sport, info.slug);
      // Soccer: if we defaulted to first half but clock shows >45', correct to second half or extra time
      if (info.sport === "soccer" && phase === "live_first_half") {
        const clockStr = (displayClock ?? statusDetail ?? "").toString().trim();
        const plusMatch = clockStr.match(/^(\d+)\s*\+\s*(\d+)\s*'?/);
        const minute = plusMatch
          ? parseInt(plusMatch[1], 10) + parseInt(plusMatch[2], 10)
          : (() => {
              const m = clockStr.match(/(\d+)\s*'?/);
              return m ? parseInt(m[1], 10) : null;
            })();
        if (minute != null) {
          if (minute > 90) phase = "live_extra_time";
          else if (minute > 45) phase = "live_second_half";
        }
      }
      const isLive = phase.startsWith("live_") || phase === "break";
      const isFinished = phase === "finished";

      results.push({
        espnId: String(evt.id),
        homeTeam: home.team?.displayName || "",
        awayTeam: away.team?.displayName || "",
        homeShort: home.team?.shortDisplayName || home.team?.abbreviation || "",
        awayShort: away.team?.shortDisplayName || away.team?.abbreviation || "",
        homeScore: parseInt(String(home.score ?? "0"), 10),
        awayScore: parseInt(String(away.score ?? "0"), 10),
        phase,
        clock: displayClock,
        period: mapPeriodLabel(statusDetail, info.sport, info.slug),
        detail: statusDetail,
        isLive,
        isFinished,
      });
    }

    return results;
  } catch {
    return [];
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Strip common suffixes so "Inter Miami FC" and "Inter Miami CF" both become "intermiami". */
function normalizeForMatch(s: string): string {
  const n = normalize(s);
  const suffixes = ["fc", "cf", "cfc", "sc", "united", "city", "cfc"];
  let out = n;
  for (const suf of suffixes) {
    if (out.endsWith(suf) && out.length > suf.length) out = out.slice(0, -suf.length);
  }
  return out;
}

/** True if short looks like an initialism of long (e.g. "lafc" vs "losangelesfootballclub"). */
function isInitialismOf(short: string, long: string): boolean {
  if (short.length > long.length || short.length < 2) return false;
  let i = 0;
  for (const c of short) {
    i = long.indexOf(c, i);
    if (i === -1) return false;
    i += 1;
  }
  return true;
}

function namesMatch(a: string, b: string): boolean {
  const an = normalize(a);
  const bn = normalize(b);
  const anAlt = normalizeForMatch(a);
  const bnAlt = normalizeForMatch(b);
  if (an === bn || anAlt === bnAlt) return true;
  if (an.includes(bn) || bn.includes(an)) return true;
  if (anAlt.includes(bnAlt) || bnAlt.includes(anAlt)) return true;
  if (isInitialismOf(an, bn) || isInitialismOf(bn, an)) return true;
  if (an.length >= 3 && bn.length >= 3 && (isInitialismOf(an, bnAlt) || isInitialismOf(bn, anAlt))) return true;
  return false;
}

export function findESPNMatch(
  espnMatches: ESPNLiveMatch[],
  homeTeamName: string,
  awayTeamName: string,
): ESPNLiveMatch | null {
  for (const m of espnMatches) {
    const homeMatch =
      namesMatch(homeTeamName, m.homeTeam) ||
      namesMatch(homeTeamName, m.homeShort);
    const awayMatch =
      namesMatch(awayTeamName, m.awayTeam) ||
      namesMatch(awayTeamName, m.awayShort);

    if (homeMatch && awayMatch) return m;
  }

  return null;
}

export function getLeagueESPNKey(leagueName: string): string | null {
  if (LEAGUE_ESPN[leagueName]) return leagueName;
  for (const key of Object.keys(LEAGUE_ESPN)) {
    if (
      normalize(key) === normalize(leagueName) ||
      normalize(leagueName).includes(normalize(key)) ||
      normalize(key).includes(normalize(leagueName))
    ) {
      return key;
    }
  }
  return null;
}
