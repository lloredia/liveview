import type {
  LeagueGroup,
  MatchDetailResponse,
  ScoreboardResponse,
  TimelineResponse,
  LiveTickerResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Accept: "application/json" },
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  }
  return res.json();
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function fetchLiveCounts(): Promise<any> {
  return apiFetch("/v1/today");
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

/**
 * Fetch live matches across ALL leagues for the live ticker.
 * Fetches all scoreboards in parallel and filters for live phases.
 */
export async function fetchLiveMatches(leagueGroups: LeagueGroup[]): Promise<LiveTickerResponse> {
  const allIds = leagueGroups.flatMap((g) => g.leagues.map((l) => l.id));

  const results: ScoreboardResponse[] = [];
  for (let i = 0; i < allIds.length; i += 5) {
    const batch = allIds.slice(i, i + 5);
    const batchResults = await Promise.allSettled(
      batch.map((id) => fetchScoreboard(id)),
    );
    for (const r of batchResults) {
      if (r.status === "fulfilled") results.push(r.value);
    }
  }

  const liveMatches = results.flatMap((sb) =>
    sb.matches
      .filter((m) => m.phase.startsWith("live_") || m.phase === "break")
      .map((m) => ({ ...m, league_name: sb.league_name })),
  );

  return { matches: liveMatches, fetched_at: new Date().toISOString() };
}

export function getHealthUrl(): string {
  return `${API_BASE}/health`;
}

export function getWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/v1/ws";
}