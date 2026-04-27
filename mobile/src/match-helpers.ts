/**
 * Sport detection from a league short_name (NBA, MLB, NHL, MLS, NFL, …).
 * Backend doesn't yet return a `sport` field on match-detail payloads, so
 * we pattern-match the short_name. If/when the type gains an explicit
 * `sport` or `code`, swap the input here — call sites won't change.
 */
export type Sport =
  | "basketball"
  | "baseball"
  | "hockey"
  | "soccer"
  | "football"
  | "unknown";

const BASKETBALL = /^(NBA|WNBA|NCAAM|NCAAW|EUROLEAGUE|G[- ]?LEAGUE)/i;
const BASEBALL = /^(MLB|MILB|KBO|NPB)/i;
const HOCKEY = /^(NHL|AHL|KHL)/i;
const FOOTBALL = /^(NFL|NCAAF|XFL|USFL|CFL)/i;
// Soccer covers a long tail of leagues — match generously and keep last.
const SOCCER = /(MLS|EPL|PREMIER|LALIGA|LA LIGA|SERIE A|BUNDESLIGA|LIGUE 1|UEFA|UCL|UEL|FA CUP|MLS|LIGA MX|USL|NWSL|EREDIVISIE)/i;

/**
 * Pass either short_name or full name — the regex set covers both
 * ("NBA" and "National Basketball Association"). The match detail
 * endpoint currently omits short_name, so callers should pass the
 * full name as a fallback.
 */
export function detectSport(...candidates: Array<string | null | undefined>): Sport {
  for (const raw of candidates) {
    const s = (raw || "").trim();
    if (!s) continue;
    if (BASKETBALL.test(s)) return "basketball";
    if (BASEBALL.test(s)) return "baseball";
    if (HOCKEY.test(s)) return "hockey";
    if (FOOTBALL.test(s)) return "football";
    if (SOCCER.test(s)) return "soccer";
  }
  return "unknown";
}

/**
 * Sport-appropriate pre-game pill text.
 * Used in the scheduled status pill on match detail.
 */
export function preGamePillText(sport: Sport): string {
  switch (sport) {
    case "basketball":
      return "TIP-OFF";
    case "baseball":
      return "FIRST PITCH";
    case "hockey":
      return "PUCK DROP";
    case "soccer":
    case "football":
      return "KICK-OFF";
    default:
      return "STARTS";
  }
}

/**
 * Countdown for tip-off:
 *  - <60m future       → "In 12m"
 *  - <24h future       → "In 2h 14m" (or "In 3h" when minutes=0)
 *  - >=24h future      → absolute time, e.g. "Sat 7:30 PM"
 *  - past (delayed but still scheduled phase) → absolute time
 *  - no start_time     → null
 */
export function formatTipoffCountdown(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const start = new Date(iso).getTime();
  if (Number.isNaN(start)) return null;
  const ms = start - Date.now();
  const absolute = () =>
    new Date(start).toLocaleString([], {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  if (ms <= 0) return absolute();
  const totalMins = Math.floor(ms / 60_000);
  if (totalMins < 60) return `In ${totalMins}m`;
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  if (hrs < 24) return mins ? `In ${hrs}h ${mins}m` : `In ${hrs}h`;
  return absolute();
}

/**
 * "FINAL" with overtime suffix when periods.length exceeds 4 regulation
 * quarters: " · OT", " · 2OT", etc.
 */
export function finalPillSuffix(periodCount: number): string {
  if (periodCount <= 4) return "";
  const otCount = periodCount - 4;
  return otCount === 1 ? " · OT" : ` · ${otCount}OT`;
}

/**
 * Team-color fallback for the period table dot + leader avatar bg when
 * `color_primary` is absent. Two neutral greys so the rows are still
 * visually distinct, just unbranded. Not derived from the team id —
 * dots are row-identification helpers, not branding.
 */
export const TEAM_COLOR_FALLBACK = {
  away: "#888",
  home: "#aaa",
} as const;

/**
 * Darker neutral for the leader avatar specifically — distinguishes the
 * leader card vs. the table dot when `color_primary` hasn't shipped yet.
 * Without this the avatar would sit at the same grey as the dot and the
 * card would read flat. Initials render in white.
 */
export const LEADER_AVATAR_FALLBACK = "#2a2a2a";

// ── Leaders normalization ────────────────────────────────────────

import type { LastPlay, LeaderLine, RawMatchEvent, RawPlayer, RawMatchPlayerStats } from "./api";

/**
 * Reduce a raw box-score side to a single leader line. Strategy:
 *  - find the column matching /^pts$/i (basketball points)
 *  - rank players by it desc, take #1
 *  - look up REB and AST columns (default 0 if missing)
 *
 * Returns null when:
 *  - no players present
 *  - no PTS-like column on this sport (we currently only surface
 *    basketball-style leaders; non-basketball boxscores hide cleanly)
 *  - the top scorer has 0 points (game just tipped, no leader yet)
 */
export function normalizeBasketballLeader(
  side: { players: RawPlayer[]; statColumns: string[] } | null | undefined,
): LeaderLine | null {
  if (!side?.players?.length || !side.statColumns?.length) return null;

  const ptsKey = side.statColumns.find((c) => /^pts$/i.test(c));
  if (!ptsKey) return null;
  const rebKey = side.statColumns.find((c) => /^reb$/i.test(c));
  const astKey = side.statColumns.find((c) => /^ast$/i.test(c));

  const ranked = [...side.players].sort((a, b) => intStat(b, ptsKey) - intStat(a, ptsKey));
  const top = ranked[0];
  if (!top) return null;
  const pts = intStat(top, ptsKey);
  if (pts <= 0) return null;

  return {
    initials: makeInitials(top.name),
    name: shortenPlayerName(top.name),
    position: top.position || "",
    jersey: top.jersey || "",
    pts,
    reb: rebKey ? intStat(top, rebKey) : 0,
    ast: astKey ? intStat(top, astKey) : 0,
  };
}

export function normalizeLeaders(
  raw: RawMatchPlayerStats,
  sport: Sport,
): { home: LeaderLine | null; away: LeaderLine | null } | null {
  if (sport !== "basketball") return null; // non-basketball leaders not yet implemented
  const home = normalizeBasketballLeader(raw.home);
  const away = normalizeBasketballLeader(raw.away);
  if (!home && !away) return null;
  return { home, away };
}

function intStat(player: RawPlayer, key: string): number {
  const raw = player.stats?.[key];
  if (raw == null || raw === "-" || raw === "") return 0;
  const n = parseInt(String(raw), 10);
  return Number.isNaN(n) ? 0 : n;
}

function makeInitials(fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  const first = parts[0][0] ?? "";
  const last = parts[parts.length - 1][0] ?? "";
  return (first + last).toUpperCase();
}

function shortenPlayerName(fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return fullName;
  return `${parts[0][0]}. ${parts.slice(1).join(" ")}`;
}

// ── Last play normalization ──────────────────────────────────────

/**
 * Reduce a timeline event stream to the single most-recent play, mapped
 * to the LastPlay shape the screen expects.
 *
 * Backend orders events ascending by (minute, second, seq), so the latest
 * is the last element. Returns null when:
 *  - no events
 *  - latest event's team_id doesn't match either side
 *  - we can't synthesize a play description (no detail.text and no
 *    player_name + event_type to fall back on)
 *  - the event is too old to be meaningful as a "last play" (>5 min)
 *
 * The detail field is sport-specific and normalizers will need to
 * tighten as real backend data starts flowing — this is a best-effort
 * first pass that exits cleanly when fields are missing.
 */
export function normalizeLastPlay(
  events: RawMatchEvent[],
  homeTeamId: string | null | undefined,
  awayTeamId: string | null | undefined,
): LastPlay | null {
  if (!events?.length) return null;
  const latest = events[events.length - 1];
  if (!latest) return null;

  const team =
    latest.team_id && latest.team_id === homeTeamId
      ? "home"
      : latest.team_id && latest.team_id === awayTeamId
        ? "away"
        : null;
  if (!team) return null;

  const text = extractPlayText(latest);
  if (!text) return null;

  const secondsAgo = secondsAgoFrom(latest.created_at);
  if (secondsAgo === null) return null;
  // Older than 5 minutes isn't really "last play" anymore — skip.
  if (secondsAgo > 300) return null;

  return {
    team,
    text,
    seconds_ago: secondsAgo,
    points: extractPoints(latest),
    distance_ft: extractDistance(latest),
  };
}

function extractPlayText(e: RawMatchEvent): string | null {
  const detail = e.detail || null;
  if (detail) {
    const candidate = (detail.text ?? detail.description ?? null) as unknown;
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  if (!e.player_name) return null;
  const action = humanizeEventType(e.event_type);
  if (!action) return null;
  return `${shortenPlayerName(e.player_name)} ${action}`;
}

const EVENT_TYPE_PHRASES: Record<string, string> = {
  three_point: "makes 3-pt jumper",
  three_pointer: "makes 3-pt jumper",
  made_3pt: "makes 3-pt jumper",
  two_point: "makes 2-pt shot",
  made_2pt: "makes 2-pt shot",
  field_goal: "makes field goal",
  free_throw: "makes free throw",
  made_ft: "makes free throw",
  jumper: "makes jumper",
  layup: "makes layup",
  dunk: "dunks it",
  steal: "with the steal",
  block: "with the block",
  rebound: "with the rebound",
  turnover: "turns it over",
  foul: "committed a foul",
  goal: "scores",
  shot: "with a shot",
  assist: "with the assist",
  hit: "got a hit",
  home_run: "hits a home run",
  strikeout: "strikes out",
};

function humanizeEventType(t: string | null | undefined): string {
  if (!t) return "";
  const norm = t.toLowerCase().trim();
  return EVENT_TYPE_PHRASES[norm] ?? norm.replace(/_/g, " ");
}

function extractPoints(e: RawMatchEvent): number {
  const detail = e.detail || null;
  if (detail && typeof detail.points === "number") return detail.points;
  const t = (e.event_type || "").toLowerCase();
  if (t.includes("three") || t.includes("3pt")) return 3;
  if (t.includes("free") || t.includes("ft")) return 1;
  if (
    t.includes("two") ||
    t.includes("field") ||
    t.includes("dunk") ||
    t.includes("jumper") ||
    t.includes("layup") ||
    t.includes("2pt")
  ) {
    return 2;
  }
  if (t === "goal" || t.includes("home_run")) return 1;
  return 0;
}

function extractDistance(e: RawMatchEvent): number | null {
  const detail = e.detail || null;
  if (!detail) return null;
  for (const key of ["distance_ft", "distance", "shot_distance"]) {
    const v = detail[key];
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const m = v.match(/(\d+)/);
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
}

function secondsAgoFrom(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return Math.floor(ms / 1000);
}
