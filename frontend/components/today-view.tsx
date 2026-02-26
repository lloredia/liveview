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

export type { TodayLeagueGroup, TodayResponse } from "@/lib/types";

type MatchFilter = "all" | "tracked" | "live" | "scheduled" | "finished";

/** Result from fetcher: fresh data or cached with metadata */
export type TodayResult =
  | TodayResponse
  | { data: TodayResponse; fromCache: true; savedAt: string };

async function fetchToday(
  dateStr: string | undefined,
  matchIds?: string[],
): Promise<TodayResponse> {
  const params = new URLSearchParams();
  if (dateStr) params.set("date", dateStr);
  if (matchIds?.length) params.set("match_ids", matchIds.join(","));
  const qs = params.toString();
  const url = `${getApiBase()}/v1/today${qs ? `?${qs}` : ""}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/** Fetcher that returns fresh data or falls back to cache on network failure. */
async function fetchTodayWithCache(
  dateStr: string | undefined,
  matchIds?: string[],
): Promise<TodayResult> {
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
  return d.toISOString().split("T")[0];
}

function LeagueLogo({ name }: { name: string }) {
  const [err, setErr] = useState(false);
  const url = getLeagueLogo(name);
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
  /** When viewing today, use this for the Live tab count so it matches the header. */
  headerLiveCount?: number;
  /** Same data the header count came from; use for Live list when our fetch has 0 live so count and list match. */
  headerTodayData?: TodayResponse | null;
}

export function TodayView({
  onMatchSelect,
  onLeagueSelect,
  pinnedIds = [],
  onTogglePin,
  headerLiveCount,
  headerTodayData,
}: TodayViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<MatchFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasDefaultedToTracked = useRef(false);

  // When user has pinned matches, default to "Tracked" view once
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
  // Always send the selected date so API returns matches for the day the user sees (avoids UTC "today" vs local today mismatch).
  const apiDateStr = dateStr;

  const fetcher = useCallback(
    () => fetchTodayWithCache(apiDateStr, pinnedIds.length > 0 ? pinnedIds : undefined),
    [apiDateStr, pinnedIds],
  );

  const [hasLive, setHasLive] = useState(false);
  // Always fetch with the selected date so the list matches the date the user sees (no UTC vs local mismatch from header data).
  const { data, loading, error, refresh } = usePolling<TodayResult>({
    fetcher,
    interval: hasLive ? 10_000 : 20_000,
    intervalWhenHidden: 60_000,
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

  // Scroll date strip to center "today" on mount
  useEffect(() => {
    if (scrollRef.current) {
      const todayBtn = scrollRef.current.querySelector("[data-today]");
      if (todayBtn) {
        todayBtn.scrollIntoView({ inline: "center", block: "nearest" });
      }
    }
  }, []);

  // Build 7-day date strip: 3 past + today + 3 future
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
    return effectiveData.leagues
      .map((league) => {
        const filtered = league.matches.filter((m) => {
          if (filter === "tracked") return pinnedIds.includes(m.id);
          if (filter === "all") return true;
          if (filter === "live") return isLivePhase(m);
          if (filter === "scheduled")
            return m.phase === "scheduled" || m.phase === "pre_match";
          if (filter === "finished")
            return (
              m.phase === "finished" ||
              m.phase === "postponed" ||
              m.phase === "cancelled"
            );
          return true;
        });
        const patched = filtered.map((m) => patchMatch(m));
        return { ...league, matches: patched };
      })
      .filter((league) => league.matches.length > 0);
  }, [effectiveData, filter, pinnedIds, patchMatch]);

  const liveCountForTab = useMemo(() => {
    return effectiveData?.live ?? headerLiveCount ?? 0;
  }, [effectiveData?.live, headerLiveCount]);

  const trackedCount = useMemo(() => {
    if (!effectiveData?.leagues || pinnedIds.length === 0) return 0;
    const ids = new Set(pinnedIds);
    return effectiveData.leagues.flatMap((l) => l.matches).filter((m) => ids.has(m.id)).length;
  }, [effectiveData?.leagues, pinnedIds]);

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
    soccer: "⚽",
    basketball: "🏀",
    hockey: "🏒",
    baseball: "⚾",
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

  return (
    <div>
      {/* Date strip */}
      <div
        ref={scrollRef}
        className="mb-3 flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide"
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
                flex-shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all
                ${active
                  ? "bg-accent-green text-surface shadow-sm"
                  : "text-text-muted hover:bg-surface-hover hover:text-text-secondary"
                }
                ${item.isToday && !active ? "text-accent-green" : ""}
              `}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Filter tabs: Tracked first when user has pins */}
      <div className="mb-4 flex border-b border-surface-border">
        {(
          [
            ...(pinnedIds.length > 0
              ? [{ key: "tracked" as const, label: "Tracked", count: trackedCount }]
              : []),
            { key: "all" as const, label: "All", count: effectiveData?.total_matches },
            { key: "live" as const, label: "Live", count: liveCountForTab },
            { key: "scheduled" as const, label: "Upcoming", count: effectiveData?.scheduled },
            { key: "finished" as const, label: "Finished", count: effectiveData?.finished },
          ]
        ).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`
              relative px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors
              ${filter === key
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
              }
            `}
          >
            {key === "live" && (count ?? 0) > 0 && (
              <span className="relative mr-1 inline-flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
              </span>
            )}
            {label}
            {(count ?? 0) > 0 && (
              <span className="ml-1 text-[10px] opacity-50">({count})</span>
            )}
            {filter === key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-green" />
            )}
          </button>
        ))}
      </div>

      {/* Stale/cached banner: show when we have data but fetch failed or we're showing cache */}
      {effectiveData && (fromCache || error) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px]">
          <span className="text-amber-700 dark:text-amber-400">
            {fromCache
              ? `Showing cached matches${cacheSavedAt ? ` • Updated ${formatCacheTime(cacheSavedAt)}` : ""}`
              : "Updates paused"}
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
          <p className="text-xs text-accent-red">Failed to load matches</p>
          <p className="text-[11px] text-text-dim">
            Check your connection. The app needs access to the scores API.
          </p>
          <button
            type="button"
            onClick={() => refresh()}
            className="rounded-xl bg-accent-blue px-4 py-2 text-xs font-semibold text-white hover:brightness-110 active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
      )}

      {/* Sport groups with league sections */}
      {groupedBySport.map((sportGroup) => (
        <div key={sportGroup.sportType} className="mb-6">
          {/* Sport header */}
          <div className="mb-2 flex items-center gap-2.5 px-3 py-1.5">
            <span className="text-base leading-none">
              {SPORT_ICONS[sportGroup.sportType] || "🏆"}
            </span>
            <h2 className="text-[15px] font-extrabold uppercase tracking-wide text-text-primary">
              {sportGroup.sport}
            </h2>
            <div className="ml-2 h-px flex-1 bg-surface-border" />
            <span className="text-[10px] font-medium text-text-dim">
              {sportGroup.leagues.reduce((s, l) => s + l.matches.length, 0)}
            </span>
          </div>

          {/* Leagues under this sport */}
          {sportGroup.leagues.map((league) => (
            <section key={league.league_id} className="mb-3">
              {/* League header row */}
              <button
                onClick={() => onLeagueSelect(league.league_id)}
                className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors hover:bg-surface-hover"
              >
                <LeagueLogo name={league.league_name} />
                <span className="text-[12px] font-bold text-text-secondary">
                  {league.league_name}
                </span>
                <span className="text-[10px] text-text-dim">
                  {league.league_country}
                </span>
                <span className="ml-auto rounded-full bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                  {league.matches.length}
                </span>
              </button>

              {/* Match rows */}
              <div className="border-t border-surface-border">
                {league.matches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={toMatchSummary(m)}
                    leagueNameForLink={league.league_name}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      ))}

      {/* Empty state */}
      {effectiveData && effectiveLeagues.length === 0 && (
        <div className="py-16 text-center text-sm text-text-muted">
          {filter === "all"
            ? "No matches on this date"
            : filter === "tracked"
              ? "No tracked matches on this date"
              : `No ${filter} matches`}
          {isUserToday && filter === "all" && (
            <p className="mt-2 text-xs text-text-dim">
              New matches appear throughout the day. Pull down to refresh.
            </p>
          )}
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-2 block mx-auto text-xs text-accent-green hover:underline"
            >
              Show all
            </button>
          )}
        </div>
      )}
    </div>
  );
}
