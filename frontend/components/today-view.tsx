"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { useESPNLiveMulti } from "@/hooks/use-espn-live";
import { getLeagueLogo } from "@/lib/league-logos";
import type { TodayMatch, TodayResponse } from "@/lib/types";
import { getApiBase, API_REQUEST_TIMEOUT_MS } from "@/lib/api";
import { getTodayCache, setTodayCache } from "@/lib/today-cache";
import { MatchCard } from "./match-card";
import { TodayViewSkeleton } from "./skeleton";
import { GlassPill, GlassDivider, GlassButton } from "./ui/glass";
import { LastUpdatedIndicator } from "./last-updated-indicator";

export type { TodayLeagueGroup, TodayResponse } from "@/lib/types";

type MatchFilter = "all" | "live" | "favorites" | "tracked";

export type TodayResult =
  | TodayResponse
  | { data: TodayResponse; fromCache: true; savedAt: string };

async function fetchToday(
  dateStr: string | undefined,
  matchIds?: string[],
): Promise<TodayResponse> {
  const params = new URLSearchParams();
  params.set("tz_offset", String(new Date().getTimezoneOffset()));
  if (dateStr) params.set("date", dateStr);
  if (matchIds?.length) params.set("match_ids", matchIds.join(","));
  const qs = params.toString();
  const url = `${getApiBase()}/v1/today?${qs}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    // #region agent log
    try {
      const leagues = (data as { leagues?: unknown[] }).leagues ?? [];
      const firstLeague = leagues[0] as { league_name?: string; matches?: { id?: string; phase?: string; score?: { home?: number; away?: number } }[] } | undefined;
      const firstMatches = firstLeague?.matches?.slice(0, 2) ?? [];
      fetch("http://127.0.0.1:7506/ingest/9a56292c-fb27-4851-a728-6f0a441c7e7a", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "38b46f" },
        body: JSON.stringify({
          sessionId: "38b46f",
          location: "today-view.tsx:fetchToday",
          message: "today_response_sample",
          data: { league_name: firstLeague?.league_name, matches: firstMatches?.map((m) => ({ id: m?.id, phase: m?.phase, score: m?.score })) },
          hypothesisId: "H2_H3",
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch (_) {}
    // #endregion
    return data;
  } catch (e) {
    clearTimeout(timeout);
    const err = e instanceof Error ? e : new Error(String(e));
    const isAbort = err.name === "AbortError" || /aborted|signal is aborted/i.test(err.message);
    if (isAbort) throw new Error("Request timed out or backend not reachable");
    throw e;
  }
}

async function fetchTodayWithCache(
  dateStr: string | undefined,
  matchIds?: string[],
): Promise<TodayResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    const cached = getTodayCache(dateStr);
    if (cached) return { data: cached.data, fromCache: true, savedAt: cached.savedAt };
    throw new Error("Offline");
  }
  try {
    const data = await fetchToday(dateStr, matchIds);
    setTodayCache(dateStr, data);
    return data;
  } catch {
    const cached = getTodayCache(dateStr);
    if (cached) return { data: cached.data, fromCache: true, savedAt: cached.savedAt };
    throw new Error("Connection failed");
  }
}

function normalizeTodayResult(raw: TodayResult | null): TodayResponse | null {
  if (!raw) return null;
  if (typeof raw === "object" && "fromCache" in raw) return raw.data;
  return raw;
}

function getCacheMeta(raw: TodayResult | null): { fromCache: boolean; savedAt: string | null } {
  if (!raw || typeof raw !== "object" || !("fromCache" in raw)) return { fromCache: false, savedAt: null };
  return { fromCache: true, savedAt: (raw as { savedAt: string }).savedAt ?? null };
}

function formatCacheTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatDateISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function LeagueLogo({ name, apiLogoUrl }: { name: string; apiLogoUrl?: string | null }) {
  const [err, setErr] = useState(false);
  const url = getLeagueLogo(name, apiLogoUrl);
  if (!url || err) return null;
  return (
    <img
      src={url}
      alt={name}
      className="h-5 w-5 object-contain"
      onError={() => setErr(true)}
    />
  );
}

interface TodayViewProps {
  onMatchSelect: (matchId: string) => void;
  onLeagueSelect: (leagueId: string) => void;
  pinnedIds?: string[];
  onTogglePin?: (matchId: string) => void;
  headerLiveCount?: number;
  headerTodayData?: TodayResponse | null;
  /** When set, show favorite star on match cards and use for Favorites filter */
  favoriteTeamIds?: string[];
  onToggleFavoriteTeam?: (teamId: string) => void;
  /** When false and user selects Tracked or Favorites filter, redirect to login */
  isAuthed?: boolean;
  openLogin?: (returnPath?: string) => void;
}

export function TodayView({
  onMatchSelect,
  onLeagueSelect,
  pinnedIds = [],
  onTogglePin,
  headerLiveCount,
  headerTodayData,
  favoriteTeamIds: externalFavTeams = [],
  onToggleFavoriteTeam,
  isAuthed = true,
  openLogin,
}: TodayViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<MatchFilter>("all");
  const prevFilter = useRef<MatchFilter>("all");

  // When not authed and user selects Tracked or Favorites, redirect to login
  useEffect(() => {
    if (isAuthed || !openLogin) return;
    if ((filter === "tracked" || filter === "favorites") && prevFilter.current !== filter) {
      openLogin(typeof window !== "undefined" ? window.location.pathname + window.location.search : "/");
    }
    prevFilter.current = filter;
  }, [filter, isAuthed, openLogin]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasDefaultedToTracked = useRef(false);
  const favoriteTeamIds = externalFavTeams;

  useEffect(() => {
    if (pinnedIds.length > 0 && !hasDefaultedToTracked.current) {
      setFilter("tracked");
      hasDefaultedToTracked.current = true;
    }
  }, [pinnedIds.length]);

  const dateStr = formatDateISO(selectedDate);
  const isUserToday =
    selectedDate.getFullYear() === new Date().getFullYear() &&
    selectedDate.getMonth() === new Date().getMonth() &&
    selectedDate.getDate() === new Date().getDate();
  const apiDateStr = dateStr;

  const fetcher = useCallback(
    () => fetchTodayWithCache(apiDateStr, pinnedIds.length > 0 ? pinnedIds : undefined),
    [apiDateStr, pinnedIds],
  );

  const [hasLive, setHasLive] = useState(false);
  const { data, loading, error, refresh, lastSuccessAt } = usePolling<TodayResult>({
    fetcher,
    interval: hasLive ? 5_000 : 15_000,
    intervalWhenHidden: 30_000,
    enabled: true,
    key: apiDateStr,
  });

  const effectiveData = normalizeTodayResult(data);
  const { fromCache, savedAt: cacheSavedAt } = getCacheMeta(data);

  const leagueNames = useMemo(
    () => (effectiveData?.leagues || []).map((l) => l.league_name),
    [effectiveData],
  );
  const { patchMatch } = useESPNLiveMulti(leagueNames, hasLive ? 10000 : 30000);

  useEffect(() => {
    setHasLive((effectiveData?.live ?? 0) > 0);
  }, [effectiveData?.live]);

  useEffect(() => {
    if (scrollRef.current) {
      const todayBtn = scrollRef.current.querySelector("[data-today]");
      if (todayBtn) {
        todayBtn.scrollIntoView({ inline: "center", block: "nearest" });
      }
    }
  }, []);

  const dateStrip = useMemo(() => {
    const today = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(today.getDate() + (i - 3));
      const offset = i - 3;
      let label: string;
      if (offset === 0) label = "TODAY";
      else if (offset === -1) label = "Yesterday";
      else if (offset === 1) label = "Tomorrow";
      else
        label = d.toLocaleDateString("en-US", {
          weekday: "short",
          day: "numeric",
        });
      return { date: d, iso: formatDateISO(d), label, isToday: offset === 0 };
    });
  }, []);

  const isLivePhase = (m: { phase?: string }) => {
    const p = (m.phase || "").toLowerCase();
    return p.startsWith("live") || p === "break";
  };

  const countLiveInResponse = (res: TodayResponse) =>
    (res.leagues ?? []).reduce(
      (sum, lg) => sum + (lg.matches ?? []).filter(isLivePhase).length,
      0,
    );

  const filteredLeagues = useMemo(() => {
    if (!effectiveData?.leagues) return [];
    const favSet = new Set(favoriteTeamIds);
    return effectiveData.leagues
      .map((league) => {
        const filtered = league.matches.filter((m) => {
          if (filter === "tracked") return pinnedIds.includes(m.id);
          if (filter === "all") return true;
          if (filter === "live") return isLivePhase(m);
          if (filter === "favorites")
            return favSet.has(m.home_team.id) || favSet.has(m.away_team.id);
          return true;
        });
        const patched = filtered.map((m) => patchMatch(m));
        return { ...league, matches: patched };
      })
      .filter((league) => league.matches.length > 0);
  }, [effectiveData, filter, pinnedIds, favoriteTeamIds, patchMatch]);

  const liveCountForTab = useMemo(() => {
    return effectiveData?.live ?? headerLiveCount ?? 0;
  }, [effectiveData?.live, headerLiveCount]);

  const trackedCount = useMemo(() => {
    if (!effectiveData?.leagues || pinnedIds.length === 0) return 0;
    const ids = new Set(pinnedIds);
    return effectiveData.leagues.flatMap((l) => l.matches).filter((m) => ids.has(m.id)).length;
  }, [effectiveData?.leagues, pinnedIds]);

  const favoritesCount = useMemo(() => {
    if (!effectiveData?.leagues || favoriteTeamIds.length === 0) return 0;
    const favSet = new Set(favoriteTeamIds);
    return effectiveData.leagues.flatMap((l) => l.matches).filter(
      (m) => favSet.has(m.home_team.id) || favSet.has(m.away_team.id)
    ).length;
  }, [effectiveData?.leagues, favoriteTeamIds]);

  const effectiveLeagues = filteredLeagues;

  const groupedBySport = useMemo(() => {
    const groups: { sport: string; sportType: string; leagues: typeof effectiveLeagues }[] = [];
    const map = new Map<string, typeof effectiveLeagues>();
    for (const league of effectiveLeagues) {
      const key = league.sport_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(league);
    }
    Array.from(map.entries()).forEach(([sportType, leagues]) => {
      groups.push({ sport: leagues[0].sport, sportType, leagues });
    });
    return groups;
  }, [effectiveLeagues]);

  const SPORT_ICONS: Record<string, string> = {
    soccer: "\u26BD",
    basketball: "\uD83C\uDFC0",
    hockey: "\uD83C\uDFD2",
    baseball: "\u26BE",
  };

  const toMatchSummary = (m: TodayMatch) => ({
    id: m.id,
    phase: m.phase,
    start_time: m.start_time,
    venue: m.venue,
    score: m.score,
    clock: m.clock,
    period: m.period,
    version: m.version,
    home_team: m.home_team,
    away_team: m.away_team,
  });

  const filterTabs = [
    { key: "all" as const, label: "All", count: effectiveData?.total_matches },
    { key: "live" as const, label: "Live", count: liveCountForTab },
    ...(!isAuthed && openLogin
      ? [
          { key: "favorites" as const, label: "Favorites", count: 0 },
          { key: "tracked" as const, label: "Tracked", count: 0 },
        ]
      : [
          ...(favoriteTeamIds.length > 0
            ? [{ key: "favorites" as const, label: "Favorites", count: favoritesCount }]
            : []),
          ...(pinnedIds.length > 0
            ? [{ key: "tracked" as const, label: "Tracked", count: trackedCount }]
            : []),
        ]),
  ];

  return (
    <div className="animate-glass-fade-in">
      {/* Date strip */}
      <div
        ref={scrollRef}
        className="mb-3 flex gap-1.5 overflow-x-auto px-2 pb-1 scrollbar-hide"
      >
        {dateStrip.map((item) => {
          const active = item.iso === dateStr;
          return (
            <button
              key={item.iso}
              data-today={item.isToday ? "" : undefined}
              onClick={() => {
                setSelectedDate(new Date(item.date));
              }}
              className={`
                flex-shrink-0 rounded-glass-pill px-3 py-1.5 text-label-md transition-all duration-200 glass-press
                ${active
                  ? "bg-accent-green text-white shadow-glass-sm"
                  : "text-text-muted hover:bg-glass-hover hover:text-text-secondary"
                }
                ${item.isToday && !active ? "text-accent-green" : ""}
              `}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Last updated (when live) */}
      {(effectiveData?.live ?? 0) > 0 && (
        <div className="mb-2 px-3">
          <LastUpdatedIndicator
            lastSuccessAt={lastSuccessAt}
            show={(effectiveData?.live ?? 0) > 0}
          />
        </div>
      )}

      {/* Filter tabs — glass pill bar */}
      <div className="mb-4 px-2">
        <div className="flex gap-0.5 rounded-[14px] border border-glass-border bg-glass p-1">
          {filterTabs.map(({ key, label, count }) => {
            const isActive = filter === key;
            return (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={`
                  relative flex-1 rounded-[10px] px-2 py-1.5 text-label-md uppercase tracking-wider
                  transition-all duration-200
                  ${isActive
                    ? "bg-glass-elevated text-text-primary shadow-glass-sm"
                    : "text-text-muted hover:text-text-secondary hover:bg-glass-hover"
                  }
                `}
              >
                {key === "live" && (count ?? 0) > 0 && (
                  <span className="relative mr-1 inline-flex h-1.5 w-1.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
                  </span>
                )}
                {label}
                {(count ?? 0) > 0 && (
                  <span className={`ml-1 text-label-xs ${isActive ? "opacity-60" : "opacity-40"}`}>({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Stale/cached banner */}
      {effectiveData && (fromCache || error) && (
        <div className="mb-3 mx-2 flex flex-wrap items-center justify-between gap-2 rounded-glass-pill border border-accent-amber/20 bg-accent-amber/10 px-3 py-2 text-label-md">
          <span className="text-amber-700 dark:text-amber-400">
            {fromCache
              ? `Scores temporarily delayed — showing last data${cacheSavedAt ? ` (${formatCacheTime(cacheSavedAt)})` : ""}`
              : "Scores temporarily delayed — updates paused"}
          </span>
          <button
            type="button"
            onClick={() => refresh()}
            className="shrink-0 font-semibold text-amber-700 underline hover:no-underline dark:text-amber-400"
          >
            Try again
          </button>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !effectiveData && (
        <TodayViewSkeleton />
      )}

      {/* Error */}
      {error && !effectiveData && (
        <div className="flex flex-col items-center gap-3 px-3 py-6 text-center">
          <p className="text-label-md text-accent-red">Failed to load matches</p>
          <p className="text-label-md text-text-dim">
            Check your connection. The app needs access to the scores API.
          </p>
          <GlassButton variant="primary" onClick={() => refresh()}>
            Try again
          </GlassButton>
        </div>
      )}

      {/* Sport groups with league sections */}
      {groupedBySport.map((sportGroup) => (
        <div key={sportGroup.sportType} className="mb-5">
          {/* Sport header */}
          <div className="mb-2 flex items-center gap-2.5 px-3 py-1.5">
            <span className="text-base leading-none">
              {SPORT_ICONS[sportGroup.sportType] || "\uD83C\uDFC6"}
            </span>
            <h2 className="text-heading-sm uppercase tracking-wide text-text-primary">
              {sportGroup.sport}
            </h2>
            <GlassDivider className="ml-2 flex-1" />
            <span className="text-label-sm text-text-dim">
              {sportGroup.leagues.reduce((s, l) => s + l.matches.length, 0)}
            </span>
          </div>

          {/* Leagues under this sport */}
          {sportGroup.leagues.map((league) => (
            <section key={league.league_id} className="mb-3 mx-2">
              {/* League header row */}
              <button
                onClick={() => onLeagueSelect(league.league_id)}
                className="flex w-full items-center gap-2 rounded-t-[14px] px-3 py-2 text-left transition-all duration-150 hover:bg-glass-hover glass-press border border-b-0 border-glass-border bg-glass"
              >
                <LeagueLogo name={league.league_name} apiLogoUrl={league.league_logo_url} />
                <span className="text-label-lg text-text-secondary">
                  {league.league_name}
                </span>
                <span className="text-label-sm text-text-dim">
                  {league.league_country}
                </span>
                <GlassPill variant="info" size="xs" className="ml-auto">
                  {league.matches.length}
                </GlassPill>
              </button>

              {/* Match rows */}
              <div className="overflow-hidden rounded-b-[14px] border border-t-0 border-glass-border bg-glass">
                {league.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={toMatchSummary(m)}
                    leagueNameForLink={league.league_name}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                    favoriteTeamIds={favoriteTeamIds}
                    onToggleFavoriteTeam={onToggleFavoriteTeam}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}

      {/* Empty state */}
      {effectiveData && effectiveLeagues.length === 0 && (
        <div className="py-16 px-4 text-center text-body-md text-text-muted">
          {filter === "all"
            ? (error || fromCache
                ? "Scores temporarily unavailable"
                : "No matches on this date")
            : filter === "tracked"
              ? "No tracked matches on this date"
              : `No ${filter} matches`}
          {isUserToday && filter === "all" && (
            <>
              <p className="mt-2 text-label-md text-text-dim">
                {error || fromCache
                  ? "The server could not be reached. Scores will resume automatically when the connection is restored."
                  : "New matches appear throughout the day. If you just set up the app, the backend may need to load match data (run the seed script or start the scheduler)."}
              </p>
              <GlassButton
                variant="primary"
                className="mt-4"
                onClick={() => refresh()}
              >
                {fromCache ? "Try again" : "Refresh"}
              </GlassButton>
            </>
          )}
          {!isUserToday && filter === "all" && (
            <p className="mt-2 text-label-md text-text-dim">
              Pull down or tap Refresh to check for new data.
            </p>
          )}
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-2 block mx-auto text-label-md text-accent-green hover:underline"
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
