import type {
  LeagueGroup,
  MatchDetailResponse,
  MatchEvent,
  MatchStatsResponse,
  NewsArticle,
  NewsResponse,
  ScoreboardResponse,
  TimelineResponse,
  LiveTickerResponse,
  TodayResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
/** Long enough for Railway cold starts (~15–30s); local backend responds in <1s. */
const REQUEST_TIMEOUT_MS = 25_000;

/** Single source of truth for API base URL (used by all API calls and env docs). */
export function getApiBase(): string {
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
  if (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    (base.includes("localhost") || base.includes("127.0.0.1"))
  ) {
    console.error(
      "[LiveView] NEXT_PUBLIC_API_URL should not point to localhost in production. Set it in your deployment environment."
    );
  }
  return base;
}

/** Timeout in ms for API requests (exported for use in non-apiFetch callers e.g. today cache). */
export const API_REQUEST_TIMEOUT_MS = REQUEST_TIMEOUT_MS;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 1_000;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string, retries = MAX_RETRIES): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    const isLiveEndpoint =
      path.includes("/today") ||
      path.includes("/scoreboard") ||
      path.includes("/matches/");
    try {
      const res = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: "application/json" },
        next: { revalidate: 0 },
        ...(isLiveEndpoint ? { cache: "no-store" as RequestCache } : {}),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        throw new ApiError(res.status, `${res.status} ${res.statusText}`);
      }
      return res.json();
    } catch (err) {
      clearTimeout(timeout);
      const isAbort =
        err instanceof Error &&
        (err.name === "AbortError" || /aborted|signal is aborted/i.test(err.message));
      lastError =
        isAbort
          ? new Error("Request timed out or backend not reachable")
          : err instanceof Error
            ? err
            : new Error(String(err));

      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        throw err;
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
      }
    }
  }

  throw lastError ?? new Error("Request failed");
}

export async function fetchLeagues(): Promise<LeagueGroup[]> {
  return apiFetch<LeagueGroup[]>("/v1/leagues");
}

export async function fetchScoreboard(leagueId: string): Promise<ScoreboardResponse> {
  return apiFetch<ScoreboardResponse>(`/v1/leagues/${leagueId}/scoreboard`);
}

export async function fetchMatch(matchId: string): Promise<MatchDetailResponse> {
  return apiFetch<MatchDetailResponse>(`/v1/matches/${matchId}`);
}

export async function fetchLiveCounts(): Promise<TodayResponse> {
  const tzOffset = new Date().getTimezoneOffset();
  return apiFetch<TodayResponse>(`/v1/today?tz_offset=${tzOffset}`);
}

export async function fetchStats(matchId: string): Promise<MatchStatsResponse> {
  return apiFetch<MatchStatsResponse>(`/v1/matches/${matchId}/stats`);
}

export async function fetchTimeline(
  matchId: string,
  afterSeq?: number,
): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  if (afterSeq !== undefined) params.set("after_seq", String(afterSeq));
  const qs = params.toString();
  return apiFetch<TimelineResponse>(`/v1/matches/${matchId}/timeline${qs ? `?${qs}` : ""}`);
}

/** Lineup from Football-Data.org (soccer). Used when ESPN has no lineup. */
export interface LineupResponse {
  source: string | null;
  home: { formation: string | null; lineup: { id: number; name: string; position: string | null; shirt_number: number | null }[]; bench: { id: number; name: string; position: string | null; shirt_number: number | null }[] } | null;
  away: { formation: string | null; lineup: { id: number; name: string; position: string | null; shirt_number: number | null }[]; bench: { id: number; name: string; position: string | null; shirt_number: number | null }[] } | null;
  message?: string;
}

export async function fetchLineup(matchId: string): Promise<LineupResponse> {
  return apiFetch<LineupResponse>(`/v1/matches/${matchId}/lineup`);
}

/** Player stats from Football-Data.org (soccer) when ESPN has none. Same shape as ESPN boxscore players. */
export interface PlayerStatsResponse {
  source: string | null;
  home: { teamName: string; players: { name: string; jersey: string; position: string; stats: Record<string, number>; starter: boolean }[]; statColumns: string[] } | null;
  away: { teamName: string; players: { name: string; jersey: string; position: string; stats: Record<string, number>; starter: boolean }[]; statColumns: string[] } | null;
  message?: string;
}

export async function fetchPlayerStats(matchId: string): Promise<PlayerStatsResponse> {
  return apiFetch<PlayerStatsResponse>(`/v1/matches/${matchId}/player-stats`);
}

export interface SoccerDetailsResponse {
  source: string | null;
  match_id?: string;
  lineup: LineupResponse | null;
  player_stats: PlayerStatsResponse | null;
  message?: string;
}

export async function fetchSoccerDetails(matchId: string): Promise<SoccerDetailsResponse> {
  return apiFetch<SoccerDetailsResponse>(`/v1/matches/${matchId}/soccer-details`);
}

export interface MatchCenterDetailsResponse {
  match_id: string;
  phase: string;
  header?: {
    match: {
      id: string;
      phase: string;
      start_time: string | null;
      venue: string | null;
      home_team: { id: string | null; name: string; short_name: string; logo_url: string | null };
      away_team: { id: string | null; name: string; short_name: string; logo_url: string | null };
    };
    state: {
      score_home: number;
      score_away: number;
      clock: string | null;
      period: string | null;
      period_scores: unknown[];
      version: number;
      aggregate_home?: number;
      aggregate_away?: number;
    } | null;
    league: {
      id: string | null;
      name: string | null;
    } | null;
  };
  sections?: {
    matchId: string;
    phase: string;
    playByPlay: {
      source: string | null;
      plays: Array<{
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
      }>;
      homeTeamName: string;
      awayTeamName: string;
      homeTeamId: string;
      awayTeamId: string;
      loading: boolean;
    };
    teamStats: {
      source: string | null;
      homeStats: Array<{ name: string; displayValue: string; label: string }>;
      awayStats: Array<{ name: string; displayValue: string; label: string }>;
      homeTeamName: string;
      awayTeamName: string;
      loading: boolean;
    };
    playerStats: {
      source: string | null;
      sport: string | null;
      home: { teamName: string; players: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>; statColumns: string[] } | null;
      away: { teamName: string; players: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>; statColumns: string[] } | null;
      injuries: {
        home: Array<{ name: string; position: string; jersey: string; type: string; status: string }>;
        away: Array<{ name: string; position: string; jersey: string; type: string; status: string }>;
      };
    } | null;
    lineup: {
      source: string | null;
      homeFormation?: string | null;
      awayFormation?: string | null;
      homeStarters: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>;
      awayStarters: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>;
      homeBench: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>;
      awayBench: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>;
      substitutions: Array<{ minute: string; playerOff: string; playerOn: string; homeAway: "home" | "away" }>;
      fallback: LineupResponse | null;
    } | null;
  };
  timeline: {
    match_id: string;
    phase: string;
    events: MatchEvent[];
    count: number;
    next_seq: number | null;
    has_more: boolean;
  };
  stats: MatchStatsResponse;
  soccer_details: SoccerDetailsResponse | null;
  supplementary?: {
    espn?: {
      source: string;
      fetched_at: string;
      sport: string;
      plays: Array<{
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
      }>;
      team_stats: {
        home: Array<{ name: string; displayValue: string; label: string }>;
        away: Array<{ name: string; displayValue: string; label: string }>;
      };
      player_stats: {
        home: { teamName: string; players: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>; statColumns: string[] };
        away: { teamName: string; players: Array<{ name: string; jersey: string; position: string; stats: Record<string, string | number>; starter: boolean }>; statColumns: string[] };
      };
      formations: { home?: string | null; away?: string | null };
      injuries: {
        home: Array<{ name: string; position: string; jersey: string; type: string; status: string }>;
        away: Array<{ name: string; position: string; jersey: string; type: string; status: string }>;
      };
      team_display: {
        home_name: string;
        away_name: string;
        home_team_id: string;
        away_team_id: string;
      };
      substitutions?: Array<{ minute: string; playerOff: string; playerOn: string; homeAway: "home" | "away" }> | null;
    } | null;
  };
  generated_at: string;
}

export async function fetchMatchDetails(matchId: string): Promise<MatchCenterDetailsResponse> {
  return apiFetch<MatchCenterDetailsResponse>(`/v1/matches/${matchId}/details`);
}

/**
 * Fetch live matches across ALL leagues for the live ticker.
 * Fetches all scoreboards in parallel and filters for live phases.
 */
export function liveTickerFromToday(today: TodayResponse): LiveTickerResponse {
  const matches = (today.leagues ?? []).flatMap((league) =>
    (league.matches ?? [])
      .filter((match) => match.phase.startsWith("live_") || match.phase === "break")
      .map((match) => ({
        ...match,
        league_name: league.league_name,
      })),
  );

  return {
    matches,
    fetched_at: today.generated_at,
  };
}

export async function fetchNews(params?: {
  page?: number;
  limit?: number;
  category?: string;
  sport?: string;
  league?: string;
  q?: string;
  hours?: number;
}): Promise<NewsResponse> {
  const search = new URLSearchParams();
  if (params?.page != null) search.set("page", String(params.page));
  if (params?.limit != null) search.set("limit", String(params.limit));
  if (params?.category) search.set("category", params.category);
  if (params?.sport) search.set("sport", params.sport);
  if (params?.league) search.set("league", params.league);
  if (params?.q) search.set("q", params.q);
  if (params?.hours != null) search.set("hours", String(params.hours));
  const qs = search.toString();
  return apiFetch<NewsResponse>(`/v1/news${qs ? `?${qs}` : ""}`);
}

export async function fetchTrendingNews(): Promise<NewsArticle[]> {
  return apiFetch<NewsArticle[]>("/v1/news/trending");
}

export async function fetchBreakingNews(): Promise<NewsArticle[]> {
  return apiFetch<NewsArticle[]>("/v1/news/breaking");
}

export function getHealthUrl(): string {
  return `${API_BASE}/health`;
}

export interface SystemStatus {
  status: "ok" | "degraded";
  services: { redis: boolean; database: boolean };
  providers: { espn: { state: string; failure_count: number } };
}

export async function fetchStatus(): Promise<SystemStatus> {
  return apiFetch<SystemStatus>("/v1/status");
}

export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/v1/ws";
}
