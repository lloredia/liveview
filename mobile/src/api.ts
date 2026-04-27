/**
 * Thin client for the Railway FastAPI backend.
 * All endpoints used by the mobile app live under /v1.
 */

import * as SecureStore from "expo-secure-store";

export const API_BASE = "https://backend-api-production-8b9f.up.railway.app";

const TOKEN_KEY = "lv_jwt";

export async function getToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, message: string, detail?: string) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

interface RequestOpts {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = "GET", body, auth = false, signal } = opts;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest",
  };
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const data = (await res.json()) as { detail?: string; message?: string };
      detail = data.detail || data.message;
    } catch {
      // body is not JSON
    }
    throw new ApiError(res.status, detail || `Request failed (${res.status})`, detail);
  }
  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ── Auth ────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string | null;
}

interface TokenResponse {
  user: User;
  token: string;
  expires_in: number;
}

/** Register a new user and store the returned JWT. Returns the user. */
export async function register(
  email: string,
  password: string,
  name?: string,
): Promise<User> {
  const res = await apiFetch<TokenResponse>("/v1/auth/register-token", {
    method: "POST",
    body: { email, password, name },
  });
  await setToken(res.token);
  return res.user;
}

/** Sign in with email/password and store the returned JWT. Returns the user. */
export async function login(email: string, password: string): Promise<User> {
  const res = await apiFetch<TokenResponse>("/v1/auth/token", {
    method: "POST",
    body: { email, password },
  });
  await setToken(res.token);
  return res.user;
}

export async function logout(): Promise<void> {
  await setToken(null);
}

export async function fetchMe(): Promise<User> {
  return apiFetch<User>("/v1/me", { auth: true });
}

export async function deleteAccount(): Promise<void> {
  await apiFetch<{ ok: boolean }>("/v1/me", { method: "DELETE", auth: true });
}

export async function requestPasswordReset(email: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/v1/auth/password/request-reset", {
    method: "POST",
    body: { email },
  });
}

export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await apiFetch<{ ok: boolean }>("/v1/auth/password/reset", {
    method: "POST",
    body: { token, password },
  });
}

// ── Scoreboard ──────────────────────────────────────────────────

export interface Team {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
  /** Optional season record, e.g. "52-30". Backend may not populate this yet. */
  record?: string | null;
  /** Optional standing string, e.g. "2nd East". */
  standing?: string | null;
  /** Optional team brand hex color, e.g. "#007A33". Drives table dots, leader avatars. */
  color_primary?: string | null;
}

export interface MatchScore {
  home: number;
  away: number;
  aggregate_home?: number | null;
  aggregate_away?: number | null;
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
  /** Which side has the ball / serve / possession right now. */
  possession?: "home" | "away" | null;
  /** Reported attendance, e.g. 18247. */
  attendance?: number | null;
  /** Broadcast network string, e.g. "NBA TV". */
  broadcast?: string | null;
}

export interface LeagueGroup {
  league_id: string;
  league_name: string;
  league_short_name: string;
  league_country: string | null;
  league_logo_url: string | null;
  sport: string;
  sport_type: string;
  matches: MatchSummary[];
}

export interface TodayResponse {
  date: string;
  total_matches: number;
  live: number;
  finished: number;
  scheduled: number;
  leagues: LeagueGroup[];
  generated_at: string;
}

export async function fetchToday(
  signal?: AbortSignal,
  opts: { date?: string; tzOffset?: number } = {},
): Promise<TodayResponse> {
  const tz = opts.tzOffset ?? new Date().getTimezoneOffset();
  const qp = new URLSearchParams({ tz_offset: String(tz) });
  if (opts.date) qp.set("date", opts.date);
  return apiFetch<TodayResponse>(`/v1/today?${qp.toString()}`, { signal });
}

// ── Devices & push ──────────────────────────────────────────────

interface DeviceRegisterResponse {
  device_id: string;
}

export async function registerDevice(
  platform: "ios" | "android" | "web",
  userAgent?: string,
  deviceId?: string,
): Promise<string> {
  const res = await apiFetch<DeviceRegisterResponse>("/v1/devices/register", {
    method: "POST",
    body: { platform, user_agent: userAgent, device_id: deviceId },
  });
  return res.device_id;
}

export async function registerIosPushToken(
  deviceId: string,
  apnsToken: string,
  bundleId: string,
): Promise<void> {
  await apiFetch<{ ok: boolean }>("/v1/notifications/ios/register-token", {
    method: "POST",
    body: { device_id: deviceId, apns_token: apnsToken, bundle_id: bundleId },
  });
}

export interface TrackedGame {
  device_id: string;
  game_id: string;
  sport: string | null;
  league: string | null;
  notify_flags: Record<string, boolean>;
  created_at: string;
}

export async function trackGame(
  deviceId: string,
  gameId: string,
  opts: { sport?: string; league?: string; notifyFlags?: Record<string, boolean> } = {},
): Promise<TrackedGame> {
  return apiFetch<TrackedGame>("/v1/tracked-games", {
    method: "POST",
    body: {
      device_id: deviceId,
      game_id: gameId,
      sport: opts.sport,
      league: opts.league,
      notify_flags: opts.notifyFlags,
    },
  });
}

export async function untrackGame(deviceId: string, gameId: string): Promise<void> {
  await apiFetch<{ ok: boolean }>(
    `/v1/tracked-games/${gameId}?device_id=${encodeURIComponent(deviceId)}`,
    { method: "DELETE" },
  );
}

export async function listTrackedGames(deviceId: string): Promise<TrackedGame[]> {
  return apiFetch<TrackedGame[]>(
    `/v1/tracked-games?device_id=${encodeURIComponent(deviceId)}`,
  );
}

// ── News ────────────────────────────────────────────────────────

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

export interface NewsListResponse {
  articles: NewsArticle[];
  total: number;
  page: number;
  pages: number;
  has_next: boolean;
}

export async function fetchNews(
  signal?: AbortSignal,
  opts: { page?: number; limit?: number; sport?: string; q?: string } = {},
): Promise<NewsListResponse> {
  const qp = new URLSearchParams();
  qp.set("page", String(opts.page ?? 1));
  qp.set("limit", String(opts.limit ?? 20));
  if (opts.sport) qp.set("sport", opts.sport);
  if (opts.q) qp.set("q", opts.q);
  return apiFetch<NewsListResponse>(`/v1/news?${qp.toString()}`, { signal });
}

// ── Match detail ─────────────────────────────────────────────────

export interface PeriodScore {
  period: string;
  home: number;
  away: number;
}

export interface WinProbability {
  home: number;
  away: number;
  delta_last_play: number;
}

export interface LeaderLine {
  initials: string;
  name: string;
  position: string;
  jersey: string;
  pts: number;
  reb: number;
  ast: number;
}

export interface LastPlay {
  team: "home" | "away";
  text: string;
  seconds_ago: number;
  points: number;
  distance_ft?: number | null;
}

export interface MatchDetailResponse {
  match: MatchSummary & { league: { id: string; name: string; short_name: string } };
  state: {
    score_home: number;
    score_away: number;
    clock: string | null;
    period: string | null;
    period_scores?: PeriodScore[];
    version: number;
  } | null;
  league: { id: string; name: string; short_name: string };
  /** Live win probability snapshot. Optional — missing on most matches today. */
  win_probability?: WinProbability | null;
  leaders?: { home?: LeaderLine | null; away?: LeaderLine | null } | null;
  last_play?: LastPlay | null;
}

export async function fetchMatch(matchId: string, signal?: AbortSignal): Promise<MatchDetailResponse> {
  return apiFetch<MatchDetailResponse>(`/v1/matches/${matchId}`, { signal });
}

// ── Match details (player stats / box-score) ───────────────────

/**
 * Raw player-stats slice from /v1/matches/{id}/details. Each side has a
 * flat `players` array and a separate `statColumns` list defining which
 * keys appear in each player's `stats` map (varies by sport / source).
 */
export interface RawPlayer {
  name: string;
  jersey: string;
  position: string;
  stats: Record<string, string>;
  starter?: boolean;
}

export interface RawPlayerStatsSide {
  teamName?: string;
  players: RawPlayer[];
  statColumns: string[];
}

export interface RawMatchPlayerStats {
  source: string | null;
  home: RawPlayerStatsSide | null;
  away: RawPlayerStatsSide | null;
}

interface RawMatchDetails {
  playerStats?: RawMatchPlayerStats | null;
}

export async function fetchMatchPlayerStats(
  matchId: string,
  signal?: AbortSignal,
): Promise<RawMatchPlayerStats> {
  const res = await apiFetch<RawMatchDetails>(`/v1/matches/${matchId}/details`, { signal });
  return res.playerStats ?? { source: null, home: null, away: null };
}

// ── Match timeline (event stream) ──────────────────────────────

export interface RawMatchEvent {
  id: string;
  seq: number;
  event_type: string;
  minute: number | null;
  second: number | null;
  period: string | null;
  team_id: string | null;
  player_id: string | null;
  player_name: string | null;
  detail: Record<string, unknown> | null;
  score_home: number | null;
  score_away: number | null;
  synthetic: boolean;
  confidence: number | null;
  created_at: string | null;
}

interface RawTimelineResponse {
  match_id: string;
  phase: string;
  events: RawMatchEvent[];
  count: number;
  next_seq: number | null;
  has_more: boolean;
}

export async function fetchMatchTimeline(
  matchId: string,
  signal?: AbortSignal,
): Promise<RawMatchEvent[]> {
  const res = await apiFetch<RawTimelineResponse>(
    `/v1/matches/${matchId}/timeline?limit=20`,
    { signal },
  );
  return res.events ?? [];
}
