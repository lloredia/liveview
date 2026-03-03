/**
 * Centralized game clock and period rules.
 *
 * Single source of truth for how every sport + league combination
 * structures its periods, labels clocks, and transitions between states.
 */

// ── Period structure types ──────────────────────────────────────────

export type PeriodType =
  | "soccer-halves"
  | "halves"
  | "quarters"
  | "periods"
  | "innings";

export type ClockDirection = "COUNTDOWN" | "COUNTUP";

export type GameState =
  | "PRE"
  | "LIVE"
  | "BREAK"
  | "HT"
  | "FINAL"
  | "OT"
  | "SUSPENDED"
  | "POSTPONED"
  | "CANCELLED";

export interface LeagueFormat {
  periodType: PeriodType;
  periodCount: number;
  /** Length of each regulation period in seconds. null for baseball (no clock). */
  periodLengthSeconds: number | null;
  clockDirection: ClockDirection;
  overtimeLabel: string;
  /** Label used at the mid-game break (e.g. "Halftime") */
  halftimeBreak: string | null;
  /** Which period boundary triggers the halftime break (e.g. 2 = after period 2) */
  halftimeAfterPeriod: number | null;
}

// ── League format definitions ───────────────────────────────────────

const BASKETBALL_QUARTERS: LeagueFormat = {
  periodType: "quarters",
  periodCount: 4,
  periodLengthSeconds: 12 * 60,
  clockDirection: "COUNTDOWN",
  overtimeLabel: "OT",
  halftimeBreak: "Halftime",
  halftimeAfterPeriod: 2,
};

const NCAAW_QUARTERS: LeagueFormat = {
  ...BASKETBALL_QUARTERS,
  periodLengthSeconds: 10 * 60,
};

const NCAAM_HALVES: LeagueFormat = {
  periodType: "halves",
  periodCount: 2,
  periodLengthSeconds: 20 * 60,
  clockDirection: "COUNTDOWN",
  overtimeLabel: "OT",
  halftimeBreak: "Halftime",
  halftimeAfterPeriod: 1,
};

const HOCKEY_PERIODS: LeagueFormat = {
  periodType: "periods",
  periodCount: 3,
  periodLengthSeconds: 20 * 60,
  clockDirection: "COUNTDOWN",
  overtimeLabel: "OT",
  halftimeBreak: null,
  halftimeAfterPeriod: null,
};

const SOCCER_HALVES: LeagueFormat = {
  periodType: "soccer-halves",
  periodCount: 2,
  periodLengthSeconds: 45 * 60,
  clockDirection: "COUNTUP",
  overtimeLabel: "ET",
  halftimeBreak: "Halftime",
  halftimeAfterPeriod: 1,
};

const FOOTBALL_QUARTERS: LeagueFormat = {
  periodType: "quarters",
  periodCount: 4,
  periodLengthSeconds: 15 * 60,
  clockDirection: "COUNTDOWN",
  overtimeLabel: "OT",
  halftimeBreak: "Halftime",
  halftimeAfterPeriod: 2,
};

const BASEBALL_INNINGS: LeagueFormat = {
  periodType: "innings",
  periodCount: 9,
  periodLengthSeconds: null,
  clockDirection: "COUNTUP",
  overtimeLabel: "Extra",
  halftimeBreak: null,
  halftimeAfterPeriod: null,
};

/**
 * Map from ESPN league slug to its period format.
 * This is the canonical source for period structure rules.
 */
export const LEAGUE_FORMATS: Record<string, LeagueFormat> = {
  // Basketball — quarters
  nba: BASKETBALL_QUARTERS,
  wnba: BASKETBALL_QUARTERS,
  "womens-college-basketball": NCAAW_QUARTERS,
  // Basketball — halves (NCAA Men)
  "mens-college-basketball": NCAAM_HALVES,
  // Hockey
  nhl: HOCKEY_PERIODS,
  // Football
  nfl: FOOTBALL_QUARTERS,
  // Baseball
  mlb: BASEBALL_INNINGS,
  // Soccer (all leagues share the same format)
  "eng.1": SOCCER_HALVES,
  "eng.2": SOCCER_HALVES,
  "eng.fa": SOCCER_HALVES,
  "eng.league_cup": SOCCER_HALVES,
  "usa.1": SOCCER_HALVES,
  "esp.1": SOCCER_HALVES,
  "ger.1": SOCCER_HALVES,
  "ita.1": SOCCER_HALVES,
  "fra.1": SOCCER_HALVES,
  "ned.1": SOCCER_HALVES,
  "por.1": SOCCER_HALVES,
  "tur.1": SOCCER_HALVES,
  "sco.1": SOCCER_HALVES,
  "sau.1": SOCCER_HALVES,
  "uefa.champions": SOCCER_HALVES,
  "uefa.europa": SOCCER_HALVES,
  "uefa.europa.conf": SOCCER_HALVES,
};

// ── Sport-level fallbacks ───────────────────────────────────────────

const SPORT_FALLBACK: Record<string, LeagueFormat> = {
  soccer: SOCCER_HALVES,
  basketball: BASKETBALL_QUARTERS,
  hockey: HOCKEY_PERIODS,
  football: FOOTBALL_QUARTERS,
  baseball: BASEBALL_INNINGS,
};

// ── Public helpers ──────────────────────────────────────────────────

/** Resolve the period format for a given sport + league slug. */
export function getLeagueFormat(
  sport: string,
  leagueSlug: string | null | undefined,
): LeagueFormat {
  if (leagueSlug && LEAGUE_FORMATS[leagueSlug]) {
    return LEAGUE_FORMATS[leagueSlug];
  }
  return SPORT_FALLBACK[sport] ?? SOCCER_HALVES;
}

/** True if the league uses basketball halves (NCAA Men). */
export function isHalvesBasketball(
  leagueSlug: string | null | undefined,
): boolean {
  if (!leagueSlug) return false;
  const fmt = LEAGUE_FORMATS[leagueSlug];
  return fmt?.periodType === "halves";
}

// ── Normalized clock model ──────────────────────────────────────────

export interface NormalizedClock {
  state: GameState;
  periodNumber: number;
  periodType: PeriodType;
  clockSecondsRemaining: number | null;
  clockDirection: ClockDirection;
  isOvertime: boolean;
  displayStartTimeLocal: string | null;
}

// ── ESPN provider mapper ────────────────────────────────────────────

/**
 * Parse an "MM:SS" clock string into total seconds.
 * Returns null for non-matching strings.
 */
export function parseClockSeconds(clock: string | null | undefined): number | null {
  if (!clock) return null;
  const m = clock.trim().match(/^(\d+):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Map ESPN raw status data to a NormalizedClock.
 */
export function normalizeEspnClock(
  statusName: string,
  statusDetail: string,
  displayClock: string | null,
  sport: string,
  leagueSlug: string,
  periodNum: number,
): NormalizedClock {
  const fmt = getLeagueFormat(sport, leagueSlug);
  const base: NormalizedClock = {
    state: "PRE",
    periodNumber: periodNum || 1,
    periodType: fmt.periodType,
    clockSecondsRemaining: parseClockSeconds(displayClock),
    clockDirection: fmt.clockDirection,
    isOvertime: false,
    displayStartTimeLocal: null,
  };

  const st = statusName.toLowerCase();
  if (st === "pre") {
    base.state = "PRE";
    return base;
  }
  if (st === "post") {
    base.state = "FINAL";
    return base;
  }
  if (st === "postponed") {
    base.state = "POSTPONED";
    return base;
  }
  if (st === "cancelled") {
    base.state = "CANCELLED";
    return base;
  }
  if (st === "suspended" || st === "delayed") {
    base.state = "SUSPENDED";
    return base;
  }

  const detail = statusDetail.toLowerCase();

  if (detail.includes("halftime") || st === "halftime") {
    base.state = "HT";
    return base;
  }

  if (st === "end_period" || st === "status_end_period") {
    base.state = "BREAK";
    return base;
  }

  // Live states
  base.state = "LIVE";

  if (fmt.periodType === "halves") {
    const isOt = periodNum > fmt.periodCount || detail.includes("ot") || detail.includes("overtime");
    if (isOt) {
      base.state = "OT";
      base.isOvertime = true;
    }
    return base;
  }

  if (fmt.periodType === "quarters") {
    const isOt = periodNum > fmt.periodCount || detail.includes("ot") || detail.includes("overtime");
    if (isOt) {
      base.state = "OT";
      base.isOvertime = true;
    }
    return base;
  }

  if (fmt.periodType === "periods") {
    const isOt = periodNum > fmt.periodCount || detail.includes("ot") || detail.includes("overtime") || detail.includes("shootout");
    if (isOt) {
      base.state = "OT";
      base.isOvertime = true;
    }
    return base;
  }

  if (fmt.periodType === "innings") {
    if (periodNum > fmt.periodCount) {
      base.isOvertime = true;
    }
    return base;
  }

  // Soccer halves — count-up clock
  return base;
}

// ── Display formatters ──────────────────────────────────────────────

/** Short period label for a given phase string (used across all UI surfaces). */
export function formatPeriodShort(phase: string): string {
  const map: Record<string, string> = {
    live_q1: "Q1",
    live_q2: "Q2",
    live_q3: "Q3",
    live_q4: "Q4",
    live_h1: "1H",
    live_h2: "2H",
    live_ot: "OT",
    live_first_half: "1H",
    live_second_half: "2H",
    live_halftime: "HT",
    live_extra_time: "ET",
    live_penalties: "PEN",
    live_p1: "P1",
    live_p2: "P2",
    live_p3: "P3",
    live_inning: "LIVE",
    break: "HT",
  };
  return map[phase] || "LIVE";
}

/** Long period label for a given phase string. */
export function formatPeriodLong(phase: string): string {
  const map: Record<string, string> = {
    scheduled: "Scheduled",
    pre_match: "Pre-Match",
    live_first_half: "1st Half",
    live_halftime: "Half Time",
    live_second_half: "2nd Half",
    live_extra_time: "Extra Time",
    live_penalties: "Penalties",
    live_q1: "Q1",
    live_q2: "Q2",
    live_q3: "Q3",
    live_q4: "Q4",
    live_h1: "1st Half",
    live_h2: "2nd Half",
    live_ot: "Overtime",
    live_p1: "1st Period",
    live_p2: "2nd Period",
    live_p3: "3rd Period",
    live_inning: "In Play",
    break: "Break",
    suspended: "Suspended",
    finished: "Full Time",
    postponed: "Postponed",
    cancelled: "Cancelled",
  };
  return map[phase] || phase;
}

/**
 * Format a NormalizedClock into display strings.
 */
export function formatClock(nc: NormalizedClock): {
  displayClock: string;
  displayPeriod: string;
  statusText: string;
} {
  if (nc.state === "PRE") {
    return {
      displayClock: "",
      displayPeriod: "",
      statusText: nc.displayStartTimeLocal || "Scheduled",
    };
  }

  if (nc.state === "FINAL") {
    return {
      displayClock: "",
      displayPeriod: "",
      statusText: nc.isOvertime ? "F/OT" : "Final",
    };
  }

  if (nc.state === "HT") {
    return {
      displayClock: "",
      displayPeriod: "HT",
      statusText: "Halftime",
    };
  }

  if (nc.state === "BREAK") {
    const label = periodLabelForNumber(nc.periodNumber, nc.periodType);
    return {
      displayClock: "",
      displayPeriod: `End ${label}`,
      statusText: `End ${label}`,
    };
  }

  if (nc.state === "OT") {
    const otNum = nc.periodType === "halves"
      ? nc.periodNumber - 2
      : nc.periodType === "quarters"
        ? nc.periodNumber - 4
        : nc.periodType === "periods"
          ? nc.periodNumber - 3
          : nc.periodNumber;
    const otLabel = otNum > 1 ? `${otNum}OT` : "OT";
    const clock = nc.clockSecondsRemaining != null
      ? formatSeconds(nc.clockSecondsRemaining)
      : "";
    return {
      displayClock: clock,
      displayPeriod: otLabel,
      statusText: clock ? `${otLabel} ${clock}` : otLabel,
    };
  }

  // LIVE
  const label = periodLabelForNumber(nc.periodNumber, nc.periodType);
  const clock = nc.clockSecondsRemaining != null
    ? formatSeconds(nc.clockSecondsRemaining)
    : "";
  return {
    displayClock: clock,
    displayPeriod: label,
    statusText: clock ? `${label} ${clock}` : label,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function periodLabelForNumber(num: number, periodType: PeriodType): string {
  if (periodType === "halves") return num === 1 ? "1H" : "2H";
  if (periodType === "soccer-halves") return num === 1 ? "1H" : "2H";
  if (periodType === "quarters") return `Q${num}`;
  if (periodType === "periods") return `P${num}`;
  if (periodType === "innings") return `${num}`;
  return `${num}`;
}

function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
