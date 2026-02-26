"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlights } from "./highlights";
import { ApiError, fetchMatch, fetchTimeline, fetchLineup, fetchPlayerStats, type LineupResponse, type PlayerStatsResponse } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { useESPNLive } from "@/hooks/use-espn-live";
import {
  formatDate,
  formatTime,
  isLive,
  phaseColor,
  phaseLabel,
  phaseLabelWithClock,
} from "@/lib/utils";
import { TeamLogo } from "./team-logo";
import { ShareButton } from "./share-button";
import { CalendarButton } from "./calendar-button";
import { AnimatedScore } from "./animated-score";
import { MatchForm } from "./match-form";
import { HeadToHead } from "./head-to-head";
import { Lineup } from "./lineup";
import { useTheme } from "@/lib/theme";
import { playGoalSound } from "@/lib/sounds";
import { isSoundEnabled } from "@/lib/notification-settings";
import type { MatchDetailResponse, MatchEvent, TimelineResponse } from "@/lib/types";

// ===========================================================================
// Types
// ===========================================================================

interface MatchDetailProps {
  matchId: string;
  onBack: () => void;
  leagueName?: string;
  /** Whether this match is in the tracker (pinned). */
  pinned?: boolean;
  /** Callback to add/remove this match from the tracker. When provided, a Track/Untrack button is shown. */
  onTogglePin?: (matchId: string) => void;
}

type Tab = "play_by_play" | "player_stats" | "lineup" | "team_stats";

const TAB_LABELS: Record<Tab, string> = {
  play_by_play: "Play-by-Play",
  player_stats: "Player Stats",
  lineup: "Lineup",
  team_stats: "Team Stats",
};

interface ESPNPlay {
  id: string;
  text: string;
  homeScore: number;
  awayScore: number;
  period: { number: number; displayValue: string };
  clock: { displayValue: string };
  scoringPlay: boolean;
  scoreValue: number;
  team?: { id: string; displayName?: string };
  participants?: { athlete: { displayName: string } }[];
  type: { id: string; text: string };
}

interface ESPNTeamStat {
  name: string;
  displayValue: string;
  label: string;
}

interface PlayerStatLine {
  name: string;
  jersey: string;
  position: string;
  stats: Record<string, string | number>;
  starter: boolean;
}

interface TeamPlayerStats {
  teamName: string;
  players: PlayerStatLine[];
  statColumns: string[];
}

interface InjuryEntry {
  name: string;
  position: string;
  jersey: string;
  type: string;
  status: string;
}

/** One substitution: minute, player off, player on. */
export interface SubstitutionEntry {
  minute: string;
  playerOff: string;
  playerOn: string;
  homeAway: "home" | "away";
}

interface ESPNSummaryData {
  plays: ESPNPlay[];
  homeTeamStats: ESPNTeamStat[];
  awayTeamStats: ESPNTeamStat[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  homePlayers: TeamPlayerStats;
  awayPlayers: TeamPlayerStats;
  injuries: { home: InjuryEntry[]; away: InjuryEntry[] };
  sport: string;
  homeFormation?: string;
  awayFormation?: string;
  /** Soccer: substitutions parsed from plays (home and away combined, ordered by time). */
  substitutions?: SubstitutionEntry[];
}

/** Convert backend timeline events to ESPN-style plays for the Play-by-Play tab. */
function backendEventsToPlays(events: MatchEvent[]): ESPNPlay[] {
  const periodLabel = (p: string | null) => (p === "HT" || p === "1" ? "1st" : p === "2" ? "2nd" : p || "1");
  return events.map((e, i) => ({
    id: e.id,
    text: e.detail || e.event_type || "—",
    homeScore: e.score_home ?? 0,
    awayScore: e.score_away ?? 0,
    period: {
      number: typeof e.period === "string" ? (e.period === "HT" ? 1 : parseInt(e.period, 10) || 1) : (e.period ?? 1),
      displayValue: periodLabel(e.period),
    },
    clock: {
      displayValue: e.minute != null ? (e.second != null ? `${e.minute}'${String(e.second).padStart(2, "0")}` : `${e.minute}'`) : "—",
    },
    scoringPlay: /goal|score|gól/i.test(e.event_type || ""),
    scoreValue: 0,
    team: undefined,
    participants: e.player_name ? [{ athlete: { displayName: e.player_name } }] : [],
    type: { id: "", text: e.event_type || "" },
  }));
}

// ===========================================================================
// ESPN League Mapping & Constants
// ===========================================================================

const LEAGUE_ESPN_MAP: Record<string, { sport: string; slug: string }> = {
  // Soccer — all leagues so lineup/summary/player stats work for every soccer match
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  "Europa League": { sport: "soccer", slug: "uefa.europa" },
  "Conference League": { sport: "soccer", slug: "uefa.europa.conf" },
  Championship: { sport: "soccer", slug: "eng.2" },
  "FA Cup": { sport: "soccer", slug: "eng.fa" },
  "EFL Cup": { sport: "soccer", slug: "eng.league_cup" },
  Eredivisie: { sport: "soccer", slug: "ned.1" },
  "Liga Portugal": { sport: "soccer", slug: "por.1" },
  "Turkish Super Lig": { sport: "soccer", slug: "tur.1" },
  "Scottish Premiership": { sport: "soccer", slug: "sco.1" },
  "Saudi Pro League": { sport: "soccer", slug: "sau.1" },
  "Major League Soccer": { sport: "soccer", slug: "usa.1" },
  "UEFA Champions League": { sport: "soccer", slug: "uefa.champions" },
  "UEFA Europa League": { sport: "soccer", slug: "uefa.europa" },
  "UEFA Europa Conference League": { sport: "soccer", slug: "uefa.europa.conf" },
  "English Premier League": { sport: "soccer", slug: "eng.1" },
  "English Championship": { sport: "soccer", slug: "eng.2" },
  // Other sports
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  NFL: { sport: "football", slug: "nfl" },
};

/** Resolve league name to ESPN mapping (exact or fuzzy, e.g. "Major League Soccer" -> MLS). */
function getLeagueMapping(leagueName: string): { sport: string; slug: string } | null {
  if (!leagueName) return null;
  const mapping = LEAGUE_ESPN_MAP[leagueName];
  if (mapping) return mapping;
  const n = leagueName.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const [k, v] of Object.entries(LEAGUE_ESPN_MAP)) {
    const kNorm = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (n === kNorm || n.includes(kNorm) || kNorm.includes(n)) return v;
  }
  return null;
}

const STAT_DISPLAY: Record<string, Record<string, string>> = {
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

const HIGHLIGHT_STATS: Record<string, string[]> = {
  basketball: ["PTS", "REB", "AST"],
  soccer: ["G", "A", "SH", "Goals", "Assists", "Shots", "Saves", "SV"],
  hockey: ["G", "A", "PTS"],
  baseball: ["H", "RBI", "HR"],
  football: ["YDS", "TD", "REC"],
};

/** Soccer player detail: stat keys to show (label, key). */
const SOCCER_PLAYER_DETAIL_STATS = [
  { label: "Matches", keys: [] as string[], fallback: "1" },
  { label: "Goals", keys: ["G", "Goals"] },
  { label: "Assists", keys: ["A", "Assists"] },
  { label: "Shots", keys: ["SH", "Shots"] },
  { label: "Saves", keys: ["SV", "Saves"] },
  { label: "Yellow Cards", keys: ["YC", "Yellow Cards"] },
  { label: "Red Cards", keys: ["RC", "Red Cards"] },
  { label: "Minutes", keys: ["MIN", "Minutes"] },
];

const TEAM_STAT_DISPLAY_ORDER = [
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

// ===========================================================================
// ESPN Data Fetchers
// ===========================================================================

/** Returns true if two team names refer to the same team (flexible match for lineup/ESPN). */
function teamNamesMatch(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const stripSuffix = (s: string) => {
    let out = norm(s);
    for (const suf of ["fc", "cf", "cfc", "sc", "united", "city"]) {
      if (out.endsWith(suf) && out.length > suf.length) out = out.slice(0, -suf.length);
    }
    return out;
  };
  const an = norm(a);
  const bn = norm(b);
  const anAlt = stripSuffix(a);
  const bnAlt = stripSuffix(b);
  if (an === bn || anAlt === bnAlt) return true;
  if (an.includes(bn) || bn.includes(an) || anAlt.includes(bnAlt) || bnAlt.includes(anAlt)) return true;
  if (an.length >= 2 && bn.length >= 2) {
    let i = 0;
    for (const c of an) { i = bn.indexOf(c, i); if (i === -1) break; i += 1; }
    if (i !== -1) return true;
    i = 0;
    for (const c of bn) { i = an.indexOf(c, i); if (i === -1) break; i += 1; }
    if (i !== -1) return true;
  }
  return false;
}

async function findEspnEventId(
  homeTeamName: string, awayTeamName: string, sport: string, slug: string,
): Promise<string | null> {
  try {
    const prefix = sport === "soccer" ? `soccer/${slug}` : `${sport}/${slug}`;
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${prefix}/scoreboard`);
    if (!res.ok) return null;
    const data = await res.json();
    const events: any[] = data.events || [];

    for (const evt of events) {
      const comp = evt.competitions?.[0];
      if (!comp) continue;
      const competitors = comp.competitors || [];
      const homeComp = competitors.find((c: any) => c.homeAway === "home");
      const awayComp = competitors.find((c: any) => c.homeAway === "away");
      if (!homeComp || !awayComp) continue;
      const homeDisplay = homeComp.team?.displayName || homeComp.team?.name || "";
      const awayDisplay = awayComp.team?.displayName || awayComp.team?.name || "";
      const homeShort = homeComp.team?.shortDisplayName || homeComp.team?.abbreviation || "";
      const awayShort = awayComp.team?.shortDisplayName || awayComp.team?.abbreviation || "";
      const homeMatch = teamNamesMatch(homeTeamName, homeDisplay) || teamNamesMatch(homeTeamName, homeShort);
      const awayMatch = teamNamesMatch(awayTeamName, awayDisplay) || teamNamesMatch(awayTeamName, awayShort);
      if (homeMatch && awayMatch) return evt.id;
    }
    return null;
  } catch { return null; }
}

function extractPlayerStats(competitor: any): { players: PlayerStatLine[]; statColumns: string[] } {
  const players: PlayerStatLine[] = [];
  const statColumns: string[] = [];
  const statGroups = competitor.statistics || [];
  if (statGroups.length === 0) return { players, statColumns };

  const primaryGroup = statGroups[0];
  const labels: string[] = primaryGroup.labels || [];
  const athletes: any[] = primaryGroup.athletes || [];
  for (const label of labels) { if (!statColumns.includes(label)) statColumns.push(label); }

  for (const athlete of athletes) {
    const ath = athlete.athlete || {};
    const statsArr: string[] = athlete.stats || [];
    const statsMap: Record<string, string | number> = {};
    labels.forEach((l: string, i: number) => { statsMap[l] = statsArr[i] ?? "-"; });
    players.push({ name: ath.displayName || ath.shortName || "Unknown", jersey: ath.jersey || "", position: ath.position?.abbreviation || "", stats: statsMap, starter: athlete.starter ?? false });
  }

  for (let i = 1; i < statGroups.length; i++) {
    const group = statGroups[i];
    const gl: string[] = group.labels || [];
    const ga: any[] = group.athletes || [];
    for (const l of gl) { if (!statColumns.includes(l)) statColumns.push(l); }
    for (const athlete of ga) {
      const ath = athlete.athlete || {};
      const name = ath.displayName || ath.shortName || "Unknown";
      const existing = players.find((p) => p.name === name);
      const statsArr: string[] = athlete.stats || [];
      if (existing) { gl.forEach((l: string, idx: number) => { existing.stats[l] = statsArr[idx] ?? "-"; }); }
      else {
        const m: Record<string, string | number> = {};
        gl.forEach((l: string, idx: number) => { m[l] = statsArr[idx] ?? "-"; });
        players.push({ name, jersey: ath.jersey || "", position: ath.position?.abbreviation || "", stats: m, starter: athlete.starter ?? false });
      }
    }
  }
  return { players, statColumns };
}

async function fetchESPNSummary(
  homeTeamName: string, awayTeamName: string, leagueName: string,
): Promise<ESPNSummaryData | null> {
  const mapping = getLeagueMapping(leagueName);
  if (!mapping) return null;

  const eventId = await findEspnEventId(homeTeamName, awayTeamName, mapping.sport, mapping.slug);
  if (!eventId) return null;

  try {
    const prefix = mapping.sport === "soccer" ? `soccer/${mapping.slug}` : `${mapping.sport}/${mapping.slug}`;
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${prefix}/summary?event=${eventId}`);
    if (!res.ok) return null;
    const data = await res.json();

    // Plays — ESPN uses different keys by sport: plays, keyEvents, or nested under header.competitions
    const fromHeader = data.header?.competitions?.[0];
    const rawPlays =
      data.plays
      || data.keyEvents
      || (Array.isArray(fromHeader?.plays) ? fromHeader.plays : [])
      || [];
    const plays: ESPNPlay[] = rawPlays.map((p: any) => ({
      id: p.id || "",
      text: p.text || p.shortDescription || p.description || "",
      homeScore: p.homeScore ?? 0,
      awayScore: p.awayScore ?? 0,
      period: p.period || { number: 0, displayValue: "" },
      clock: p.clock || { displayValue: "" },
      scoringPlay: p.scoringPlay ?? false,
      scoreValue: p.scoreValue ?? 0,
      team: p.team ? { id: p.team.id || "", displayName: p.team.displayName || p.team.shortDisplayName || "" } : undefined,
      participants: (p.participants || []).map((pp: any) => ({ athlete: { displayName: pp.athlete?.displayName || "" } })),
      type: p.type || { id: "", text: "" },
    }));

    // Team stats from boxscore
    const boxTeams = data.boxscore?.teams || [];
    const homeTeam = boxTeams.find((t: any) => t.homeAway === "home") || boxTeams[0];
    const awayTeam = boxTeams.find((t: any) => t.homeAway === "away") || boxTeams[1];
    const homeTeamStats: ESPNTeamStat[] = (homeTeam?.statistics || []).map((s: any) => ({
      name: s.name || "", displayValue: s.displayValue || "", label: s.label || "",
    }));
    const awayTeamStats: ESPNTeamStat[] = (awayTeam?.statistics || []).map((s: any) => ({
      name: s.name || "", displayValue: s.displayValue || "", label: s.label || "",
    }));

    // Player stats from boxscore
    const playerGroups = data.boxscore?.players || [];
    const homePlayerComp = playerGroups.find((p: any) => p.homeAway === "home") || playerGroups[0];
    const awayPlayerComp = playerGroups.find((p: any) => p.homeAway === "away") || playerGroups[1];
    const homeExtracted = homePlayerComp ? extractPlayerStats(homePlayerComp) : { players: [], statColumns: [] };
    const awayExtracted = awayPlayerComp ? extractPlayerStats(awayPlayerComp) : { players: [], statColumns: [] };
    const allColumns = Array.from(new Set([...homeExtracted.statColumns, ...awayExtracted.statColumns]));

    // Injuries
    const injuries = { home: [] as InjuryEntry[], away: [] as InjuryEntry[] };
    for (const team of (data.injuries || [])) {
      const side: "home" | "away" = team.homeAway === "home" ? "home" : "away";
      for (const inj of (team.injuries || [])) {
        const ath = inj.athlete || {};
        injuries[side].push({
          name: ath.displayName || ath.shortName || "Unknown",
          position: ath.position?.abbreviation || "",
          jersey: ath.jersey || "",
          type: inj.type?.description || inj.type?.name || "",
          status: inj.status || inj.longComment || "",
        });
      }
    }

    // Competitor names & IDs
    const header = data.header?.competitions?.[0];
    const headerComps = header?.competitors || [];
    const homeComp = headerComps.find((c: any) => c.homeAway === "home");
    const awayComp = headerComps.find((c: any) => c.homeAway === "away");

    // Soccer formation (e.g. "4-3-3") from ESPN summary
    const homeFormation =
      mapping.sport === "soccer"
        ? (homeComp?.formation || homeComp?.formatted || data.boxscore?.teams?.[0]?.formation)
        : undefined;
    const awayFormation =
      mapping.sport === "soccer"
        ? (awayComp?.formation || awayComp?.formatted || data.boxscore?.teams?.[1]?.formation)
        : undefined;

    // Soccer: parse substitutions from plays (need homeComp for homeAway)
    let substitutions: SubstitutionEntry[] | undefined;
    if (mapping.sport === "soccer" && plays.length > 0) {
      const homeId = homeComp?.id || "";
      substitutions = [];
      for (const p of plays) {
        const typeText = (p.type?.text || "").toLowerCase();
        if (!typeText.includes("substitution") && typeText !== "substitution") continue;
        const parts = p.participants || [];
        if (parts.length >= 2) {
          const playerOff = parts[0].athlete?.displayName || "—";
          const playerOn = parts[1].athlete?.displayName || "—";
          const minute = p.clock?.displayValue?.replace(/\s/g, "") || "";
          const homeAway: "home" | "away" = p.team?.id === homeId ? "home" : "away";
          substitutions.push({ minute, playerOff, playerOn, homeAway });
        }
      }
      if (substitutions.length === 0) substitutions = undefined;
    }

    return {
      plays,
      homeTeamStats, awayTeamStats,
      homeTeamName: homeComp?.team?.displayName || homeTeam?.team?.displayName || homeTeamName,
      awayTeamName: awayComp?.team?.displayName || awayTeam?.team?.displayName || awayTeamName,
      homeTeamId: homeComp?.id || homeTeam?.team?.id || "",
      awayTeamId: awayComp?.id || awayTeam?.team?.id || "",
      homePlayers: { teamName: homePlayerComp?.team?.displayName || homeTeamName, players: homeExtracted.players, statColumns: allColumns },
      awayPlayers: { teamName: awayPlayerComp?.team?.displayName || awayTeamName, players: awayExtracted.players, statColumns: allColumns },
      injuries,
      sport: mapping.sport,
      homeFormation: homeFormation || undefined,
      awayFormation: awayFormation || undefined,
      substitutions,
    };
  } catch { return null; }
}

// ===========================================================================
// Main Component
// ===========================================================================

export type SoccerPlayerSelection = {
  player: PlayerStatLine;
  teamName: string;
  teamLogo: string | null;
  side: "home" | "away";
};

export function MatchDetail({ matchId, onBack, leagueName = "", pinned = false, onTogglePin }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("play_by_play");
  const [selectedSoccerPlayer, setSelectedSoccerPlayer] = useState<SoccerPlayerSelection | null>(null);

  const matchFetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data: matchData, loading: matchLoading, lastError: matchError, refresh: refreshMatch } = usePolling<MatchDetailResponse>({
    fetcher: matchFetcher, interval: 15000, key: matchId,
  });

  const { findMatch: findESPN } = useESPNLive(leagueName, 15000);

  // ESPN summary — use league from URL or from match API so play-by-play works without ?league=
  const leagueForESPN = leagueName || matchData?.league?.name || "";
  const espnFetcher = useCallback(async (): Promise<ESPNSummaryData | null> => {
    if (!matchData) return null;
    const { match } = matchData;
    return fetchESPNSummary(match.home_team?.name || "", match.away_team?.name || "", leagueForESPN);
  }, [matchData, leagueForESPN]);

  const { data: espnData, loading: espnLoading } = usePolling<ESPNSummaryData | null>({
    fetcher: espnFetcher, interval: 60000, enabled: !!matchData, key: `espn-${matchId}`,
  });

  // Soccer: show lineup/player_stats tabs when ESPN says soccer or when league is a known soccer league (so we can show Football-Data.org data even if ESPN has none)
  const isSoccerLeague = !!(leagueForESPN && getLeagueMapping(leagueForESPN)?.sport === "soccer");
  const isSoccer = espnData?.sport === "soccer" || isSoccerLeague;
  const tabs: Tab[] = isSoccer ? ["play_by_play", "player_stats", "lineup", "team_stats"] : ["play_by_play", "player_stats", "team_stats"];
  useEffect(() => {
    if (activeTab === "lineup" && !tabs.includes("lineup")) setActiveTab("play_by_play");
  }, [activeTab, isSoccer]);

  const timelineFetcher = useCallback(() => fetchTimeline(matchId), [matchId]);
  const { data: timelineData } = usePolling<TimelineResponse>({
    fetcher: timelineFetcher,
    interval: 15000,
    enabled: !!matchData && (!espnData || (espnData.plays || []).length === 0),
    key: `timeline-${matchId}`,
  });

  // Football-Data.org lineup — fetch for soccer when lineup tab is active (so we can show FD data when ESPN has no lineup)
  const lineupFetcher = useCallback(() => fetchLineup(matchId), [matchId]);
  const { data: lineupData } = usePolling<LineupResponse>({
    fetcher: lineupFetcher,
    interval: 0, // fetch once when enabled
    enabled: activeTab === "lineup" && isSoccer && !!matchId,
    key: `lineup-${matchId}`,
  });

  // Football-Data.org player stats — fetch for soccer when player stats tab is active
  const playerStatsFetcher = useCallback(() => fetchPlayerStats(matchId), [matchId]);
  const { data: playerStatsData } = usePolling<PlayerStatsResponse>({
    fetcher: playerStatsFetcher,
    interval: 0,
    enabled: activeTab === "player_stats" && isSoccer && !!matchId,
    key: `player-stats-${matchId}`,
  });

  const playsForTab = useMemo(() => {
    if (espnData?.plays?.length) return espnData.plays;
    if (timelineData?.events?.length) return backendEventsToPlays(timelineData.events);
    return backendEventsToPlays(matchData?.recent_events || []);
  }, [espnData?.plays, timelineData?.events, matchData?.recent_events]);

  const playByPlayLoading = espnLoading && !espnData && playsForTab.length === 0;

  if (matchLoading && !matchData) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (matchError instanceof ApiError && matchError.status === 404) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-surface-border bg-surface-raised px-6 py-12 text-center">
        <h2 className="text-lg font-bold text-text-primary">Match not found</h2>
        <p className="max-w-sm text-sm text-text-secondary">
          This match doesn&apos;t exist or has been removed. Check the ID or go back to today&apos;s matches.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md bg-accent-green px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-green/90"
        >
          Back to matches
        </button>
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-5 rounded-xl border border-accent-red/25 bg-accent-red/10 px-6 py-8 text-center">
        <p className="text-base font-semibold text-accent-red">Failed to load match</p>
        <p className="text-sm text-text-secondary">
          Check your connection. You can try again or go back to the scoreboard.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => refreshMatch()}
            className="rounded-xl bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-surface-border bg-surface-raised px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-hover active:scale-[0.98]"
          >
            Back to scoreboard
          </button>
        </div>
      </div>
    );
  }

  const { match, state } = matchData;
  const espnLive = findESPN(match.home_team?.name || "", match.away_team?.name || "");
  const backendIsLive = isLive(match.phase);
  const useEspn = espnLive && (!backendIsLive || espnLive.isLive || espnLive.isFinished);
  const effectivePhase = useEspn ? espnLive.phase : match.phase;
  const effectiveClock = useEspn ? espnLive.clock : state?.clock ?? null;
  const effectivePeriod = useEspn ? espnLive.period : state?.period ?? null;
  const effectiveScoreHome = useEspn ? espnLive.homeScore : state?.score_home ?? 0;
  const effectiveScoreAway = useEspn ? espnLive.awayScore : state?.score_away ?? 0;
  const live = isLive(effectivePhase);
  const color = phaseColor(effectivePhase);
  const { theme } = useTheme();
  const bigScoreClass =
    theme === "light"
      ? "font-mono text-5xl font-black text-text-primary md:text-6xl"
      : "font-mono text-5xl font-black text-white md:text-6xl drop-shadow-[0_0_24px_rgba(255,255,255,0.25)] [text-shadow:0_0_30px_rgba(239,68,68,0.35)]";

  return (
    <div className="mx-auto max-w-2xl animate-slide-up">
      <ScoreWatcher scoreHome={effectiveScoreHome} scoreAway={effectiveScoreAway} live={live} />

      {/* Back + Actions */}
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-accent-blue transition-colors hover:bg-surface-hover hover:text-text-primary">
          ← Back to scoreboard
        </button>
        <div className="flex items-center gap-2">
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(matchId)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[12px] font-medium transition-colors ${
                pinned
                  ? "bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25"
                  : "text-text-secondary hover:bg-surface-hover hover:text-accent-blue"
              }`}
              aria-label={pinned ? "Untrack this match" : "Track this match"}
            >
              {pinned ? "★ Tracked" : "☆ Track match"}
            </button>
          )}
          <CalendarButton match={{ id: matchId, phase: effectivePhase, start_time: match.start_time, venue: match.venue, score: { home: effectiveScoreHome, away: effectiveScoreAway }, clock: effectiveClock, period: effectivePeriod, version: 0, home_team: match.home_team as any, away_team: match.away_team as any }} leagueName={leagueName} />
          <ShareButton title={`${match.home_team?.name} vs ${match.away_team?.name}`} text={`${match.home_team?.short_name} ${effectiveScoreHome} - ${effectiveScoreAway} ${match.away_team?.short_name}`} url={`/match/${matchId}`} />
        </div>
      </div>

      {/* Score header */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 text-center md:p-8 ${
          live
            ? theme === "light"
              ? "border-accent-red/30 bg-gradient-to-br from-surface-card via-accent-red/5 to-surface-card shadow-[0_0_20px_rgba(239,68,68,0.08)]"
              : "border-red-500/20 bg-gradient-to-br from-surface-card via-[#1a0f0f] to-surface-card shadow-[0_0_30px_rgba(239,68,68,0.06)]"
            : "border-surface-border bg-surface-card"
        }`}
      >
        {live && <div className="absolute inset-x-0 top-0 h-[2px] animate-shimmer bg-gradient-to-r from-transparent via-red-500 to-transparent" />}
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: live ? "rgba(239,68,68,0.1)" : `${color}15` }}>
          {live && (<div className="relative h-1.5 w-1.5"><div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" /><div className="relative h-1.5 w-1.5 rounded-full bg-red-500" /></div>)}
          <span className="text-[11px] font-bold uppercase tracking-[0.1em]" style={{ color: live ? "#f87171" : color }}>
            {phaseLabelWithClock(effectivePhase, effectiveClock)}{effectiveClock ? ` · ${effectiveClock}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center"><TeamLogo url={match.home_team?.logo_url} name={match.home_team?.short_name} size={56} /></div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.home_team?.name}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">{match.home_team?.short_name}</div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <AnimatedScore
              value={effectiveScoreHome}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
            <span className="text-2xl font-light text-text-muted/40 md:text-3xl">:</span>
            <AnimatedScore
              value={effectiveScoreAway}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
          </div>
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center"><TeamLogo url={match.away_team?.logo_url} name={match.away_team?.short_name} size={56} /></div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.away_team?.name}</div>
            <div className="mt-0.5 text-[11px] text-text-muted">{match.away_team?.short_name}</div>
          </div>
        </div>
        {state?.aggregate_home != null && state?.aggregate_away != null && (
          <div className="mt-3 text-sm font-semibold text-text-muted">
            Aggregate: {state.aggregate_home}-{state.aggregate_away}
          </div>
        )}
        {match.venue && <div className="mt-5 text-[11px] text-text-muted">📍 {match.venue} · {formatDate(match.start_time)} {formatTime(match.start_time)}</div>}
      </div>

      <MatchForm homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} leagueName={leagueName} />
      <HeadToHead homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} homeTeamLogo={match.home_team?.logo_url || null} awayTeamLogo={match.away_team?.logo_url || null} leagueName={leagueName} />
      <Lineup homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} homeTeamLogo={match.home_team?.logo_url || null} awayTeamLogo={match.away_team?.logo_url || null} leagueName={leagueName} />
      <Highlights homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} leagueName={leagueName} matchPhase={match.phase} />

      {/* Tabs: show Lineup only for soccer */}
      <div className="mt-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 rounded-lg py-2 text-[11px] font-semibold uppercase tracking-wider transition-all ${activeTab === tab ? "bg-surface-hover text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"}`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4 animate-fade-in">
        {activeTab === "play_by_play" && (
          <PlayByPlayTab
            plays={playsForTab}
            homeTeamName={espnData?.homeTeamName || match.home_team?.short_name || "Home"}
            awayTeamName={espnData?.awayTeamName || match.away_team?.short_name || "Away"}
            homeTeamId={espnData?.homeTeamId || ""}
            awayTeamId={espnData?.awayTeamId || ""}
            loading={playByPlayLoading}
            live={live}
            phase={effectivePhase}
          />
        )}
        {activeTab === "player_stats" && (
          <PlayerStatsTab
            espnData={espnData}
            playerStatsFallback={playerStatsData ?? null}
            loading={espnLoading && !espnData && !(playerStatsData?.home?.players?.length || playerStatsData?.away?.players?.length)}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            leagueName={leagueForESPN}
            onPlayerClick={espnData?.sport === "soccer" ? (player, teamName, teamLogo, side) => setSelectedSoccerPlayer({ player, teamName, teamLogo, side }) : undefined}
          />
        )}
        {activeTab === "lineup" && isSoccer && (
          <LineupTab
            espnData={espnData}
            fdLineup={lineupData ?? null}
            loading={espnLoading && !espnData && !(lineupData?.home?.lineup?.length || lineupData?.away?.lineup?.length)}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            onPlayerClick={(player, teamName, teamLogo, side) => setSelectedSoccerPlayer({ player, teamName, teamLogo, side })}
          />
        )}
        {activeTab === "team_stats" && (
          <TeamStatsTab
            homeStats={espnData?.homeTeamStats || []}
            awayStats={espnData?.awayTeamStats || []}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={espnData?.homeTeamName || match.home_team?.short_name || "Home"}
            awayTeamName={espnData?.awayTeamName || match.away_team?.short_name || "Away"}
            loading={espnLoading && !espnData}
            live={live}
          />
        )}
      </div>

      {selectedSoccerPlayer && (
        <SoccerPlayerDetailModal
          player={selectedSoccerPlayer.player}
          teamName={selectedSoccerPlayer.teamName}
          teamLogo={selectedSoccerPlayer.teamLogo}
          leagueName={leagueForESPN}
          matchContext={`${match.home_team?.name || "Home"} vs ${match.away_team?.name || "Away"}`}
          onClose={() => setSelectedSoccerPlayer(null)}
        />
      )}
    </div>
  );
}

// ===========================================================================
// ScoreWatcher
// ===========================================================================

function ScoreWatcher({ scoreHome, scoreAway, live }: { scoreHome: number; scoreAway: number; live: boolean }) {
  const prevRef = useRef({ home: -1, away: -1 });
  useEffect(() => {
    const prev = prevRef.current;
    if (prev.home === -1) { prevRef.current = { home: scoreHome, away: scoreAway }; return; }
    if ((scoreHome !== prev.home || scoreAway !== prev.away) && live) { if (isSoundEnabled()) playGoalSound(); }
    prevRef.current = { home: scoreHome, away: scoreAway };
  }, [scoreHome, scoreAway, live]);
  return null;
}

// ===========================================================================
// Tab 1: Play-by-Play (ESPN style)
// ===========================================================================

interface PlayByPlayTabProps {
  plays: ESPNPlay[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  loading: boolean;
  live: boolean;
  phase: string;
}

function PlayByPlayTab({ plays, homeTeamName, awayTeamName, homeTeamId, awayTeamId, loading, live, phase }: PlayByPlayTabProps) {
  const [collapsedPeriods, setCollapsedPeriods] = useState<Set<number>>(new Set());

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-3">
            <div className="h-3 w-10 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-full animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-20 shrink-0 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (plays.length === 0) {
    const isScheduled = phase === "scheduled" || phase === "pre_match";
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">{isScheduled ? "📅" : live ? "⏱" : "🏁"}</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">
          {isScheduled ? "Match Hasn't Started" : live ? "Waiting for Plays..." : "No Play Data Available"}
        </div>
        <div className="text-[12px] text-text-muted">
          {isScheduled ? "Play-by-play will appear once the game begins" : live ? "Events will stream in real time" : "Play-by-play data was not available for this match"}
        </div>
      </div>
    );
  }

  // Group by period, reverse order (latest period first)
  const periodMap = new Map<number, { label: string; plays: ESPNPlay[] }>();
  for (const play of plays) {
    const pNum = play.period.number;
    if (!periodMap.has(pNum)) periodMap.set(pNum, { label: play.period.displayValue || `Period ${pNum}`, plays: [] });
    periodMap.get(pNum)!.plays.push(play);
  }
  const periods = Array.from(periodMap.entries()).sort((a, b) => b[0] - a[0]);
  for (const [, group] of periods) group.plays.reverse();

  const togglePeriod = (pNum: number) => {
    setCollapsedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(pNum)) next.delete(pNum); else next.add(pNum);
      return next;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {periods.map(([pNum, group], gi) => {
        const isCollapsed = collapsedPeriods.has(pNum);
        return (
          <div key={pNum}>
            <button
              onClick={() => togglePeriod(pNum)}
              className={`flex w-full items-center justify-between px-4 py-2.5 transition-colors hover:bg-surface-hover/40 ${gi > 0 ? "border-t border-surface-border" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-widest text-text-primary">{group.label}</span>
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[9px] font-semibold text-text-muted">{group.plays.length} plays</span>
              </div>
              <svg className={`h-3.5 w-3.5 text-text-muted transition-transform ${isCollapsed ? "" : "rotate-180"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {!isCollapsed && group.plays.map((play, i) => {
              const isHome = play.team?.id === homeTeamId;
              const isAway = play.team?.id === awayTeamId;
              const teamAbbr = play.team?.displayName || "";

              return (
                <div
                  key={play.id || `${pNum}-${i}`}
                  className={`flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover/20 ${
                    i < group.plays.length - 1 ? "border-b border-surface-border/30" : ""
                  } ${play.scoringPlay ? "bg-accent-green/[0.04]" : ""}`}
                >
                  <div className="flex w-[52px] shrink-0 items-center gap-2">
                    <div className={`h-1.5 w-1.5 shrink-0 rounded-full ${isHome ? "bg-accent-blue" : isAway ? "bg-accent-red/80" : "bg-surface-border"}`} />
                    <span className="font-mono text-[11px] font-bold text-text-muted">{play.clock.displayValue || "—"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] leading-relaxed text-text-secondary">
                      {play.scoringPlay && <span className="mr-1 text-[10px]">🏀</span>}
                      {play.text}
                    </div>
                  </div>
                  {play.scoringPlay && (
                    <div className="shrink-0 rounded-md bg-surface-hover px-2 py-1 font-mono text-[11px] font-bold text-text-primary">
                      {homeTeamName} {play.homeScore} - {play.awayScore} {awayTeamName}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {live && (
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-[10px] text-text-dim">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
          Live — plays update in real time
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// Tab 2: Player Stats
// ===========================================================================

interface PlayerStatsTabProps {
  espnData: ESPNSummaryData | null;
  playerStatsFallback: PlayerStatsResponse | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  onPlayerClick?: (player: PlayerStatLine, teamName: string, teamLogo: string | null, side: "home" | "away") => void;
}

function PlayerStatsTab({ espnData, playerStatsFallback, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, leagueName, onPlayerClick }: PlayerStatsTabProps) {
  const mapping = getLeagueMapping(leagueName);
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  if (!mapping) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">Player Stats Unavailable</div>
        <div className="text-[12px] text-text-muted">Not supported for this league</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex border-b border-surface-border">
          <div className="flex-1 py-3 text-center"><div className="mx-auto h-3 w-24 animate-pulse rounded bg-surface-hover" /></div>
          <div className="w-px bg-surface-border" />
          <div className="flex-1 py-3 text-center"><div className="mx-auto h-3 w-24 animate-pulse rounded bg-surface-hover" /></div>
        </div>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-2.5">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="flex-1" />
            {Array.from({ length: 5 }).map((_, j) => (<div key={j} className="h-3 w-8 animate-pulse rounded bg-surface-hover" />))}
          </div>
        ))}
      </div>
    );
  }

  const hasEspnPlayers = espnData && (espnData.homePlayers.players.length > 0 || espnData.awayPlayers.players.length > 0);
  const hasFallbackPlayers = playerStatsFallback?.source && (playerStatsFallback.home?.players?.length || playerStatsFallback.away?.players?.length);

  if (!hasEspnPlayers && !hasFallbackPlayers) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">No Player Stats</div>
        <div className="text-[12px] text-text-muted">Player statistics are not yet available for this match</div>
      </div>
    );
  }

  const useFallback = !hasEspnPlayers && hasFallbackPlayers && playerStatsFallback;
  const homeSource = useFallback && playerStatsFallback?.home ? { teamName: playerStatsFallback.home.teamName, players: playerStatsFallback.home.players as PlayerStatLine[], statColumns: playerStatsFallback.home.statColumns } : espnData!.homePlayers;
  const awaySource = useFallback && playerStatsFallback?.away ? { teamName: playerStatsFallback.away.teamName, players: playerStatsFallback.away.players as PlayerStatLine[], statColumns: playerStatsFallback.away.statColumns } : espnData!.awayPlayers;

  const teamData = activeSide === "home" ? homeSource : awaySource;
  const sport = useFallback ? "soccer" : (espnData?.sport || "soccer");
  const highlights = HIGHLIGHT_STATS[sport] || [];
  const displayMap = STAT_DISPLAY[sport] || {};
  const visibleColumns = teamData.statColumns.filter((col) => Object.keys(displayMap).length === 0 || displayMap[col]);

  const handleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(false); }
  };

  const sortedPlayers = [...teamData.players];
  if (sortCol) {
    sortedPlayers.sort((a, b) => {
      const aNum = parseFloat(String(a.stats[sortCol] ?? "").replace(/[^0-9.\-]/g, ""));
      const bNum = parseFloat(String(b.stats[sortCol] ?? "").replace(/[^0-9.\-]/g, ""));
      if (!isNaN(aNum) && !isNaN(bNum)) return sortAsc ? aNum - bNum : bNum - aNum;
      return sortAsc ? String(a.stats[sortCol] ?? "").localeCompare(String(b.stats[sortCol] ?? "")) : String(b.stats[sortCol] ?? "").localeCompare(String(a.stats[sortCol] ?? ""));
    });
  } else {
    sortedPlayers.sort((a, b) => (a.starter === b.starter ? 0 : a.starter ? -1 : 1));
  }

  const starters = sortedPlayers.filter((p) => p.starter);
  const bench = sortedPlayers.filter((p) => !p.starter);
  const injuries = useFallback ? [] : (activeSide === "home" ? espnData!.injuries.home : espnData!.injuries.away);

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {useFallback && (
        <div className="border-b border-surface-border px-3 py-2 text-[11px] text-text-muted">
          Data by {playerStatsFallback?.source === "football_data" ? "Football-Data.org" : playerStatsFallback?.source}
        </div>
      )}
      {/* Team toggle */}
      <div className="flex border-b border-surface-border">
        <button onClick={() => { setActiveSide("home"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-[12px] font-semibold transition-all ${activeSide === "home" ? "border-b-2 border-accent-blue bg-accent-blue/5 text-accent-blue" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={homeTeamLogo} name={homeTeamName} size={18} />
          <span className="truncate">{homeSource.teamName || homeTeamName}</span>
        </button>
        <div className="w-px bg-surface-border" />
        <button onClick={() => { setActiveSide("away"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-[12px] font-semibold transition-all ${activeSide === "away" ? "border-b-2 border-accent-red bg-accent-red/5 text-accent-red" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={awayTeamLogo} name={awayTeamName} size={18} />
          <span className="truncate">{awaySource.teamName || awayTeamName}</span>
        </button>
      </div>

      <TopPerformers
        players={teamData.players}
        highlights={highlights}
        onPlayerSelect={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
      />

      {teamData.players.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-text-muted">Player statistics not yet available</div>
      ) : (
        <div className="overflow-x-auto">
          {starters.length > 0 && (
            <PlayerTable
              label="Starters"
              players={starters}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
          {bench.length > 0 && (
            <PlayerTable
              label="Bench"
              players={bench}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
          {starters.length === 0 && bench.length === 0 && (
            <PlayerTable
              players={sortedPlayers}
              columns={visibleColumns}
              displayMap={displayMap}
              highlights={highlights}
              sortCol={sortCol}
              sortAsc={sortAsc}
              onSort={handleSort}
              onRowClick={onPlayerClick ? (player) => onPlayerClick(player, activeSide === "home" ? homeTeamName : awayTeamName, activeSide === "home" ? homeTeamLogo : awayTeamLogo, activeSide) : undefined}
            />
          )}
        </div>
      )}

      {injuries && injuries.length > 0 && (
        <div className="border-t border-surface-border">
          <div className="bg-surface-hover/30 px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-text-dim">Injuries</div>
          {injuries.map((inj, i) => (
            <div key={`${inj.name}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < injuries.length - 1 ? "border-b border-surface-border/30" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {inj.jersey && <span className="font-mono text-[9px] font-bold text-text-dim">#{inj.jersey}</span>}
                  <span className="text-[12px] font-semibold text-text-primary">{inj.name}</span>
                  {inj.position && <span className="text-[9px] font-semibold text-text-dim">{inj.position}</span>}
                </div>
                {inj.type && <div className="mt-0.5 text-[10px] text-text-muted">{inj.type}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${inj.status.toLowerCase().includes("out") ? "bg-accent-red/10 text-accent-red" : inj.status.toLowerCase().includes("day-to-day") || inj.status.toLowerCase().includes("questionable") ? "bg-accent-amber/10 text-accent-amber" : "bg-surface-hover text-text-muted"}`}>
                {inj.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TopPerformers({ players, highlights, onPlayerSelect }: { players: PlayerStatLine[]; highlights: string[]; onPlayerSelect?: (player: PlayerStatLine) => void }) {
  const topPlayers: { player: PlayerStatLine; stat: string; value: string }[] = [];
  for (const stat of highlights) {
    let best: PlayerStatLine | null = null;
    let bestVal = -Infinity;
    for (const p of players) {
      const raw = p.stats[stat];
      if (raw == null || raw === "-" || raw === "") continue;
      const num = parseFloat(String(raw).replace(/[^0-9.\-]/g, ""));
      if (!isNaN(num) && num > bestVal) { bestVal = num; best = p; }
    }
    if (best && bestVal > 0) topPlayers.push({ player: best, stat, value: String(best.stats[stat]) });
  }
  if (topPlayers.length === 0) return null;

  return (
    <div className="border-b border-surface-border bg-surface-hover/15 px-4 py-3">
      <div className="mb-2 text-[9px] font-bold uppercase tracking-widest text-text-dim">Top Performers</div>
      <div className="flex gap-2.5 overflow-x-auto">
        {topPlayers.map(({ player, stat, value }) => (
          <button
            key={`${player.name}-${stat}`}
            type="button"
            onClick={onPlayerSelect ? () => onPlayerSelect(player) : undefined}
            className={`flex min-w-[110px] items-center gap-2 rounded-lg border border-surface-border/50 bg-surface-card px-3 py-2 text-left transition-colors ${onPlayerSelect ? "cursor-pointer hover:border-accent-blue/40 hover:bg-surface-hover/30" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-text-primary">{player.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-black text-accent-green">{value}</span>
                <span className="text-[9px] font-bold uppercase text-text-dim">{stat}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function PlayerTable({ label, players, columns, displayMap, highlights, sortCol, sortAsc, onSort, onRowClick }: {
  label?: string; players: PlayerStatLine[]; columns: string[]; displayMap: Record<string, string>;
  highlights: string[]; sortCol: string | null; sortAsc: boolean; onSort: (col: string) => void;
  onRowClick?: (player: PlayerStatLine) => void;
}) {
  return (
    <div>
      {label && <div className="bg-surface-hover/30 px-4 py-1.5 text-[9px] font-bold uppercase tracking-widest text-text-dim">{label}</div>}
      <table className="w-full text-[11px]">
        <thead>
          <tr className="border-b border-surface-border text-[9px] font-bold uppercase tracking-wider text-text-dim">
            <th className="sticky left-0 z-10 bg-surface-card px-3 py-2 text-left">Player</th>
            {columns.map((col) => (
              <th key={col} onClick={() => onSort(col)} className={`cursor-pointer whitespace-nowrap px-2 py-2 text-center transition-colors hover:text-text-secondary ${sortCol === col ? "text-accent-blue" : ""} ${highlights.includes(col) ? "text-text-muted" : ""}`}>
                {displayMap[col] || col}{sortCol === col && <span className="ml-0.5">{sortAsc ? "↑" : "↓"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player, i) => (
            <tr
              key={`${player.name}-${i}`}
              className={`transition-colors hover:bg-surface-hover/30 ${i < players.length - 1 ? "border-b border-surface-border/50" : ""} ${onRowClick ? "cursor-pointer" : ""}`}
              onClick={onRowClick ? () => onRowClick(player) : undefined}
            >
              <td className="sticky left-0 z-10 bg-surface-card px-3 py-2">
                <div className="flex items-center gap-1.5">
                  {player.jersey && <span className="font-mono text-[9px] font-bold text-text-dim">#{player.jersey}</span>}
                  <span className="truncate font-medium text-text-primary">{player.name}</span>
                  <span className="text-[8px] font-semibold text-text-dim">{player.position}</span>
                </div>
              </td>
              {columns.map((col) => {
                const val = player.stats[col] ?? "-";
                const isHighlight = highlights.includes(col);
                const numVal = parseFloat(String(val).replace(/[^0-9.\-]/g, ""));
                const isGood = isHighlight && !isNaN(numVal) && numVal > 0;
                return (
                  <td key={col} className={`whitespace-nowrap px-2 py-2 text-center font-mono ${isGood ? "font-bold text-text-primary" : val === "-" || val === "0" ? "text-text-dim" : "text-text-secondary"}`}>
                    {val}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Tab: Lineup (soccer only — pitch, formation, substitutions, bench)
// ===========================================================================

/** Parse "4-2-3-1" -> [1, 4, 2, 3, 1] (GK row optional; we treat first as GK when single). */
function formationToRows(formation: string): number[] {
  const parts = formation.trim().split(/-/).map((s) => parseInt(s.replace(/\D/g, ""), 10)).filter((n) => !isNaN(n) && n > 0);
  if (parts.length === 0) return [1];
  return parts;
}

const POSITION_ORDER: Record<string, number> = { GK: 0, G: 0, D: 1, DF: 1, DEF: 1, M: 2, MF: 2, MID: 2, F: 3, FW: 3, FWD: 3 };

function positionSortKey(pos: string): number {
  const u = pos.toUpperCase();
  for (const [k, v] of Object.entries(POSITION_ORDER)) {
    if (u.includes(k)) return v;
  }
  return 2;
}

/** Split starters into rows by formation. Sort by position (GK, D, M, F) then chunk by formation row counts. */
function startersByFormationRows(starters: PlayerStatLine[], formation: string | undefined): PlayerStatLine[][] {
  if (starters.length === 0) return [];
  const sorted = [...starters].sort((a, b) => positionSortKey(a.position) - positionSortKey(b.position));
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

function getCardFlags(p: PlayerStatLine): { yellow?: boolean; red?: boolean } {
  const yc = p.stats["YC"] ?? p.stats["Yellow Cards"];
  const rc = p.stats["RC"] ?? p.stats["Red Cards"];
  const y = Number(yc) || (String(yc).trim() && String(yc) !== "-" ? 1 : 0);
  const r = Number(rc) || (String(rc).trim() && String(rc) !== "-" ? 1 : 0);
  return { yellow: y > 0, red: r > 0 };
}

function hasScored(p: PlayerStatLine): boolean {
  const g = p.stats["G"] ?? p.stats["Goals"];
  return (Number(g) || 0) > 0;
}

interface LineupTabProps {
  espnData: ESPNSummaryData | null;
  fdLineup: LineupResponse | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  onPlayerClick?: (player: PlayerStatLine, teamName: string, teamLogo: string | null, side: "home" | "away") => void;
}

function LineupTab({ espnData, fdLineup, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, onPlayerClick }: LineupTabProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex border-b border-surface-border">
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
          <div className="w-px bg-surface-border" />
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
        </div>
        <div className="h-64 bg-[#0d3d1a]/20" />
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="flex-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  const hasFdLineup = fdLineup?.source && (fdLineup.home?.lineup?.length || fdLineup.away?.lineup?.length);

  // When ESPN has no data, show Football-Data.org lineup if available (livescores-style data)
  if (!espnData) {
    if (hasFdLineup && fdLineup) {
      const home = fdLineup.home ?? { formation: null, lineup: [], bench: [] };
      const away = fdLineup.away ?? { formation: null, lineup: [], bench: [] };
      return (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-3 py-2 text-[11px] text-text-muted">
            Data by {fdLineup.source === "football_data" ? "Football-Data.org" : fdLineup.source}
          </div>
          <div className="relative bg-[#0d3d1a] text-white" style={{ minHeight: 280 }}>
            <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
            <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
            <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
              {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
              {home.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{home.formation}</span>}
            </div>
            <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-center gap-1 px-3">
              {home.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-[12px]">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-[10px]">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-[10px] opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-center gap-1 px-3">
              {away.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-[12px]">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-[10px]">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-[10px] opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
              {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
              {away.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{away.formation}</span>}
            </div>
          </div>
          {(home.bench?.length > 0 || away.bench?.length > 0) && (
            <div className="border-t border-surface-border bg-surface-card px-4 py-3">
              <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Bench</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                <div>
                  {home.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-[10px] text-text-muted">{p.shirt_number}</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
                <div>
                  {away.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-[10px] text-text-muted">{p.shirt_number}</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">⚽</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">Lineup Unavailable</div>
        <div className="text-[12px] text-text-muted">Match data is not available</div>
      </div>
    );
  }

  const homeStarters = (espnData.homePlayers?.players ?? []).filter((p) => p.starter);
  const awayStarters = (espnData.awayPlayers?.players ?? []).filter((p) => p.starter);
  const homeBench = (espnData.homePlayers?.players ?? []).filter((p) => !p.starter);
  const awayBench = (espnData.awayPlayers?.players ?? []).filter((p) => !p.starter);
  const hasAny = homeStarters.length > 0 || awayStarters.length > 0 || espnData.homeFormation || espnData.awayFormation;

  if (!hasAny && !hasFdLineup) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">⚽</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">No Lineup Data</div>
        <div className="text-[12px] text-text-muted">Formation and starters are not yet available for this match</div>
      </div>
    );
  }

  // Use Football-Data.org lineup when ESPN has none
  if (!hasAny && hasFdLineup && fdLineup) {
    const home = fdLineup.home ?? { formation: null, lineup: [], bench: [] };
    const away = fdLineup.away ?? { formation: null, lineup: [], bench: [] };
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="border-b border-surface-border px-3 py-2 text-[11px] text-text-muted">
          Data by {fdLineup.source === "football_data" ? "Football-Data.org" : fdLineup.source}
        </div>
        <div className="relative bg-[#0d3d1a] text-white" style={{ minHeight: 280 }}>
          <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
          <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
          <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
            {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
            {home.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{home.formation}</span>}
          </div>
          <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-center gap-1 px-3">
            {home.lineup.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center gap-2 text-[12px]">
                {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-[10px]">{p.shirt_number}</span>}
                <span className="truncate">{p.name}</span>
                {p.position && <span className="shrink-0 text-[10px] opacity-80">{p.position}</span>}
              </div>
            ))}
          </div>
          <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-center gap-1 px-3">
            {away.lineup.map((p, i) => (
              <div key={p.id ?? i} className="flex items-center gap-2 text-[12px]">
                {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-[10px]">{p.shirt_number}</span>}
                <span className="truncate">{p.name}</span>
                {p.position && <span className="shrink-0 text-[10px] opacity-80">{p.position}</span>}
              </div>
            ))}
          </div>
          <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
            {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
            <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
            {away.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{away.formation}</span>}
          </div>
        </div>
        {(home.bench?.length > 0 || away.bench?.length > 0) && (
          <div className="border-t border-surface-border bg-surface-card px-4 py-3">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Bench</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
              <div>
                {home.bench?.slice(0, 7).map((p, i) => (
                  <div key={p.id ?? i} className="flex items-center gap-2">
                    {p.shirt_number != null && <span className="w-5 font-mono text-[10px] text-text-muted">{p.shirt_number}</span>}
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
              <div>
                {away.bench?.slice(0, 7).map((p, i) => (
                  <div key={p.id ?? i} className="flex items-center gap-2">
                    {p.shirt_number != null && <span className="w-5 font-mono text-[10px] text-text-muted">{p.shirt_number}</span>}
                    <span className="truncate">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const homeRows = startersByFormationRows(homeStarters, espnData.homeFormation);
  const awayRows = startersByFormationRows(awayStarters, espnData.awayFormation);
  const subs = espnData.substitutions ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {/* Pitch: dark green field, vertical layout — home top, away bottom */}
      <div className="relative bg-[#0d3d1a] text-white" style={{ minHeight: 320 }}>
        {/* White field lines (simplified) */}
        <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
        <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
        <div className="absolute left-1/2 top-0 h-12 w-24 -translate-x-1/2 rounded-b-[2rem] border-2 border-b-0 border-white/50" />
        <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-t-[2rem] border-2 border-t-0 border-white/50" />

        {/* Home team name + formation (top) */}
        <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
          {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
          {espnData.homeFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{espnData.homeFormation}</span>
          )}
        </div>

        {/* Home team players (top half of pitch) */}
        <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-around px-2">
          {homeRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-around gap-1">
              {row.map((p, i) => (
                <LineupPlayerBadge
                  key={p.name ?? i}
                  player={p}
                  onClick={onPlayerClick ? () => onPlayerClick(p, homeTeamName, homeTeamLogo, "home") : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Away team players (bottom half) */}
        <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-around px-2">
          {awayRows.map((row, rowIdx) => (
            <div key={rowIdx} className="flex justify-around gap-1">
              {row.map((p, i) => (
                <LineupPlayerBadge
                  key={p.name ?? i}
                  player={p}
                  onClick={onPlayerClick ? () => onPlayerClick(p, awayTeamName, awayTeamLogo, "away") : undefined}
                />
              ))}
            </div>
          ))}
        </div>

        {/* Away team name + formation (bottom) */}
        <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
          {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-[11px] font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
          {espnData.awayFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[11px] font-bold">{espnData.awayFormation}</span>
          )}
        </div>
      </div>

      {/* Substitutions */}
      {subs.length > 0 && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Substitutions</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {subs.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-[12px]">
                <span className="shrink-0 font-mono text-text-dim">{s.minute}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-red-500/90 text-[8px] text-white">↑</span>
                    <span className="truncate text-text-primary">{s.playerOff}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/90 text-[8px] text-white">↓</span>
                    <span className="truncate text-text-secondary">{s.playerOn}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Substitute players (bench) — two columns */}
      {(homeBench.length > 0 || awayBench.length > 0) && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-secondary">Substitute Players</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="space-y-1.5">
              {homeBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-[12px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-[10px] font-bold text-text-secondary">
                    {p.jersey || "—"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "—"}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {awayBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-[12px]">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-[10px] font-bold text-text-secondary">
                    {p.jersey || "—"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "—"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineupPlayerBadge({ player, onClick }: { player: PlayerStatLine; onClick?: () => void }) {
  const cards = getCardFlags(player);
  const scored = hasScored(player);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center ${onClick ? "cursor-pointer transition-transform hover:scale-105 active:scale-95" : ""}`}
    >
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#1a4d2a] font-mono text-[13px] font-bold text-white shadow">
        {player.jersey || "—"}
        {scored && <span className="absolute -right-0.5 -top-0.5 text-[10px]">⚽</span>}
        {cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-red-500" title="Red card" />}
        {cards.yellow && !cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-amber-400" title="Yellow card" />}
      </div>
      <span className="mt-0.5 max-w-[72px] truncate text-center text-[10px] font-medium text-white/95">{player.name ?? "—"}</span>
    </button>
  );
}

// ===========================================================================
// Soccer Player Detail Modal (LiveScore-style)
// ===========================================================================

interface SoccerPlayerDetailModalProps {
  player: PlayerStatLine;
  teamName: string;
  teamLogo: string | null;
  leagueName: string;
  matchContext: string;
  onClose: () => void;
}

function SoccerPlayerDetailModal({ player, teamName, teamLogo, leagueName, matchContext, onClose }: SoccerPlayerDetailModalProps) {
  const statValue = (keys: string[], fallback?: string): string => {
    if (fallback != null && keys.length === 0) return fallback;
    for (const k of keys) {
      const v = player.stats[k];
      if (v != null && v !== "" && v !== "-") return String(v);
    }
    return "0";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Player stats">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-xl">
        {/* Header — LiveScore style: name, team, #, position */}
        <div className="border-b border-surface-border bg-surface-hover/30 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Close">
              ✕
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-lg font-bold text-text-primary">{player.name}</h2>
              <div className="mt-1 flex items-center justify-center gap-2 text-[13px] text-text-secondary">
                {teamLogo && <img src={teamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
                <span className="truncate">{teamName}</span>
                {player.jersey && <span className="font-mono font-semibold text-text-dim">#{player.jersey}</span>}
                {player.position && <span className="text-text-dim">— {player.position}</span>}
              </div>
            </div>
            <div className="w-8 shrink-0" />
          </div>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          {/* Bio — placeholder for when we have height/age/DOB/country */}
          <section className="mb-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">Bio</h3>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-[12px]">
              <div>
                <div className="text-[10px] font-semibold uppercase text-text-dim">Height</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-text-dim">Age</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase text-text-dim">Country</div>
                <div className="text-text-secondary">—</div>
              </div>
            </div>
          </section>

          {/* This match / League stats — LiveScore style cards */}
          <section className="mb-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-dim">Match stats</h3>
            <p className="mb-3 text-[11px] text-text-muted">{matchContext}</p>
            <div className="grid grid-cols-3 gap-2">
              {SOCCER_PLAYER_DETAIL_STATS.map(({ label, keys, fallback }) => (
                <div key={label} className="rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-center">
                  <div className="font-mono text-xl font-bold text-text-primary">{statValue(keys, fallback)}</div>
                  <div className="mt-0.5 text-[10px] font-semibold uppercase text-text-dim">{label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Overview text — like LiveScore "About" */}
          <p className="text-[12px] leading-relaxed text-text-secondary">
            Statistics for this match. Season totals and club history can be viewed on the official league or team site.
          </p>
        </div>
      </div>
    </div>
  );
}

// ===========================================================================
// Tab 3: Team Stats (ESPN style — pill highlights)
// ===========================================================================

interface TeamStatsTabProps {
  homeStats: ESPNTeamStat[];
  awayStats: ESPNTeamStat[];
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  loading: boolean;
  live: boolean;
}

const EXCLUDED_TEAM_STATS = new Set([
  "teamTurnovers", "totalTurnovers", "technicalFouls", "totalTechnicalFouls",
  "flagrantFouls", "leadChanges", "leadPercentage",
]);

function TeamStatsTab({ homeStats, awayStats, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, loading, live }: TeamStatsTabProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex items-center justify-between border-b border-surface-border px-6 py-3">
          <div className="h-6 w-6 animate-pulse rounded-full bg-surface-hover" />
          <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
          <div className="h-6 w-6 animate-pulse rounded-full bg-surface-hover" />
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between border-b border-surface-border/30 px-6 py-3.5">
            <div className="h-3 w-12 animate-pulse rounded bg-surface-hover" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-surface-hover" />
            <div className="h-3 w-12 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (homeStats.length === 0 && awayStats.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">📊</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">
          {live ? "Waiting for Statistics" : "No Statistics Available"}
        </div>
        <div className="text-[12px] text-text-muted">
          {live ? "Stats will populate as the match progresses" : "Match stats were not available for this game"}
        </div>
      </div>
    );
  }

  // Build stat map keyed by stat name
  const homeMap = new Map(homeStats.map((s) => [s.name, s]));
  const awayMap = new Map(awayStats.map((s) => [s.name, s]));
  const allStatNames = Array.from(new Set([...homeStats.map((s) => s.name), ...awayStats.map((s) => s.name)]));

  // Order: follow preferred order, then append remaining
  const ordered: string[] = [];
  for (const name of TEAM_STAT_DISPLAY_ORDER) {
    if (allStatNames.includes(name) && !EXCLUDED_TEAM_STATS.has(name)) ordered.push(name);
  }
  for (const name of allStatNames) {
    if (!ordered.includes(name) && !EXCLUDED_TEAM_STATS.has(name)) ordered.push(name);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {/* Team logo header */}
      <div className="flex items-center justify-between border-b border-surface-border px-6 py-3">
        <TeamLogo url={homeTeamLogo} name={homeTeamName} size={28} />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-text-dim">Team Stats</span>
        <TeamLogo url={awayTeamLogo} name={awayTeamName} size={28} />
      </div>

      {ordered.map((statName, i) => {
        const home = homeMap.get(statName);
        const away = awayMap.get(statName);
        const hStr = home?.displayValue || "—";
        const aStr = away?.displayValue || "—";
        const label = home?.label || away?.label || statName.replace(/([A-Z])/g, " $1").trim();

        // Parse numeric values for comparison
        const hNum = parseFloat(hStr.replace(/[^0-9.\-]/g, "")) || 0;
        const aNum = parseFloat(aStr.replace(/[^0-9.\-]/g, "")) || 0;
        const homeLeads = hNum > aNum;
        const awayLeads = aNum > hNum;

        return (
          <div key={statName} className={`flex items-center justify-between px-5 py-3 transition-colors hover:bg-surface-hover/15 ${i < ordered.length - 1 ? "border-b border-surface-border/30" : ""}`}>
            <div className="w-[72px]">
              {homeLeads ? (
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-blue px-2.5 py-0.5 font-mono text-[13px] font-bold text-white">{hStr}</span>
              ) : (
                <span className="font-mono text-[13px] font-semibold text-text-primary">{hStr}</span>
              )}
            </div>
            <span className="flex-1 text-center text-[11px] font-medium text-text-secondary">{label}</span>
            <div className="flex w-[72px] justify-end">
              {awayLeads ? (
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-red px-2.5 py-0.5 font-mono text-[13px] font-bold text-white">{aStr}</span>
              ) : (
                <span className="font-mono text-[13px] font-semibold text-text-primary">{aStr}</span>
              )}
            </div>
          </div>
        );
      })}

      {live && (
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-[10px] text-text-dim">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
          Stats update live
        </div>
      )}
    </div>
  );
}
