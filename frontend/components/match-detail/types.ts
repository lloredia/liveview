import type { LineupResponse } from "@/lib/api";

export type Tab = "play_by_play" | "player_stats" | "lineup" | "team_stats";

export interface MatchDetailProps {
  matchId: string;
  onBack: () => void;
  leagueName?: string;
  /** Whether this match is in the tracker (pinned). */
  pinned?: boolean;
  /** Callback to add/remove this match from the tracker. */
  onTogglePin?: (matchId: string) => void;
  /** When this value changes, trigger a refetch (e.g. from pull-to-refresh). */
  refreshTrigger?: number;
}

export interface ESPNPlay {
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

export interface ESPNTeamStat {
  name: string;
  displayValue: string;
  label: string;
}

export interface PlayerStatLine {
  name: string;
  jersey: string;
  position: string;
  stats: Record<string, string | number>;
  starter: boolean;
}

export interface TeamPlayerStats {
  teamName: string;
  players: PlayerStatLine[];
  statColumns: string[];
}

export interface InjuryEntry {
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

export interface MatchCenterPlayByPlaySection {
  plays: ESPNPlay[];
  homeTeamName: string;
  awayTeamName: string;
  homeTeamId: string;
  awayTeamId: string;
  loading: boolean;
}

export interface MatchCenterPlayerStatsSection {
  source: string | null;
  sport: string;
  home: TeamPlayerStats;
  away: TeamPlayerStats;
  injuries: { home: InjuryEntry[]; away: InjuryEntry[] };
}

export interface MatchCenterLineupSection {
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

export interface MatchCenterTeamStatsSection {
  homeStats: ESPNTeamStat[];
  awayStats: ESPNTeamStat[];
  homeTeamName: string;
  awayTeamName: string;
  loading: boolean;
}

export type SoccerPlayerSelection = {
  player: PlayerStatLine;
  teamName: string;
  teamLogo: string | null;
  side: "home" | "away";
};
