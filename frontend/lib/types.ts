// ── API response types ──────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
}

export interface MatchScore {
  home: number;
  away: number;
}

export interface MatchSummary {
  id: string;
  phase: string;
  start_time: string | null;
  venue: string | null;
  score: MatchScore;
  clock: string | null;
  period: string | null;
  version: number;
  home_team: Team;
  away_team: Team;
}

export interface MatchSummaryWithLeague extends MatchSummary {
  league_name: string;
}

export interface MatchState {
  score_home: number;
  score_away: number;
  clock: string | null;
  period: string | null;
  period_scores: unknown[];
  version: number;
}

export interface MatchEvent {
  id: string;
  event_type: string;
  minute: number | null;
  second: number | null;
  period: string | null;
  team_id: string | null;
  player_name: string | null;
  detail: string | null;
  score_home: number | null;
  score_away: number | null;
  synthetic: boolean;
  confidence: number | null;
  seq: number;
}

export interface LeagueInfo {
  id: string;
  name: string;
  short_name: string | null;
  country: string;
}

export interface LeagueGroup {
  sport: string;
  sport_display: string;
  leagues: LeagueInfo[];
}

export interface ScoreboardResponse {
  league_id: string;
  league_name: string;
  matches: MatchSummary[];
  generated_at: string;
}

export interface MatchDetailResponse {
  match: {
    id: string;
    phase: string;
    start_time: string | null;
    venue: string | null;
    home_team: Team;
    away_team: Team;
  };
  state: MatchState | null;
  recent_events: MatchEvent[];
  league?: { id: string; name: string } | null;
  generated_at: string;
}

export interface TimelineResponse {
  match_id: string;
  phase: string;
  events: MatchEvent[];
  count: number;
  next_seq: number | null;
  has_more: boolean;
}

export interface LiveTickerResponse {
  matches: MatchSummaryWithLeague[];
  fetched_at: string;
}

export interface TeamStatsEntry {
  team_id: string | null;
  team_name: string;
  side: "home" | "away";
  stats: Record<string, number | string | null>;
}

export interface MatchStatsResponse {
  match_id: string;
  teams: TeamStatsEntry[];
  generated_at: string;
}

// ── News ────────────────────────────────────────────────────────────

export interface NewsArticle {
  id: string;
  title: string;
  summary: string | null;
  content_snippet: string | null;
  source: string;
  source_url: string;
  image_url: string | null;
  category: string;
  sport: string | null;
  leagues: string[];
  teams: string[];
  published_at: string;
  fetched_at: string;
  trending_score: number;
  is_breaking: boolean;
}

export interface NewsResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  pages: number;
  has_next: boolean;
}

// ── WebSocket message types ─────────────────────────────────────────

export interface WSMessage {
  type: "welcome" | "snapshot" | "delta" | "pong" | "error" | "state";
  connection_id?: string;
  channel?: string;
  data?: unknown;
  error?: string;
  ts?: string;
}