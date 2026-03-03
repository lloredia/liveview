import {
  getLeagueFormat,
  isHalvesBasketball,
  normalizeEspnClock,
  formatClock,
  formatPeriodShort,
  formatPeriodLong,
  parseClockSeconds,
  LEAGUE_FORMATS,
} from "@/lib/game-clock";

// Also test the label maps from utils.ts to ensure consistency
import { phaseLabel, phaseShortLabel } from "@/lib/utils";

// ── League format resolution ────────────────────────────────────────

describe("getLeagueFormat", () => {
  it("returns halves for NCAA Men's Basketball", () => {
    const fmt = getLeagueFormat("basketball", "mens-college-basketball");
    expect(fmt.periodType).toBe("halves");
    expect(fmt.periodCount).toBe(2);
    expect(fmt.periodLengthSeconds).toBe(20 * 60);
    expect(fmt.clockDirection).toBe("COUNTDOWN");
  });

  it("returns quarters for NCAA Women's Basketball", () => {
    const fmt = getLeagueFormat("basketball", "womens-college-basketball");
    expect(fmt.periodType).toBe("quarters");
    expect(fmt.periodCount).toBe(4);
    expect(fmt.periodLengthSeconds).toBe(10 * 60);
  });

  it("returns quarters for NBA", () => {
    const fmt = getLeagueFormat("basketball", "nba");
    expect(fmt.periodType).toBe("quarters");
    expect(fmt.periodCount).toBe(4);
    expect(fmt.periodLengthSeconds).toBe(12 * 60);
  });

  it("returns periods for NHL", () => {
    const fmt = getLeagueFormat("hockey", "nhl");
    expect(fmt.periodType).toBe("periods");
    expect(fmt.periodCount).toBe(3);
    expect(fmt.periodLengthSeconds).toBe(20 * 60);
  });

  it("returns innings for MLB", () => {
    const fmt = getLeagueFormat("baseball", "mlb");
    expect(fmt.periodType).toBe("innings");
    expect(fmt.periodCount).toBe(9);
    expect(fmt.periodLengthSeconds).toBeNull();
  });

  it("returns quarters for NFL", () => {
    const fmt = getLeagueFormat("football", "nfl");
    expect(fmt.periodType).toBe("quarters");
    expect(fmt.periodCount).toBe(4);
  });

  it("returns soccer-halves for Premier League", () => {
    const fmt = getLeagueFormat("soccer", "eng.1");
    expect(fmt.periodType).toBe("soccer-halves");
    expect(fmt.clockDirection).toBe("COUNTUP");
  });

  it("falls back to sport default for unknown league slug", () => {
    const fmt = getLeagueFormat("basketball", "unknown-league");
    expect(fmt.periodType).toBe("quarters");
  });

  it("falls back to soccer for completely unknown sport", () => {
    const fmt = getLeagueFormat("cricket", null);
    expect(fmt.periodType).toBe("soccer-halves");
  });
});

// ── isHalvesBasketball ──────────────────────────────────────────────

describe("isHalvesBasketball", () => {
  it("returns true for mens-college-basketball", () => {
    expect(isHalvesBasketball("mens-college-basketball")).toBe(true);
  });

  it("returns false for NBA", () => {
    expect(isHalvesBasketball("nba")).toBe(false);
  });

  it("returns false for NCAAW", () => {
    expect(isHalvesBasketball("womens-college-basketball")).toBe(false);
  });

  it("returns false for null/undefined", () => {
    expect(isHalvesBasketball(null)).toBe(false);
    expect(isHalvesBasketball(undefined)).toBe(false);
    expect(isHalvesBasketball("")).toBe(false);
  });
});

// ── parseClockSeconds ───────────────────────────────────────────────

describe("parseClockSeconds", () => {
  it("parses MM:SS format", () => {
    expect(parseClockSeconds("12:34")).toBe(12 * 60 + 34);
    expect(parseClockSeconds("0:05")).toBe(5);
    expect(parseClockSeconds("20:00")).toBe(1200);
  });

  it("returns null for non-clock strings", () => {
    expect(parseClockSeconds(null)).toBeNull();
    expect(parseClockSeconds("")).toBeNull();
    expect(parseClockSeconds("45'")).toBeNull();
    expect(parseClockSeconds("Halftime")).toBeNull();
  });
});

// ── NCAA Men's Basketball (halves) ──────────────────────────────────

describe("NCAA Men's Basketball", () => {
  const sport = "basketball";
  const slug = "mens-college-basketball";

  it("normalizes start of game to LIVE, period 1, halves", () => {
    const nc = normalizeEspnClock("in", "1st Half - 20:00", "20:00", sport, slug, 1);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodNumber).toBe(1);
    expect(nc.periodType).toBe("halves");
    expect(nc.clockDirection).toBe("COUNTDOWN");
    expect(nc.isOvertime).toBe(false);
  });

  it("normalizes mid-1H with countdown clock", () => {
    const nc = normalizeEspnClock("in", "1st Half - 12:34", "12:34", sport, slug, 1);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodNumber).toBe(1);
    expect(nc.clockSecondsRemaining).toBe(12 * 60 + 34);
  });

  it("normalizes halftime", () => {
    const nc = normalizeEspnClock("in", "Halftime", null, sport, slug, 1);
    expect(nc.state).toBe("HT");
  });

  it("normalizes 2nd half", () => {
    const nc = normalizeEspnClock("in", "2nd Half - 8:22", "8:22", sport, slug, 2);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodNumber).toBe(2);
    expect(nc.clockSecondsRemaining).toBe(8 * 60 + 22);
  });

  it("normalizes end of regulation as FINAL", () => {
    const nc = normalizeEspnClock("post", "Final", null, sport, slug, 2);
    expect(nc.state).toBe("FINAL");
    expect(nc.isOvertime).toBe(false);
  });

  it("normalizes overtime (period > 2)", () => {
    const nc = normalizeEspnClock("in", "Overtime - 3:45", "3:45", sport, slug, 3);
    expect(nc.state).toBe("OT");
    expect(nc.isOvertime).toBe(true);
    expect(nc.clockSecondsRemaining).toBe(3 * 60 + 45);
  });

  it("formatClock produces correct OT label", () => {
    const nc = normalizeEspnClock("in", "Overtime - 3:45", "3:45", sport, slug, 3);
    const result = formatClock(nc);
    expect(result.displayPeriod).toBe("OT");
    expect(result.displayClock).toBe("3:45");
  });

  it("formatClock produces correct 2OT label", () => {
    const nc = normalizeEspnClock("in", "2nd Overtime - 1:00", "1:00", sport, slug, 4);
    const result = formatClock(nc);
    expect(result.displayPeriod).toBe("2OT");
  });
});

// ── NCAA Women's Basketball (quarters) ──────────────────────────────

describe("NCAA Women's Basketball", () => {
  const sport = "basketball";
  const slug = "womens-college-basketball";

  it("normalizes Q1", () => {
    const nc = normalizeEspnClock("in", "1st Qtr - 10:00", "10:00", sport, slug, 1);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodNumber).toBe(1);
    expect(nc.periodType).toBe("quarters");
    expect(nc.clockDirection).toBe("COUNTDOWN");
  });

  it("normalizes Q2", () => {
    const nc = normalizeEspnClock("in", "2nd Qtr - 5:30", "5:30", sport, slug, 2);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodNumber).toBe(2);
  });

  it("normalizes halftime at Q2/Q3 boundary", () => {
    const nc = normalizeEspnClock("in", "Halftime", null, sport, slug, 2);
    expect(nc.state).toBe("HT");
  });

  it("normalizes Q3 and Q4", () => {
    const q3 = normalizeEspnClock("in", "3rd Qtr - 7:15", "7:15", sport, slug, 3);
    expect(q3.state).toBe("LIVE");
    expect(q3.periodNumber).toBe(3);

    const q4 = normalizeEspnClock("in", "4th Qtr - 2:00", "2:00", sport, slug, 4);
    expect(q4.state).toBe("LIVE");
    expect(q4.periodNumber).toBe(4);
  });

  it("normalizes overtime (period > 4)", () => {
    const nc = normalizeEspnClock("in", "Overtime - 5:00", "5:00", sport, slug, 5);
    expect(nc.state).toBe("OT");
    expect(nc.isOvertime).toBe(true);
  });
});

// ── NBA (quarters, control) ─────────────────────────────────────────

describe("NBA (control)", () => {
  const sport = "basketball";
  const slug = "nba";

  it("normalizes Q1-Q4 with countdown", () => {
    const nc = normalizeEspnClock("in", "1st Qtr - 8:00", "8:00", sport, slug, 1);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodType).toBe("quarters");
    expect(nc.clockDirection).toBe("COUNTDOWN");
    expect(nc.periodNumber).toBe(1);
  });

  it("normalizes OT (period 5)", () => {
    const nc = normalizeEspnClock("in", "OT - 3:00", "3:00", sport, slug, 5);
    expect(nc.state).toBe("OT");
    expect(nc.isOvertime).toBe(true);
  });
});

// ── NHL (periods) ───────────────────────────────────────────────────

describe("NHL", () => {
  const sport = "hockey";
  const slug = "nhl";

  it("normalizes P1-P3 with countdown", () => {
    const nc = normalizeEspnClock("in", "1st Period - 15:00", "15:00", sport, slug, 1);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodType).toBe("periods");
    expect(nc.periodNumber).toBe(1);
    expect(nc.clockDirection).toBe("COUNTDOWN");
  });

  it("normalizes OT (period > 3)", () => {
    const nc = normalizeEspnClock("in", "OT - 4:30", "4:30", sport, slug, 4);
    expect(nc.state).toBe("OT");
    expect(nc.isOvertime).toBe(true);
  });
});

// ── MLB (innings) ───────────────────────────────────────────────────

describe("MLB", () => {
  const sport = "baseball";
  const slug = "mlb";

  it("normalizes to innings with no clock", () => {
    const nc = normalizeEspnClock("in", "Top 3rd", null, sport, slug, 3);
    expect(nc.state).toBe("LIVE");
    expect(nc.periodType).toBe("innings");
    expect(nc.clockSecondsRemaining).toBeNull();
    expect(nc.periodNumber).toBe(3);
  });

  it("marks extra innings as overtime", () => {
    const nc = normalizeEspnClock("in", "Top 10th", null, sport, slug, 10);
    expect(nc.state).toBe("LIVE");
    expect(nc.isOvertime).toBe(true);
  });
});

// ── Regression: NCAA Men must NOT produce Q labels ──────────────────

describe("Regression: NCAA Men must NOT show Q labels", () => {
  it("phaseShortLabel for live_h1 produces 1H, not Q1", () => {
    expect(phaseShortLabel("live_h1")).toBe("1H");
  });

  it("phaseShortLabel for live_h2 produces 2H, not Q2", () => {
    expect(phaseShortLabel("live_h2")).toBe("2H");
  });

  it("phaseLabel for live_h1 produces 1st Half, not Q1", () => {
    expect(phaseLabel("live_h1")).toBe("1st Half");
  });

  it("phaseLabel for live_h2 produces 2nd Half, not Q2", () => {
    expect(phaseLabel("live_h2")).toBe("2nd Half");
  });

  it("formatPeriodShort for live_h1 produces 1H", () => {
    expect(formatPeriodShort("live_h1")).toBe("1H");
  });

  it("formatPeriodShort for live_h2 produces 2H", () => {
    expect(formatPeriodShort("live_h2")).toBe("2H");
  });

  it("formatPeriodLong for live_h1 produces 1st Half", () => {
    expect(formatPeriodLong("live_h1")).toBe("1st Half");
  });

  it("formatPeriodLong for live_h2 produces 2nd Half", () => {
    expect(formatPeriodLong("live_h2")).toBe("2nd Half");
  });

  it("live_q1 still produces Q1 (non-halves basketball)", () => {
    expect(phaseShortLabel("live_q1")).toBe("Q1");
    expect(formatPeriodShort("live_q1")).toBe("Q1");
  });
});

// ── formatClock ─────────────────────────────────────────────────────

describe("formatClock", () => {
  it("PRE state shows Scheduled", () => {
    const nc = normalizeEspnClock("pre", "Scheduled", null, "basketball", "nba", 0);
    const result = formatClock(nc);
    expect(result.statusText).toBe("Scheduled");
    expect(result.displayClock).toBe("");
  });

  it("FINAL state shows Final", () => {
    const nc = normalizeEspnClock("post", "Final", null, "basketball", "nba", 4);
    const result = formatClock(nc);
    expect(result.statusText).toBe("Final");
  });

  it("FINAL with OT shows F/OT", () => {
    const nc = normalizeEspnClock("post", "Final/OT", null, "basketball", "nba", 5);
    nc.isOvertime = true;
    const result = formatClock(nc);
    expect(result.statusText).toBe("F/OT");
  });

  it("HT state shows Halftime", () => {
    const nc = normalizeEspnClock("in", "Halftime", null, "basketball", "mens-college-basketball", 1);
    const result = formatClock(nc);
    expect(result.statusText).toBe("Halftime");
    expect(result.displayPeriod).toBe("HT");
  });

  it("LIVE shows clock + period label for halves", () => {
    const nc = normalizeEspnClock("in", "1st Half - 15:30", "15:30", "basketball", "mens-college-basketball", 1);
    const result = formatClock(nc);
    expect(result.displayClock).toBe("15:30");
    expect(result.displayPeriod).toBe("1H");
    expect(result.statusText).toBe("1H 15:30");
  });

  it("LIVE shows clock + period label for quarters", () => {
    const nc = normalizeEspnClock("in", "3rd Qtr - 7:00", "7:00", "basketball", "nba", 3);
    const result = formatClock(nc);
    expect(result.displayClock).toBe("7:00");
    expect(result.displayPeriod).toBe("Q3");
  });
});

// ── Soccer labels (control) ─────────────────────────────────────────

describe("Soccer labels (control)", () => {
  it("soccer halves produce 1H/2H short labels", () => {
    expect(phaseShortLabel("live_first_half")).toBe("1H");
    expect(phaseShortLabel("live_second_half")).toBe("2H");
    expect(formatPeriodShort("live_first_half")).toBe("1H");
    expect(formatPeriodShort("live_second_half")).toBe("2H");
  });

  it("soccer uses count-up clock direction", () => {
    const fmt = getLeagueFormat("soccer", "eng.1");
    expect(fmt.clockDirection).toBe("COUNTUP");
  });
});

// ── LEAGUE_FORMATS completeness ─────────────────────────────────────

describe("LEAGUE_FORMATS completeness", () => {
  it("all basketball leagues have an entry", () => {
    expect(LEAGUE_FORMATS["nba"]).toBeDefined();
    expect(LEAGUE_FORMATS["wnba"]).toBeDefined();
    expect(LEAGUE_FORMATS["mens-college-basketball"]).toBeDefined();
    expect(LEAGUE_FORMATS["womens-college-basketball"]).toBeDefined();
  });

  it("all major sports leagues have entries", () => {
    expect(LEAGUE_FORMATS["nhl"]).toBeDefined();
    expect(LEAGUE_FORMATS["nfl"]).toBeDefined();
    expect(LEAGUE_FORMATS["mlb"]).toBeDefined();
    expect(LEAGUE_FORMATS["eng.1"]).toBeDefined();
    expect(LEAGUE_FORMATS["esp.1"]).toBeDefined();
    expect(LEAGUE_FORMATS["uefa.champions"]).toBeDefined();
  });
});
