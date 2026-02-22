"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlights } from "./highlights";
import { fetchMatch, fetchTimeline } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { useESPNLive } from "@/hooks/use-espn-live";
import {
  formatDate,
  formatTime,
  isLive,
  phaseColor,
  phaseLabel,
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
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  NFL: { sport: "football", slug: "nfl" },
};

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

async function findEspnEventId(
  homeTeamName: string, awayTeamName: string, sport: string, slug: string,
): Promise<string | null> {
  try {
    const prefix = sport === "soccer" ? `soccer/${slug}` : `${sport}/${slug}`;
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/${prefix}/scoreboard`);
    if (!res.ok) return null;
    const data = await res.json();
    const events: any[] = data.events || [];
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const homeLower = normalize(homeTeamName);
    const awayLower = normalize(awayTeamName);

    for (const evt of events) {
      const comp = evt.competitions?.[0];
      if (!comp) continue;
      const competitors = comp.competitors || [];
      const names = competitors.map((c: any) => normalize(c.team?.displayName || c.team?.name || ""));
      const shortNames = competitors.map((c: any) => normalize(c.team?.shortDisplayName || c.team?.name || ""));
      const matchesHome = names.some((n: string) => n.includes(homeLower) || homeLower.includes(n)) ||
        shortNames.some((n: string) => n.includes(homeLower) || homeLower.includes(n));
      const matchesAway = names.some((n: string) => n.includes(awayLower) || awayLower.includes(n)) ||
        shortNames.some((n: string) => n.includes(awayLower) || awayLower.includes(n));
      if (matchesHome && matchesAway) return evt.id;
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
  const mapping = LEAGUE_ESPN_MAP[leagueName];
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
    };
  } catch { return null; }
}

// ===========================================================================
// Main Component
// ===========================================================================

export function MatchDetail({ matchId, onBack, leagueName = "" }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("play_by_play");

  const matchFetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const { data: matchData, loading: matchLoading } = usePolling<MatchDetailResponse>({
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

  // When lineup tab is active but current match is not soccer, switch to play_by_play
  const tabs: Tab[] = espnData?.sport === "soccer" ? ["play_by_play", "player_stats", "lineup", "team_stats"] : ["play_by_play", "player_stats", "team_stats"];
  useEffect(() => {
    if (activeTab === "lineup" && !tabs.includes("lineup")) setActiveTab("play_by_play");
  }, [activeTab, espnData?.sport]);

  const timelineFetcher = useCallback(() => fetchTimeline(matchId), [matchId]);
  const { data: timelineData } = usePolling<TimelineResponse>({
    fetcher: timelineFetcher,
    interval: 15000,
    enabled: !!matchData && (!espnData || (espnData.plays || []).length === 0),
    key: `timeline-${matchId}`,
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

  if (!matchData) {
    return (
      <div className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
        Failed to load match
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
            {phaseLabel(effectivePhase)}{effectiveClock ? ` · ${effectiveClock}` : ""}
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
            loading={espnLoading && !espnData}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            leagueName={leagueForESPN}
          />
        )}
        {activeTab === "lineup" && espnData?.sport === "soccer" && (
          <LineupTab
            espnData={espnData}
            loading={espnLoading && !espnData}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
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
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
}

function PlayerStatsTab({ espnData, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, leagueName }: PlayerStatsTabProps) {
  const mapping = LEAGUE_ESPN_MAP[leagueName];
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

  if (!espnData || (espnData.homePlayers.players.length === 0 && espnData.awayPlayers.players.length === 0)) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">No Player Stats</div>
        <div className="text-[12px] text-text-muted">Player statistics are not yet available for this match</div>
      </div>
    );
  }

  const teamData = activeSide === "home" ? espnData.homePlayers : espnData.awayPlayers;
  const highlights = HIGHLIGHT_STATS[espnData.sport] || [];
  const displayMap = STAT_DISPLAY[espnData.sport] || {};
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
  const injuries = activeSide === "home" ? espnData.injuries.home : espnData.injuries.away;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {/* Team toggle */}
      <div className="flex border-b border-surface-border">
        <button onClick={() => { setActiveSide("home"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-[12px] font-semibold transition-all ${activeSide === "home" ? "border-b-2 border-accent-blue bg-accent-blue/5 text-accent-blue" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={homeTeamLogo} name={homeTeamName} size={18} />
          <span className="truncate">{espnData.homePlayers.teamName || homeTeamName}</span>
        </button>
        <div className="w-px bg-surface-border" />
        <button onClick={() => { setActiveSide("away"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-[12px] font-semibold transition-all ${activeSide === "away" ? "border-b-2 border-accent-red bg-accent-red/5 text-accent-red" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={awayTeamLogo} name={awayTeamName} size={18} />
          <span className="truncate">{espnData.awayPlayers.teamName || awayTeamName}</span>
        </button>
      </div>

      <TopPerformers players={teamData.players} highlights={highlights} />

      {teamData.players.length === 0 ? (
        <div className="py-8 text-center text-[12px] text-text-muted">Player statistics not yet available</div>
      ) : (
        <div className="overflow-x-auto">
          {starters.length > 0 && <PlayerTable label="Starters" players={starters} columns={visibleColumns} displayMap={displayMap} highlights={highlights} sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />}
          {bench.length > 0 && <PlayerTable label="Bench" players={bench} columns={visibleColumns} displayMap={displayMap} highlights={highlights} sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />}
          {starters.length === 0 && bench.length === 0 && <PlayerTable players={sortedPlayers} columns={visibleColumns} displayMap={displayMap} highlights={highlights} sortCol={sortCol} sortAsc={sortAsc} onSort={handleSort} />}
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

function TopPerformers({ players, highlights }: { players: PlayerStatLine[]; highlights: string[] }) {
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
          <div key={`${player.name}-${stat}`} className="flex min-w-[110px] items-center gap-2 rounded-lg border border-surface-border/50 bg-surface-card px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-text-primary">{player.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-black text-accent-green">{value}</span>
                <span className="text-[9px] font-bold uppercase text-text-dim">{stat}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlayerTable({ label, players, columns, displayMap, highlights, sortCol, sortAsc, onSort }: {
  label?: string; players: PlayerStatLine[]; columns: string[]; displayMap: Record<string, string>;
  highlights: string[]; sortCol: string | null; sortAsc: boolean; onSort: (col: string) => void;
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
            <tr key={`${player.name}-${i}`} className={`transition-colors hover:bg-surface-hover/30 ${i < players.length - 1 ? "border-b border-surface-border/50" : ""}`}>
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
// Tab: Lineup (soccer only — formation + starters)
// ===========================================================================

interface LineupTabProps {
  espnData: ESPNSummaryData | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
}

function LineupTab({ espnData, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName }: LineupTabProps) {
  if (loading) {
    return (
      <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
        <div className="flex border-b border-surface-border">
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
          <div className="w-px bg-surface-border" />
          <div className="flex-1 py-4 text-center"><div className="mx-auto h-4 w-28 animate-pulse rounded bg-surface-hover" /></div>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-surface-border/30 px-4 py-2.5">
            <div className="h-3 w-20 animate-pulse rounded bg-surface-hover" />
            <div className="flex-1" />
            <div className="h-3 w-16 animate-pulse rounded bg-surface-hover" />
          </div>
        ))}
      </div>
    );
  }

  if (!espnData) {
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
  const hasAny = homeStarters.length > 0 || awayStarters.length > 0 || espnData.homeFormation || espnData.awayFormation;

  if (!hasAny) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">⚽</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">No Lineup Data</div>
        <div className="text-[12px] text-text-muted">Formation and starters are not yet available for this match</div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="grid grid-cols-2 gap-0 border-b border-surface-border">
        {/* Home */}
        <div className="border-r border-surface-border p-4">
          <div className="mb-3 flex items-center gap-2">
            {homeTeamLogo ? (
              <img src={homeTeamLogo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-full bg-surface-hover" />
            )}
            <span className="truncate text-[13px] font-semibold text-text-primary">{homeTeamName}</span>
            {espnData.homeFormation && (
              <span className="ml-auto rounded-md bg-surface-hover px-2 py-0.5 font-mono text-[11px] font-bold text-text-primary">
                {espnData.homeFormation}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {homeStarters.map((p, i) => (
              <li key={p.name ?? i} className="flex items-center gap-2 text-[12px]">
                {p.jersey != null && <span className="w-6 font-mono text-[10px] font-bold text-text-dim">#{p.jersey}</span>}
                <span className="truncate text-text-primary">{p.name ?? "—"}</span>
                {p.position && <span className="shrink-0 text-[10px] text-text-dim">{p.position}</span>}
              </li>
            ))}
          </ul>
        </div>
        {/* Away */}
        <div className="p-4">
          <div className="mb-3 flex items-center gap-2">
            {awayTeamLogo ? (
              <img src={awayTeamLogo} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="h-6 w-6 shrink-0 rounded-full bg-surface-hover" />
            )}
            <span className="truncate text-[13px] font-semibold text-text-primary">{awayTeamName}</span>
            {espnData.awayFormation && (
              <span className="ml-auto rounded-md bg-surface-hover px-2 py-0.5 font-mono text-[11px] font-bold text-text-primary">
                {espnData.awayFormation}
              </span>
            )}
          </div>
          <ul className="space-y-1.5">
            {awayStarters.map((p, i) => (
              <li key={p.name ?? i} className="flex items-center gap-2 text-[12px]">
                {p.jersey != null && <span className="w-6 font-mono text-[10px] font-bold text-text-dim">#{p.jersey}</span>}
                <span className="truncate text-text-primary">{p.name ?? "—"}</span>
                {p.position && <span className="shrink-0 text-[10px] text-text-dim">{p.position}</span>}
              </li>
            ))}
          </ul>
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
