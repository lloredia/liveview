import {
  _parseStandingsEntry,
  _rankRows,
  _isKnockoutSlug,
  _getRoundOrder,
  _getRoundDisplayName,
  _isTBDTeam,
  getCompetitionMeta,
  isSoccerCompetition,
  ROUND_ORDER,
} from "@/lib/espn-standings";

// ── parseStandingsEntry ─────────────────────────────────────────────

describe("parseStandingsEntry", () => {
  it("parses a soccer entry with standard stat names", () => {
    const entry = {
      team: {
        displayName: "Arsenal",
        name: "Arsenal",
        abbreviation: "ARS",
        logos: [{ href: "https://logo.png" }],
      },
      stats: [
        { name: "gamesPlayed", value: 20 },
        { name: "wins", value: 14 },
        { name: "ties", value: 3 },
        { name: "losses", value: 3 },
        { name: "goalsFor", value: 42 },
        { name: "goalsAgainst", value: 18 },
        { name: "goalDifference", value: 24 },
        { name: "points", value: 45 },
      ],
    };
    const row = _parseStandingsEntry(entry as any);
    expect(row.teamName).toBe("Arsenal");
    expect(row.teamAbbr).toBe("ARS");
    expect(row.teamLogo).toBe("https://logo.png");
    expect(row.gamesPlayed).toBe(20);
    expect(row.wins).toBe(14);
    expect(row.draws).toBe(3);
    expect(row.losses).toBe(3);
    expect(row.goalsFor).toBe(42);
    expect(row.goalsAgainst).toBe(18);
    expect(row.goalDifference).toBe(24);
    expect(row.points).toBe(45);
  });

  it("handles alternate stat names (PF, PA, D, etc.)", () => {
    const entry = {
      team: { displayName: "Lakers", abbreviation: "LAL" },
      stats: [
        { name: "GP", value: 50 },
        { name: "W", value: 30 },
        { name: "D", value: 0 },
        { name: "L", value: 20 },
        { name: "PF", value: 5000 },
        { name: "PA", value: 4800 },
        { name: "differential", value: 200 },
        { name: "PTS", value: 30 },
      ],
    };
    const row = _parseStandingsEntry(entry as any);
    expect(row.gamesPlayed).toBe(50);
    expect(row.wins).toBe(30);
    expect(row.goalsFor).toBe(5000);
    expect(row.goalsAgainst).toBe(4800);
    expect(row.points).toBe(30);
  });

  it("handles missing team data gracefully", () => {
    const entry = { stats: [] };
    const row = _parseStandingsEntry(entry as any);
    expect(row.teamName).toBe("Unknown");
    expect(row.teamLogo).toBeNull();
    expect(row.gamesPlayed).toBe(0);
    expect(row.points).toBe(0);
  });
});

// ── rankRows ────────────────────────────────────────────────────────

describe("rankRows", () => {
  it("sorts by points descending, then GD, then GF", () => {
    const rows = [
      makeRow("A", 30, 10, 20),
      makeRow("B", 35, 15, 25),
      makeRow("C", 30, 15, 22),
    ];
    const ranked = _rankRows(rows);
    expect(ranked[0].teamName).toBe("B");
    expect(ranked[0].position).toBe(1);
    expect(ranked[1].teamName).toBe("C");
    expect(ranked[1].position).toBe(2);
    expect(ranked[2].teamName).toBe("A");
    expect(ranked[2].position).toBe(3);
  });

  it("handles empty array", () => {
    expect(_rankRows([])).toEqual([]);
  });
});

// ── isKnockoutSlug ──────────────────────────────────────────────────

describe("isKnockoutSlug", () => {
  it("recognizes knockout round slugs", () => {
    expect(_isKnockoutSlug("round-of-16")).toBe(true);
    expect(_isKnockoutSlug("quarterfinals")).toBe(true);
    expect(_isKnockoutSlug("semifinals")).toBe(true);
    expect(_isKnockoutSlug("final")).toBe(true);
    expect(_isKnockoutSlug("knockout-round-playoffs")).toBe(true);
    expect(_isKnockoutSlug("third-round")).toBe(true);
    expect(_isKnockoutSlug("first-round")).toBe(true);
  });

  it("rejects league-phase slugs", () => {
    expect(_isKnockoutSlug("league-phase")).toBe(false);
    expect(_isKnockoutSlug("league")).toBe(false);
    expect(_isKnockoutSlug("group-stage")).toBe(false);
    expect(_isKnockoutSlug("regular-season")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(_isKnockoutSlug("")).toBe(false);
  });
});

// ── getRoundOrder ───────────────────────────────────────────────────

describe("getRoundOrder", () => {
  it("returns correct ordering", () => {
    expect(_getRoundOrder("first-round")).toBeLessThan(_getRoundOrder("second-round"));
    expect(_getRoundOrder("round-of-16")).toBeLessThan(_getRoundOrder("quarterfinals"));
    expect(_getRoundOrder("quarterfinals")).toBeLessThan(_getRoundOrder("semifinals"));
    expect(_getRoundOrder("semifinals")).toBeLessThan(_getRoundOrder("final"));
  });

  it("returns 99 for unknown slugs", () => {
    expect(_getRoundOrder("unknown-round")).toBe(99);
  });
});

// ── getRoundDisplayName ─────────────────────────────────────────────

describe("getRoundDisplayName", () => {
  it("returns known display names", () => {
    expect(_getRoundDisplayName("round-of-16")).toBe("Round of 16");
    expect(_getRoundDisplayName("quarterfinals")).toBe("Quarter-finals");
    expect(_getRoundDisplayName("final")).toBe("Final");
  });

  it("falls back to seriesTitle", () => {
    expect(_getRoundDisplayName("unknown-slug", "My Custom Round")).toBe("My Custom Round");
  });

  it("titlecases unknown slug with no seriesTitle", () => {
    expect(_getRoundDisplayName("some-new-round")).toBe("Some New Round");
  });
});

// ── isTBDTeam ───────────────────────────────────────────────────────

describe("isTBDTeam", () => {
  it("detects placeholder team names", () => {
    expect(_isTBDTeam({ displayName: "Round of 16 1 Winner" })).toBe(true);
    expect(_isTBDTeam({ displayName: "Quarterfinal 2 Winner" })).toBe(true);
    expect(_isTBDTeam({ displayName: "Semifinal 1 Winner" })).toBe(true);
    expect(_isTBDTeam({ displayName: "TBD" })).toBe(true);
    expect(_isTBDTeam({ name: "W1" })).toBe(true);
  });

  it("does not flag real teams", () => {
    expect(_isTBDTeam({ displayName: "Real Madrid" })).toBe(false);
    expect(_isTBDTeam({ displayName: "Liverpool" })).toBe(false);
    expect(_isTBDTeam({ displayName: "Borussia Dortmund" })).toBe(false);
  });
});

// ── Competition detection ───────────────────────────────────────────

describe("competition detection", () => {
  it("classifies leagues correctly", () => {
    expect(getCompetitionMeta("Premier League")?.type).toBe("league");
    expect(getCompetitionMeta("Eredivisie")?.type).toBe("league");
    expect(getCompetitionMeta("Championship")?.type).toBe("league");
  });

  it("classifies hybrid competitions correctly", () => {
    expect(getCompetitionMeta("Champions League")?.type).toBe("hybrid");
    expect(getCompetitionMeta("Europa League")?.type).toBe("hybrid");
    expect(getCompetitionMeta("Conference League")?.type).toBe("hybrid");
  });

  it("classifies cup competitions correctly", () => {
    expect(getCompetitionMeta("FA Cup")?.type).toBe("cup");
    expect(getCompetitionMeta("EFL Cup")?.type).toBe("cup");
  });

  it("returns null for unknown competitions", () => {
    expect(getCompetitionMeta("Unknown League")).toBeNull();
  });

  it("isSoccerCompetition returns true for soccer", () => {
    expect(isSoccerCompetition("Premier League")).toBe(true);
    expect(isSoccerCompetition("Champions League")).toBe(true);
    expect(isSoccerCompetition("FA Cup")).toBe(true);
  });

  it("isSoccerCompetition returns false for other sports", () => {
    expect(isSoccerCompetition("NBA")).toBe(false);
    expect(isSoccerCompetition("NHL")).toBe(false);
  });
});

// ── Round ordering consistency ──────────────────────────────────────

describe("ROUND_ORDER consistency", () => {
  it("has all expected knockout rounds", () => {
    const expectedRounds = [
      "preliminary-round", "first-round", "second-round", "third-round",
      "fourth-round", "fifth-round", "round-of-16", "knockout-round-playoffs",
      "quarterfinals", "semifinals", "final",
    ];
    for (const r of expectedRounds) {
      expect(ROUND_ORDER).toHaveProperty(r);
    }
  });

  it("final is always the highest order", () => {
    const finalOrder = ROUND_ORDER["final"];
    for (const [slug, order] of Object.entries(ROUND_ORDER)) {
      if (slug !== "final") {
        expect(order).toBeLessThan(finalOrder);
      }
    }
  });
});

// ── Helpers ─────────────────────────────────────────────────────────

function makeRow(
  name: string,
  points: number,
  goalDifference: number,
  goalsFor: number,
) {
  return {
    position: 0,
    teamName: name,
    teamLogo: null,
    teamAbbr: name.slice(0, 3).toUpperCase(),
    gamesPlayed: 20,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor,
    goalsAgainst: goalsFor - goalDifference,
    goalDifference,
    points,
  };
}
