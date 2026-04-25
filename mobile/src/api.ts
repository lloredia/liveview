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

export async function fetchToday(signal?: AbortSignal): Promise<TodayResponse> {
  return apiFetch<TodayResponse>("/v1/today", { signal });
}

// ── Match detail ─────────────────────────────────────────────────

export interface MatchDetailResponse {
  match: MatchSummary & { league: { id: string; name: string; short_name: string } };
  state: {
    score_home: number;
    score_away: number;
    clock: string | null;
    period: string | null;
    version: number;
  } | null;
  league: { id: string; name: string; short_name: string };
}

export async function fetchMatch(matchId: string, signal?: AbortSignal): Promise<MatchDetailResponse> {
  return apiFetch<MatchDetailResponse>(`/v1/matches/${matchId}`, { signal });
}
