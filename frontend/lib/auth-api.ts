/**
 * Client for backend user APIs. Requires backend JWT from /api/auth/backend-token.
 */

import { getApiBase } from "./api";

export async function getBackendToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/auth/backend-token", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.token ?? null;
  } catch {
    return null;
  }
}

async function authFetch(
  path: string,
  init: RequestInit & { token?: string | null } = {}
): Promise<Response> {
  const { token: providedToken, ...rest } = init;
  const token = providedToken ?? (await getBackendToken());
  if (!token) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const base = getApiBase();
  const url = path.startsWith("http") ? path : `${base}${path}`;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...rest, headers });
}

// ── Tracked games ─────────────────────────────────────────────

export interface UserTrackedGame {
  game_id: string;
  sport: string | null;
  league: string | null;
  notify_flags: Record<string, boolean>;
  created_at: string;
}

export async function fetchUserTrackedGames(token?: string | null): Promise<string[]> {
  const res = await authFetch("/v1/user/tracked-games", { token });
  if (!res.ok) return [];
  const list: UserTrackedGame[] = await res.json();
  return list.map((x) => x.game_id);
}

export async function addUserTrackedGame(
  gameId: string,
  opts?: { sport?: string; league?: string },
  token?: string | null
): Promise<boolean> {
  const res = await authFetch("/v1/user/tracked-games", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      game_id: gameId,
      sport: opts?.sport ?? null,
      league: opts?.league ?? null,
      notify_flags: {
        score: true,
        lead_change: true,
        start: true,
        halftime: false,
        final: true,
        ot: true,
        major_events: true,
      },
    }),
    token,
  });
  return res.ok;
}

export async function removeUserTrackedGame(
  gameId: string,
  token?: string | null
): Promise<boolean> {
  const res = await authFetch(
    `/v1/user/tracked-games/${encodeURIComponent(gameId)}`,
    { method: "DELETE", token }
  );
  return res.ok;
}

// ── Favorites ─────────────────────────────────────────────────

export interface UserFavorite {
  favorite_type: string;
  target_id: string;
}

export async function fetchUserFavorites(token?: string | null): Promise<{
  leagues: string[];
  teams: string[];
}> {
  const res = await authFetch("/v1/user/favorites", { token });
  if (!res.ok) return { leagues: [], teams: [] };
  const data = await res.json();
  const favorites: UserFavorite[] = data.favorites ?? [];
  const leagues = favorites.filter((f) => f.favorite_type === "league").map((f) => f.target_id);
  const teams = favorites.filter((f) => f.favorite_type === "team").map((f) => f.target_id);
  return { leagues, teams };
}

export async function addUserFavorite(
  type: "league" | "team",
  targetId: string,
  token?: string | null
): Promise<boolean> {
  const res = await authFetch("/v1/user/favorites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ favorite_type: type, target_id: targetId }),
    token,
  });
  return res.ok;
}

export async function removeUserFavorite(
  type: "league" | "team",
  targetId: string,
  token?: string | null
): Promise<boolean> {
  const res = await authFetch(
    `/v1/user/favorites/${type}/${encodeURIComponent(targetId)}`,
    { method: "DELETE", token }
  );
  return res.ok;
}

// ── Account deletion ──────────────────────────────────────────

export async function deleteUserAccount(token?: string | null): Promise<boolean> {
  const res = await authFetch("/v1/me", { method: "DELETE", token });
  return res.ok;
}
