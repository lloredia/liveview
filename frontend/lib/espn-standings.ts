import type {
  CompetitionType,
  StandingsRow,
  StandingsGroup,
  StandingsResult,
  KnockoutTeam,
  KnockoutLeg,
  KnockoutTie,
  KnockoutRound,
  KnockoutBracket,
} from "./types";

// ── Competition map ─────────────────────────────────────────────────

interface CompetitionMeta {
  espnLeague: string;
  type: CompetitionType;
}

export const SOCCER_COMPETITION_MAP: Record<string, CompetitionMeta> = {
  "Premier League":      { espnLeague: "eng.1",              type: "league" },
  "La Liga":             { espnLeague: "esp.1",              type: "league" },
  "Bundesliga":          { espnLeague: "ger.1",              type: "league" },
  "Serie A":             { espnLeague: "ita.1",              type: "league" },
  "Ligue 1":             { espnLeague: "fra.1",              type: "league" },
  "MLS":                 { espnLeague: "usa.1",              type: "league" },
  "Eredivisie":          { espnLeague: "ned.1",              type: "league" },
  "Liga Portugal":       { espnLeague: "por.1",              type: "league" },
  "Turkish Super Lig":   { espnLeague: "tur.1",              type: "league" },
  "Scottish Premiership":{ espnLeague: "sco.1",              type: "league" },
  "Saudi Pro League":    { espnLeague: "sau.1",              type: "league" },
  "Championship":        { espnLeague: "eng.2",              type: "league" },
  "Champions League":    { espnLeague: "uefa.champions",     type: "hybrid" },
  "Europa League":       { espnLeague: "uefa.europa",        type: "hybrid" },
  "Conference League":   { espnLeague: "uefa.europa.conf",   type: "hybrid" },
  "FA Cup":              { espnLeague: "eng.fa",             type: "cup" },
  "EFL Cup":             { espnLeague: "eng.league_cup",     type: "cup" },
};

/** Non-soccer leagues for the existing standings path */
export const OTHER_STANDINGS_MAP: Record<string, { sport: string; league: string }> = {
  "NBA":   { sport: "basketball", league: "nba" },
  "WNBA":  { sport: "basketball", league: "wnba" },
  "NCAAM": { sport: "basketball", league: "mens-college-basketball" },
  "NCAAW": { sport: "basketball", league: "womens-college-basketball" },
  "NHL":   { sport: "hockey",     league: "nhl" },
  "MLB":   { sport: "baseball",   league: "mlb" },
};

export function getCompetitionMeta(leagueName: string): CompetitionMeta | null {
  return SOCCER_COMPETITION_MAP[leagueName] ?? null;
}

export function isSoccerCompetition(leagueName: string): boolean {
  return leagueName in SOCCER_COMPETITION_MAP;
}

// ── ESPN API base URLs ──────────────────────────────────────────────

const ESPN_V2 = "/api/espn/v2";
const ESPN_SITE = "/api/espn/site";

// ── Table standings ─────────────────────────────────────────────────

function parseStandingsEntry(entry: Record<string, unknown>): StandingsRow {
  const team = (entry.team ?? {}) as Record<string, unknown>;
  const statsArr = (entry.stats ?? []) as Array<{ name: string; value: unknown }>;
  const stats: Record<string, number> = {};
  for (const s of statsArr) {
    stats[s.name] = Number(s.value) || 0;
  }

  return {
    position: 0,
    teamName: (team.displayName as string) || (team.name as string) || "Unknown",
    teamLogo: ((team.logos as Array<{ href: string }>) ?? [])[0]?.href ?? null,
    teamAbbr: (team.abbreviation as string) || "",
    gamesPlayed: stats["gamesPlayed"] ?? stats["GP"] ?? 0,
    wins: stats["wins"] ?? stats["W"] ?? 0,
    draws: stats["ties"] ?? stats["draws"] ?? stats["D"] ?? stats["T"] ?? 0,
    losses: stats["losses"] ?? stats["L"] ?? 0,
    goalsFor: stats["pointsFor"] ?? stats["PF"] ?? stats["goalsFor"] ?? 0,
    goalsAgainst: stats["pointsAgainst"] ?? stats["PA"] ?? stats["goalsAgainst"] ?? 0,
    goalDifference: stats["pointDifferential"] ?? stats["goalDifference"] ?? stats["differential"] ?? 0,
    points: stats["points"] ?? stats["PTS"] ?? stats["OVWins"] ?? 0,
  };
}

function rankRows(rows: StandingsRow[]): StandingsRow[] {
  const sorted = [...rows].sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.teamName.localeCompare(b.teamName),
  );
  sorted.forEach((r, i) => (r.position = i + 1));
  return sorted;
}

export async function fetchSoccerStandings(espnLeague: string): Promise<StandingsResult> {
  const url = `${ESPN_V2}/soccer/${espnLeague}/standings`;
  const res = await fetch(url);
  if (!res.ok) return { groups: [], competitionName: "", fetchedAt: Date.now() };

  const data = await res.json();
  const competitionName = data.name ?? "";
  const groups: StandingsGroup[] = [];

  const children = (data.children ?? []) as Array<Record<string, unknown>>;
  if (children.length > 0) {
    for (const child of children) {
      const childStandings = child.standings as Record<string, unknown> | undefined;
      const entries = ((childStandings?.entries ?? []) as Array<Record<string, unknown>>);
      const rows = entries.map(parseStandingsEntry);
      groups.push({
        name: (child.name as string) || "Overall",
        rows: rankRows(rows),
      });
    }
  }

  if (groups.length === 0) {
    const topEntries = ((data.standings?.entries ?? []) as Array<Record<string, unknown>>);
    if (topEntries.length > 0) {
      groups.push({
        name: "Overall",
        rows: rankRows(topEntries.map(parseStandingsEntry)),
      });
    }
  }

  return { groups, competitionName, fetchedAt: Date.now() };
}

/** Fetch standings for non-soccer sports (existing behaviour preserved) */
export async function fetchOtherStandings(
  sport: string,
  league: string,
): Promise<StandingsRow[]> {
  const url = `${ESPN_V2}/${sport}/${league}/standings`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = await res.json();
  const rows: StandingsRow[] = [];

  const groups = (data.children ?? []) as Array<Record<string, unknown>>;
  for (const group of groups) {
    const gs = group.standings as Record<string, unknown> | undefined;
    const entries = ((gs?.entries ?? []) as Array<Record<string, unknown>>);
    for (const entry of entries) rows.push(parseStandingsEntry(entry));
  }
  if (rows.length === 0) {
    const entries = ((data.standings?.entries ?? []) as Array<Record<string, unknown>>);
    for (const entry of entries) rows.push(parseStandingsEntry(entry));
  }

  return rankRows(rows);
}

// ── Knockout bracket ────────────────────────────────────────────────

const ROUND_ORDER: Record<string, number> = {
  "preliminary-round": 0,
  "first-round": 1,
  "second-round": 2,
  "third-round": 3,
  "fourth-round": 4,
  "fifth-round": 5,
  "sixth-round": 6,
  "round-of-32": 7,
  "knockout-round-playoffs": 8,
  "round-of-16": 9,
  "quarterfinals": 10,
  "semifinals": 11,
  "final": 12,
};

const ROUND_DISPLAY: Record<string, string> = {
  "preliminary-round": "Preliminary Round",
  "first-round": "First Round",
  "second-round": "Second Round",
  "third-round": "Third Round",
  "fourth-round": "Fourth Round",
  "fifth-round": "Fifth Round",
  "sixth-round": "Sixth Round",
  "round-of-32": "Round of 32",
  "knockout-round-playoffs": "Playoff Round",
  "round-of-16": "Round of 16",
  "quarterfinals": "Quarter-finals",
  "semifinals": "Semi-finals",
  "final": "Final",
};

/** Non-knockout slugs to ignore when building brackets */
const LEAGUE_PHASE_SLUGS = new Set([
  "league-phase", "league", "group-stage", "regular-season",
]);

function isKnockoutSlug(slug: string): boolean {
  if (LEAGUE_PHASE_SLUGS.has(slug)) return false;
  return slug in ROUND_ORDER || slug.includes("round") || slug.includes("final") || slug.includes("quarter") || slug.includes("semi");
}

function getRoundOrder(slug: string): number {
  return ROUND_ORDER[slug] ?? 99;
}

function getRoundDisplayName(slug: string, seriesTitle?: string): string {
  return ROUND_DISPLAY[slug] ?? seriesTitle ?? slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function isTBDTeam(team: Record<string, unknown>): boolean {
  const name = (team.displayName as string) || (team.name as string) || "";
  return /winner|tbd|tba|\bW\d/i.test(name) || name.includes("Round of 16") || name.includes("Quarterfinal") || name.includes("Semifinal");
}

function parseKnockoutTeam(competitor: Record<string, unknown>): KnockoutTeam {
  const team = (competitor.team ?? {}) as Record<string, unknown>;
  const name = (team.displayName as string) || (team.name as string) || "TBD";
  return {
    id: (competitor.id as string) || (team.id as string) || "",
    name,
    abbreviation: (team.abbreviation as string) || name.slice(0, 3).toUpperCase(),
    logo:
      (team.logo as string) ||
      ((team.logos as Array<{ href: string }>) ?? [])[0]?.href ||
      null,
    isTBD: isTBDTeam(team),
  };
}

function buildSeasonDateRange(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  // European soccer season spans Aug -> Jun
  const startYear = month >= 7 ? year : year - 1;
  const start = `${startYear}0801`;
  const end = `${startYear + 1}0731`;
  return `${start}-${end}`;
}

export async function fetchKnockoutBracket(
  espnLeague: string,
  leagueName: string,
): Promise<KnockoutBracket> {
  const dateRange = buildSeasonDateRange();
  const url = `${ESPN_SITE}/soccer/${espnLeague}/scoreboard?limit=300&dates=${dateRange}`;

  const res = await fetch(url);
  if (!res.ok) return { rounds: [], competitionName: leagueName, fetchedAt: Date.now() };

  const data = await res.json();
  const events = (data.events ?? []) as Array<Record<string, unknown>>;

  // Group events by round slug
  const roundMap = new Map<string, { events: Array<Record<string, unknown>>; seriesTitle: string }>();

  for (const event of events) {
    const season = (event.season ?? {}) as Record<string, unknown>;
    const slug = (season.slug as string) || "";
    if (!slug || !isKnockoutSlug(slug)) continue;

    const comp = ((event.competitions ?? []) as Array<Record<string, unknown>>)[0];
    if (!comp) continue;

    const series = (comp.series ?? {}) as Record<string, unknown>;
    const seriesTitle = (series.title as string) || "";

    if (!roundMap.has(slug)) {
      roundMap.set(slug, { events: [], seriesTitle });
    }
    roundMap.get(slug)!.events.push(event);
  }

  // Build rounds
  const rounds: KnockoutRound[] = [];

  for (const [slug, { events: roundEvents, seriesTitle }] of Array.from(roundMap.entries())) {
    // Group events into ties by the pair of team IDs
    const tieMap = new Map<string, KnockoutLeg[]>();

    for (const event of roundEvents) {
      const comp = ((event.competitions ?? []) as Array<Record<string, unknown>>)[0];
      if (!comp) continue;

      const competitors = (comp.competitors ?? []) as Array<Record<string, unknown>>;
      if (competitors.length < 2) continue;

      const legInfo = (comp.leg ?? {}) as Record<string, unknown>;
      const legNum = (legInfo.value as number) || 1;
      const status = (comp.status ?? {}) as Record<string, unknown>;
      const statusType = (status.type ?? {}) as Record<string, unknown>;
      const statusName = (statusType.name as string) || "STATUS_SCHEDULED";
      const statusDetail = (statusType.detail as string) || (statusType.shortDetail as string) || "";

      const homeComp = competitors.find((c) => (c.homeAway as string) === "home") ?? competitors[0];
      const awayComp = competitors.find((c) => (c.homeAway as string) === "away") ?? competitors[1];

      const homeTeam = parseKnockoutTeam(homeComp);
      const awayTeam = parseKnockoutTeam(awayComp);

      const leg: KnockoutLeg = {
        eventId: (event.id as string) || "",
        date: (event.date as string) || "",
        homeTeam,
        awayTeam,
        homeScore: Number((homeComp.score as string) || 0),
        awayScore: Number((awayComp.score as string) || 0),
        status: statusName,
        statusDetail,
        legNumber: legNum,
      };

      // Build a stable tie key from sorted team IDs (using series competitors or fallback)
      const series = (comp.series ?? {}) as Record<string, unknown>;
      const seriesComps = (series.competitors ?? []) as Array<Record<string, unknown>>;
      let tieKey: string;
      if (seriesComps.length >= 2) {
        const ids = seriesComps.map(sc => (sc.id as string) || "").sort();
        tieKey = ids.join("-");
      } else {
        const ids = [homeTeam.id, awayTeam.id].sort();
        tieKey = ids.join("-");
      }

      if (!tieMap.has(tieKey)) tieMap.set(tieKey, []);
      tieMap.get(tieKey)!.push(leg);
    }

    // Convert tie map to KnockoutTie[]
    const ties: KnockoutTie[] = [];
    for (const legs of Array.from(tieMap.values())) {
      legs.sort((a: KnockoutLeg, b: KnockoutLeg) => a.legNumber - b.legNumber);
      const isTwoLegged = legs.length === 2 || legs.some((l: KnockoutLeg) => l.legNumber === 2);

      // Determine team A and B consistently from leg 1
      const firstLeg = legs[0];
      const teamA = firstLeg.homeTeam;
      const teamB = firstLeg.awayTeam;

      // Extract aggregate + winner from the last completed event
      let aggregateA: number | null = null;
      let aggregateB: number | null = null;
      let winner: "A" | "B" | null = null;
      let completed = false;

      const lastLeg = legs[legs.length - 1];
      const lastEvent = roundEvents.find((e: Record<string, unknown>) => (e.id as string) === lastLeg.eventId);
      if (lastEvent) {
        const comp = ((lastEvent.competitions ?? []) as Array<Record<string, unknown>>)[0];
        const series = ((comp?.series ?? {}) as Record<string, unknown>);
        const seriesComps = (series.competitors ?? []) as Array<Record<string, unknown>>;
        completed = (series.completed as boolean) || false;

        if (seriesComps.length >= 2 && isTwoLegged) {
          for (const sc of seriesComps) {
            const scId = (sc.id as string) || "";
            const agg = sc.aggregateScore as number | undefined;
            if (scId === teamA.id && agg != null) aggregateA = agg;
            else if (scId === teamB.id && agg != null) aggregateB = agg;
            if ((sc.winner as boolean) && scId === teamA.id) winner = "A";
            else if ((sc.winner as boolean) && scId === teamB.id) winner = "B";
          }
        }

        // For single-leg ties, winner = team with more goals (if finished)
        if (!isTwoLegged && lastLeg.status === "STATUS_FULL_TIME") {
          completed = true;
          if (lastLeg.homeScore > lastLeg.awayScore) {
            winner = lastLeg.homeTeam.id === teamA.id ? "A" : "B";
          } else if (lastLeg.awayScore > lastLeg.homeScore) {
            winner = lastLeg.awayTeam.id === teamA.id ? "A" : "B";
          }
        }
      }

      ties.push({
        teamA,
        teamB,
        legs,
        aggregateA,
        aggregateB,
        winner,
        completed,
        isTwoLegged,
      });
    }

    rounds.push({
      slug,
      displayName: getRoundDisplayName(slug, seriesTitle),
      order: getRoundOrder(slug),
      ties,
    });
  }

  rounds.sort((a, b) => a.order - b.order);

  return { rounds, competitionName: leagueName, fetchedAt: Date.now() };
}

// ── Re-exports for test access ──────────────────────────────────────

export {
  parseStandingsEntry as _parseStandingsEntry,
  rankRows as _rankRows,
  isKnockoutSlug as _isKnockoutSlug,
  getRoundOrder as _getRoundOrder,
  getRoundDisplayName as _getRoundDisplayName,
  isTBDTeam as _isTBDTeam,
  ROUND_ORDER,
  ROUND_DISPLAY,
};
