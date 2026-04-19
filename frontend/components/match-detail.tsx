"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Highlights } from "./highlights";
import { ApiError, fetchMatch, fetchMatchDetails, type LineupResponse, type MatchCenterDetailsResponse } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
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
import { AnimatedScore } from "./animated-score";
import { MatchForm } from "./match-form";
import { HeadToHead } from "./head-to-head";
import { useTheme } from "@/lib/theme";
import { playGoalSound } from "@/lib/sounds";
import { isSoundEnabled } from "@/lib/notification-settings";
import type { MatchDetailResponse, MatchEvent, MatchStatsResponse } from "@/lib/types";
import { LEAGUE_ESPN } from "@/lib/league-map";

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
  /** When this value changes, trigger a refetch (e.g. from pull-to-refresh). */
  refreshTrigger?: number;
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
  team?: { id: string; displayName?: string } | null;
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

// Canonical state — authoritative. Source: backend API only. Never overwritten by ESPN.
export interface CanonicalMatchState {
  phase: "scheduled" | "live" | "break" | "finished" | "postponed" | "cancelled" | string;
  score_home: number;
  score_away: number;
  clock: string | null;
  period: string | null;
  version: number;
}

// Supplementary state — display-only extras. Source: ESPN (or backend timeline) only. Never affects score/phase.
interface MatchCenterPlayByPlaySection {
  plays: ESPNPlay[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  loading: boolean;
}

interface MatchCenterPlayerStatsSection {
  source: string | null;
  sport: string;
  home: TeamPlayerStats;
  away: TeamPlayerStats;
  injuries: { home: InjuryEntry[]; away: InjuryEntry[] };
}

interface MatchCenterLineupSection {
  source: string | null;
  homeFormation?: string | null;
  awayFormation?: string | null;
  homeStarters: PlayerStatLine[];
  awayStarters: PlayerStatLine[];
  homeBench: PlayerStatLine[];
  awayBench: PlayerStatLine[];
  substitutions: SubstitutionEntry[];
  fallback: LineupResponse | null;
}

interface MatchCenterTeamStatsSection {
  homeStats: ESPNTeamStat[];
  awayStats: ESPNTeamStat[];
  homeTeamName: string;
  awayTeamName: string;
  loading: boolean;
}

/** Convert backend timeline events to ESPN-style plays for the Play-by-Play tab. */
function backendEventsToPlays(events: MatchEvent[]): ESPNPlay[] {
  const periodLabel = (p: string | null) => (p === "1" ? "1st" : p === "2" ? "2nd" : p || "1");
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

function formatBackendStatLabel(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function backendStatsToDisplay(
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

// ===========================================================================
// ESPN League Mapping & Constants
// ===========================================================================

/** Resolve league name to ESPN mapping (exact or fuzzy, e.g. "Major League Soccer" -> MLS). */
function getLeagueMapping(leagueName: string): { sport: string; slug: string } | null {
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
// Main Component
// ===========================================================================

export type SoccerPlayerSelection = {
  player: PlayerStatLine;
  teamName: string;
  teamLogo: string | null;
  side: "home" | "away";
};

export function MatchDetail({ matchId, onBack, leagueName = "", pinned = false, onTogglePin, refreshTrigger }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("play_by_play");
  const [selectedSoccerPlayer, setSelectedSoccerPlayer] = useState<SoccerPlayerSelection | null>(null);

  const matchFetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const detailsFetcher = useCallback(() => fetchMatchDetails(matchId), [matchId]);
  const {
    data: detailsData,
    loading: detailsLoading,
    refresh: refreshDetails,
  } = usePolling<MatchCenterDetailsResponse>({
    fetcher: detailsFetcher,
    interval: 15000,
    intervalWhenHidden: 45000,
    enabled: true,
    key: `match-details-${matchId}`,
  });
  const headerData = detailsData?.header ?? null;
  const matchPollingEnabled = !headerData;
  const { data: matchData, loading: matchLoading, lastError: matchError, refresh: refreshMatch } = usePolling<MatchDetailResponse>({
    fetcher: matchFetcher, interval: 15000, enabled: matchPollingEnabled, key: matchId,
  });

  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0) {
      refreshMatch();
      refreshDetails();
    }
  }, [refreshTrigger, refreshDetails, refreshMatch]);

  const leagueForESPN = leagueName || headerData?.league?.name || matchData?.league?.name || "";

  // Soccer: show lineup/player_stats tabs when ESPN says soccer or when league is a known soccer league (so we can show Football-Data.org data even if ESPN has none)
  const isSoccerLeague = !!(leagueForESPN && getLeagueMapping(leagueForESPN)?.sport === "soccer");
  const isSoccer = isSoccerLeague;
  const tabs: Tab[] = isSoccer ? ["play_by_play", "player_stats", "lineup", "team_stats"] : ["play_by_play", "player_stats", "team_stats"];
  useEffect(() => {
    if (activeTab === "lineup" && !tabs.includes("lineup")) setActiveTab("play_by_play");
  }, [activeTab, isSoccer]);
  const backendSections = detailsData?.sections ?? null;
  const detailSections: {
    playByPlay: MatchCenterPlayByPlaySection;
    playerStats: MatchCenterPlayerStatsSection | null;
    lineup: MatchCenterLineupSection | null;
    teamStats: MatchCenterTeamStatsSection;
  } = useMemo(() => {
    let normalizedPlayerStats: MatchCenterPlayerStatsSection | null = null;
    if (backendSections?.playerStats?.home && backendSections.playerStats?.away) {
      normalizedPlayerStats = {
        source: backendSections.playerStats.source,
        sport: backendSections.playerStats.sport || "soccer",
        home: backendSections.playerStats.home,
        away: backendSections.playerStats.away,
        injuries: backendSections.playerStats.injuries,
      };
    }

    return {
      playByPlay: backendSections?.playByPlay ?? {
        plays: [],
        homeTeamName: headerData?.match.home_team?.short_name || matchData?.match.home_team?.short_name || "Home",
        awayTeamName: headerData?.match.away_team?.short_name || matchData?.match.away_team?.short_name || "Away",
        homeTeamId: headerData?.match.home_team?.id || matchData?.match.home_team?.id || "",
        awayTeamId: headerData?.match.away_team?.id || matchData?.match.away_team?.id || "",
        loading: detailsLoading,
      },
      playerStats: normalizedPlayerStats,
      lineup: backendSections?.lineup ?? null,
      teamStats: backendSections?.teamStats ?? {
        homeStats: [],
        awayStats: [],
        homeTeamName: headerData?.match.home_team?.short_name || matchData?.match.home_team?.short_name || "Home",
        awayTeamName: headerData?.match.away_team?.short_name || matchData?.match.away_team?.short_name || "Away",
        loading: detailsLoading,
      },
    };
  }, [backendSections, detailsLoading, headerData, matchData]);

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

  const match = headerData?.match ?? matchData.match;
  const state = headerData?.state ?? matchData.state;

  // Canonical state — backend API only. Governs score, phase, clock, period. Never overwritten by ESPN.
  const canonical: CanonicalMatchState = {
    phase: match.phase ?? "scheduled",
    score_home: state?.score_home ?? 0,
    score_away: state?.score_away ?? 0,
    clock: state?.clock ?? null,
    period: state?.period ?? null,
    version: state?.version ?? 0,
  };

  // Supplementary state — ESPN (or backend timeline/lineup fallback). For play-by-play, lineup, boxscore only.
  const live = isLive(canonical.phase);
  const color = phaseColor(canonical.phase);
  const { theme } = useTheme();
  const bigScoreClass =
    theme === "light"
      ? "font-mono text-5xl font-black text-text-primary md:text-6xl"
      : "font-mono text-5xl font-black text-white md:text-6xl drop-shadow-[0_0_24px_rgba(255,255,255,0.25)] [text-shadow:0_0_30px_rgba(239,68,68,0.35)]";

  return (
    <div className="mx-auto max-w-2xl animate-slide-up">
      <ScoreWatcher scoreHome={canonical.score_home} scoreAway={canonical.score_away} live={live} />

      {/* Back + Actions */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-card px-3 py-1.5 text-label-lg font-medium text-accent-blue transition-all hover:border-accent-blue/40 hover:bg-accent-blue/10 active:scale-95"
        >
          <span aria-hidden>←</span> Back to scoreboard
        </button>
        <div className="flex items-center gap-2">
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(matchId)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-lg font-medium transition-all active:scale-95 ${
                pinned
                  ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25"
                  : "border-surface-border bg-surface-card text-text-secondary hover:border-surface-border-light hover:text-accent-blue"
              }`}
              aria-label={pinned ? "Untrack this match" : "Track this match"}
            >
              <span aria-hidden>{pinned ? "★" : "☆"}</span>
              {pinned ? "Tracked" : "Track match"}
            </button>
          )}
          <ShareButton title={`${match.home_team?.name} vs ${match.away_team?.name}`} text={`${match.home_team?.short_name} ${canonical.score_home} - ${canonical.score_away} ${match.away_team?.short_name}`} url={`/match/${matchId}`} />
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
          {live && (<div className="relative h-1.5 w-1.5"><div className="absolute inset-0 animate-ping rounded-full bg-accent-red opacity-75" /><div className="relative h-1.5 w-1.5 rounded-full bg-accent-red" /></div>)}
          <span className="text-label-md font-bold uppercase tracking-[0.1em]" style={{ color: live ? "#f87171" : color }}>
            {phaseLabelWithClock(canonical.phase, canonical.clock)}{canonical.clock ? ` · ${canonical.clock}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center"><TeamLogo url={match.home_team?.logo_url} name={match.home_team?.short_name} size={56} /></div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.home_team?.name}</div>
            <div className="mt-0.5 text-label-md text-text-muted">{match.home_team?.short_name}</div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <AnimatedScore
              value={canonical.score_home}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
            <span className="text-2xl font-light text-text-muted/40 md:text-3xl">:</span>
            <AnimatedScore
              value={canonical.score_away}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
          </div>
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center"><TeamLogo url={match.away_team?.logo_url} name={match.away_team?.short_name} size={56} /></div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.away_team?.name}</div>
            <div className="mt-0.5 text-label-md text-text-muted">{match.away_team?.short_name}</div>
          </div>
        </div>
        {state?.aggregate_home != null && state?.aggregate_away != null && (
          <div className="mt-3 text-sm font-semibold text-text-muted">
            Aggregate: {state.aggregate_home}-{state.aggregate_away}
          </div>
        )}
        {match.venue && <div className="mt-5 text-label-md text-text-muted">📍 {match.venue} · {formatDate(match.start_time)} {formatTime(match.start_time)}</div>}
      </div>

      <MatchForm homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} leagueName={leagueName} />
      <HeadToHead homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} homeTeamLogo={match.home_team?.logo_url || null} awayTeamLogo={match.away_team?.logo_url || null} leagueName={leagueName} />
      <Highlights homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} leagueName={leagueName} matchPhase={match.phase} />

      {/* Tabs: show Lineup only for soccer */}
      <div className="mt-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {tabs.map((tab) => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 rounded-lg py-2 text-label-md font-semibold uppercase tracking-wider transition-all ${activeTab === tab ? "bg-surface-hover text-text-primary shadow-sm" : "text-text-tertiary hover:text-text-secondary"}`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4 animate-fade-in">
        {activeTab === "play_by_play" && (
          <PlayByPlayTab
            plays={detailSections.playByPlay.plays}
            homeTeamName={detailSections.playByPlay.homeTeamName}
            awayTeamName={detailSections.playByPlay.awayTeamName}
            homeTeamId={detailSections.playByPlay.homeTeamId}
            awayTeamId={detailSections.playByPlay.awayTeamId}
            loading={detailSections.playByPlay.loading}
            live={live}
            phase={canonical.phase}
          />
        )}
        {activeTab === "player_stats" && (
          <PlayerStatsTab
            section={detailSections.playerStats}
            loading={detailsLoading && !detailSections.playerStats}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            leagueName={leagueForESPN}
            phase={canonical.phase}
            onPlayerClick={detailSections.playerStats?.sport === "soccer" ? (player, teamName, teamLogo, side) => setSelectedSoccerPlayer({ player, teamName, teamLogo, side }) : undefined}
          />
        )}
        {activeTab === "lineup" && isSoccer && (
          <LineupTab
            section={detailSections.lineup}
            loading={detailsLoading && !detailSections.lineup}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            phase={canonical.phase}
            onPlayerClick={(player, teamName, teamLogo, side) => setSelectedSoccerPlayer({ player, teamName, teamLogo, side })}
          />
        )}
        {activeTab === "team_stats" && (
          <TeamStatsTab
            homeStats={detailSections.teamStats.homeStats}
            awayStats={detailSections.teamStats.awayStats}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={detailSections.teamStats.homeTeamName}
            awayTeamName={detailSections.teamStats.awayTeamName}
            loading={detailSections.teamStats.loading}
            live={live}
            phase={canonical.phase}
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
        <div className="mb-1 text-body-md font-semibold text-text-secondary">
          {isScheduled ? "Match Hasn't Started" : live ? "Waiting for Plays..." : "No Play Data Available"}
        </div>
        <div className="text-label-lg text-text-muted">
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
                <span className="text-label-md font-bold uppercase tracking-widest text-text-primary">{group.label}</span>
                <span className="rounded-full bg-surface-hover px-2 py-0.5 text-label-xs font-semibold text-text-muted">{group.plays.length} plays</span>
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
                    <span className="font-mono text-label-md font-bold text-text-muted">{play.clock.displayValue || "—"}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-label-md leading-relaxed text-text-secondary">
                      {play.scoringPlay && <span className="mr-1 text-label-sm">🏀</span>}
                      {play.text}
                    </div>
                  </div>
                  {play.scoringPlay && (
                    <div className="shrink-0 rounded-md bg-surface-hover px-2 py-1 font-mono text-label-md font-bold text-text-primary">
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
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-label-sm text-text-dim">
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
  section: MatchCenterPlayerStatsSection | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
  phase?: string;
  onPlayerClick?: (player: PlayerStatLine, teamName: string, teamLogo: string | null, side: "home" | "away") => void;
}

function PlayerStatsTab({ section, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, leagueName, phase, onPlayerClick }: PlayerStatsTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
  const live = isLive(phase ?? "");
  const mapping = getLeagueMapping(leagueName);
  const [activeSide, setActiveSide] = useState<"home" | "away">("home");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(false);

  if (!mapping) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">Player Stats Unavailable</div>
        <div className="text-label-lg text-text-muted">Not supported for this league</div>
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

  if (!section || (!section.home.players.length && !section.away.players.length)) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">👤</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">No Player Stats</div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Player stats will be available once the match starts"
            : live
              ? "Player stats will populate as the match progresses"
              : "Player statistics were not available for this match"}
        </div>
      </div>
    );
  }

  const usingFallback = section.source !== "espn";
  const homeSource = section.home;
  const awaySource = section.away;

  const teamData = activeSide === "home" ? homeSource : awaySource;
  const highlights = HIGHLIGHT_STATS[section.sport] || [];
  const displayMap = STAT_DISPLAY[section.sport] || {};
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
  const injuries = activeSide === "home" ? section.injuries.home : section.injuries.away;

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {usingFallback && (
        <div className="border-b border-surface-border px-3 py-2 text-label-md text-text-muted">
          Data by {section.source === "football_data" ? "Football-Data.org" : section.source}
        </div>
      )}
      {/* Team toggle */}
      <div className="flex border-b border-surface-border">
        <button onClick={() => { setActiveSide("home"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-label-lg font-semibold transition-all ${activeSide === "home" ? "border-b-2 border-accent-blue bg-accent-blue/5 text-accent-blue" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
          <TeamLogo url={homeTeamLogo} name={homeTeamName} size={18} />
          <span className="truncate">{homeSource.teamName || homeTeamName}</span>
        </button>
        <div className="w-px bg-surface-border" />
        <button onClick={() => { setActiveSide("away"); setSortCol(null); }} className={`flex flex-1 items-center justify-center gap-2 py-3 text-label-lg font-semibold transition-all ${activeSide === "away" ? "border-b-2 border-accent-red bg-accent-red/5 text-accent-red" : "text-text-tertiary hover:bg-surface-hover/30 hover:text-text-secondary"}`}>
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
        <div className="py-8 text-center text-label-lg text-text-muted">Player statistics not yet available</div>
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
          <div className="bg-surface-hover/30 px-4 py-2 text-label-xs font-bold uppercase tracking-widest text-text-dim">Injuries</div>
          {injuries.map((inj, i) => (
            <div key={`${inj.name}-${i}`} className={`flex items-center gap-3 px-4 py-2.5 ${i < injuries.length - 1 ? "border-b border-surface-border/30" : ""}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {inj.jersey && <span className="font-mono text-label-xs font-bold text-text-dim">#{inj.jersey}</span>}
                  <span className="text-label-lg font-semibold text-text-primary">{inj.name}</span>
                  {inj.position && <span className="text-label-xs font-semibold text-text-dim">{inj.position}</span>}
                </div>
                {inj.type && <div className="mt-0.5 text-label-sm text-text-muted">{inj.type}</div>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-label-xs font-bold uppercase ${inj.status.toLowerCase().includes("out") ? "bg-accent-red/10 text-accent-red" : inj.status.toLowerCase().includes("day-to-day") || inj.status.toLowerCase().includes("questionable") ? "bg-accent-amber/10 text-accent-amber" : "bg-surface-hover text-text-muted"}`}>
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
      <div className="mb-2 text-label-xs font-bold uppercase tracking-widest text-text-dim">Top Performers</div>
      <div className="flex gap-2.5 overflow-x-auto">
        {topPlayers.map(({ player, stat, value }) => (
          <button
            key={`${player.name}-${stat}`}
            type="button"
            onClick={onPlayerSelect ? () => onPlayerSelect(player) : undefined}
            className={`flex min-w-[110px] items-center gap-2 rounded-lg border border-surface-border/50 bg-surface-card px-3 py-2 text-left transition-colors ${onPlayerSelect ? "cursor-pointer hover:border-accent-blue/40 hover:bg-surface-hover/30" : ""}`}
          >
            <div className="min-w-0 flex-1">
              <div className="truncate text-label-md font-semibold text-text-primary">{player.name}</div>
              <div className="flex items-baseline gap-1">
                <span className="font-mono text-base font-black text-accent-green">{value}</span>
                <span className="text-label-xs font-bold uppercase text-text-dim">{stat}</span>
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
      {label && <div className="bg-surface-hover/30 px-4 py-1.5 text-label-xs font-bold uppercase tracking-widest text-text-dim">{label}</div>}
      <table className="w-full text-label-md">
        <thead>
          <tr className="border-b border-surface-border text-label-xs font-bold uppercase tracking-wider text-text-dim">
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
                  {player.jersey && <span className="font-mono text-label-xs font-bold text-text-dim">#{player.jersey}</span>}
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
  section: MatchCenterLineupSection | null;
  loading: boolean;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  homeTeamName: string;
  awayTeamName: string;
  phase?: string;
  onPlayerClick?: (player: PlayerStatLine, teamName: string, teamLogo: string | null, side: "home" | "away") => void;
}

function LineupTab({ section, loading, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, phase, onPlayerClick }: LineupTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
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

  const fdLineup = section?.fallback ?? null;
  const hasFdLineup = !!(fdLineup?.source && (fdLineup.home?.lineup?.length || fdLineup.away?.lineup?.length));
  const homeStarters = section?.homeStarters ?? [];
  const awayStarters = section?.awayStarters ?? [];
  const homeBench = section?.homeBench ?? [];
  const awayBench = section?.awayBench ?? [];
  const hasPrimaryLineup = !!(
    homeStarters.length ||
    awayStarters.length ||
    section?.homeFormation ||
    section?.awayFormation
  );

  if (!hasPrimaryLineup) {
    if (hasFdLineup && fdLineup) {
      const home = fdLineup.home ?? { formation: null, lineup: [], bench: [] };
      const away = fdLineup.away ?? { formation: null, lineup: [], bench: [] };
      return (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border px-3 py-2 text-label-md text-text-muted">
            Data by {fdLineup.source === "football_data" ? "Football-Data.org" : fdLineup.source}
          </div>
          <div className="relative bg-[#0d3d1a] text-white" style={{ minHeight: 280 }}>
            <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
            <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
            <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
              {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
              {home.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{home.formation}</span>}
            </div>
            <div className="absolute left-0 right-0 top-10 bottom-1/2 flex flex-col justify-center gap-1 px-3">
              {home.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-label-lg">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-label-sm">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-label-sm opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute left-0 right-0 top-1/2 bottom-10 flex flex-col justify-center gap-1 px-3">
              {away.lineup.map((p, i) => (
                <div key={p.id ?? i} className="flex items-center gap-2 text-label-lg">
                  {p.shirt_number != null && <span className="w-6 shrink-0 rounded bg-white/20 px-1 text-center font-mono text-label-sm">{p.shirt_number}</span>}
                  <span className="truncate">{p.name}</span>
                  {p.position && <span className="shrink-0 text-label-sm opacity-80">{p.position}</span>}
                </div>
              ))}
            </div>
            <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
              {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
              <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
              {away.formation && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{away.formation}</span>}
            </div>
          </div>
          {(home.bench?.length > 0 || away.bench?.length > 0) && (
            <div className="border-t border-surface-border bg-surface-card px-4 py-3">
              <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Bench</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-label-lg">
                <div>
                  {home.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-label-sm text-text-muted">{p.shirt_number}</span>}
                      <span className="truncate">{p.name}</span>
                    </div>
                  ))}
                </div>
                <div>
                  {away.bench?.slice(0, 7).map((p, i) => (
                    <div key={p.id ?? i} className="flex items-center gap-2">
                      {p.shirt_number != null && <span className="w-5 font-mono text-label-sm text-text-muted">{p.shirt_number}</span>}
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
        <div className="mb-3 text-3xl opacity-60">XI</div>
        <div className="mb-1 text-body-md font-semibold text-text-secondary">Lineup Unavailable</div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Lineups are typically announced ~1 hour before kickoff"
            : "Lineup data was not available for this match"}
        </div>
      </div>
    );
  }

  const homeRows = startersByFormationRows(homeStarters, section?.homeFormation ?? undefined);
  const awayRows = startersByFormationRows(awayStarters, section?.awayFormation ?? undefined);
  const subs = section?.substitutions ?? [];

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="relative bg-[#0d3d1a] text-white" style={{ minHeight: 320 }}>
        <div className="absolute inset-0 border-[3px] border-white/60 rounded-none" />
        <div className="absolute left-0 right-0 top-1/2 h-0 border-t-2 border-dashed border-white/50" />
        <div className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/50" />
        <div className="absolute left-1/2 top-0 h-12 w-24 -translate-x-1/2 rounded-b-[2rem] border-2 border-b-0 border-white/50" />
        <div className="absolute bottom-0 left-1/2 h-12 w-24 -translate-x-1/2 rounded-t-[2rem] border-2 border-t-0 border-white/50" />

        <div className="absolute left-0 right-0 top-2 z-10 flex items-center justify-center gap-2">
          {homeTeamLogo && <img src={homeTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{homeTeamName}</span>
          {section?.homeFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{section.homeFormation}</span>
          )}
        </div>

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

        <div className="absolute bottom-2 left-0 right-0 z-10 flex items-center justify-center gap-2">
          {awayTeamLogo && <img src={awayTeamLogo} alt="" className="h-5 w-5 rounded-full object-cover" />}
          <span className="text-label-md font-bold uppercase tracking-wider opacity-95">{awayTeamName}</span>
          {section?.awayFormation && (
            <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-label-md font-bold">{section.awayFormation}</span>
          )}
        </div>
      </div>

      {subs.length > 0 && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Substitutions</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {subs.map((s, i) => (
              <div key={i} className="flex items-start gap-2 text-label-lg">
                <span className="shrink-0 font-mono text-text-dim">{s.minute}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-red/90 text-[8px] text-white">-</span>
                    <span className="truncate text-text-primary">{s.playerOff}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent-green/90 text-[8px] text-white">+</span>
                    <span className="truncate text-text-secondary">{s.playerOn}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(homeBench.length > 0 || awayBench.length > 0) && (
        <div className="border-t border-surface-border bg-surface-card px-4 py-3">
          <div className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-secondary">Substitute Players</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <div className="space-y-1.5">
              {homeBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-label-lg">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-label-sm font-bold text-text-secondary">
                    {p.jersey || "--"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "--"}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              {awayBench.map((p, i) => (
                <div key={p.name ?? i} className="flex items-center gap-2 text-label-lg">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-hover font-mono text-label-sm font-bold text-text-secondary">
                    {p.jersey || "--"}
                  </span>
                  <span className="truncate text-text-primary">{p.name ?? "--"}</span>
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
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#1a4d2a] font-mono text-body-sm font-bold text-white shadow">
        {player.jersey || "—"}
        {scored && <span className="absolute -right-0.5 -top-0.5 text-label-sm">⚽</span>}
        {cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-accent-red" title="Red card" />}
        {cards.yellow && !cards.red && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-sm bg-accent-amber" title="Yellow card" />}
      </div>
      <span className="mt-0.5 max-w-[72px] truncate text-center text-label-sm font-medium text-white/95">{player.name ?? "—"}</span>
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Player stats">
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
      />
      <div className="relative max-h-[90vh] w-full max-w-md overflow-hidden rounded-2xl border border-surface-border bg-surface-card shadow-xl">
        {/* Header — LiveScore style: name, team, #, position */}
        <div className="border-b border-surface-border bg-surface-hover/30 px-5 py-4">
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-surface-hover hover:text-text-primary" aria-label="Close">
              ✕
            </button>
            <div className="min-w-0 flex-1 text-center">
              <h2 className="truncate text-lg font-bold text-text-primary">{player.name}</h2>
              <div className="mt-1 flex items-center justify-center gap-2 text-body-sm text-text-secondary">
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
            <h3 className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-dim">Bio</h3>
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-label-lg">
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Height</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Age</div>
                <div className="text-text-secondary">—</div>
              </div>
              <div>
                <div className="text-label-sm font-semibold uppercase text-text-dim">Country</div>
                <div className="text-text-secondary">—</div>
              </div>
            </div>
          </section>

          {/* This match / League stats — LiveScore style cards */}
          <section className="mb-5">
            <h3 className="mb-2 text-label-md font-bold uppercase tracking-wider text-text-dim">Match stats</h3>
            <p className="mb-3 text-label-md text-text-muted">{matchContext}</p>
            <div className="grid grid-cols-3 gap-2">
              {SOCCER_PLAYER_DETAIL_STATS.map(({ label, keys, fallback }) => (
                <div key={label} className="rounded-xl border border-surface-border bg-surface-hover/20 p-3 text-center">
                  <div className="font-mono text-xl font-bold text-text-primary">{statValue(keys, fallback)}</div>
                  <div className="mt-0.5 text-label-sm font-semibold uppercase text-text-dim">{label}</div>
                </div>
              ))}
            </div>
          </section>

          {/* Overview text — like LiveScore "About" */}
          <p className="text-label-lg leading-relaxed text-text-secondary">
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
  phase?: string;
}

const EXCLUDED_TEAM_STATS = new Set([
  "teamTurnovers", "totalTurnovers", "technicalFouls", "totalTechnicalFouls",
  "flagrantFouls", "leadChanges", "leadPercentage",
]);

function TeamStatsTab({ homeStats, awayStats, homeTeamLogo, awayTeamLogo, homeTeamName, awayTeamName, loading, live, phase }: TeamStatsTabProps) {
  const isScheduled = phase === "scheduled" || phase === "pre_match";
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
        <div className="mb-1 text-body-md font-semibold text-text-secondary">
          {isScheduled ? "Pre-Match Stats" : live ? "Waiting for Statistics" : "No Statistics Available"}
        </div>
        <div className="text-label-lg text-text-muted">
          {isScheduled
            ? "Season statistics will appear here. In-match stats available during the game."
            : live
              ? "Stats will populate as the match progresses"
              : "Match stats were not available for this game"}
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
        <span className="text-label-sm font-bold uppercase tracking-[0.15em] text-text-dim">Team Stats</span>
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
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-blue px-2.5 py-0.5 font-mono text-body-sm font-bold text-white">{hStr}</span>
              ) : (
                <span className="font-mono text-body-sm font-semibold text-text-primary">{hStr}</span>
              )}
            </div>
            <span className="flex-1 text-center text-label-md font-medium text-text-secondary">{label}</span>
            <div className="flex w-[72px] justify-end">
              {awayLeads ? (
                <span className="inline-flex min-w-[40px] items-center justify-center rounded-full bg-accent-red px-2.5 py-0.5 font-mono text-body-sm font-bold text-white">{aStr}</span>
              ) : (
                <span className="font-mono text-body-sm font-semibold text-text-primary">{aStr}</span>
              )}
            </div>
          </div>
        );
      })}

      {live && (
        <div className="flex items-center justify-center gap-1.5 border-t border-surface-border py-2.5 text-label-sm text-text-dim">
          <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-green" />
          Stats update live
        </div>
      )}
    </div>
  );
}
