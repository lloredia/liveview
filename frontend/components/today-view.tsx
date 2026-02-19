"use client";

import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { getLeagueLogo } from "@/lib/league-logos";
import { MatchCard } from "./match-card";
import { TodayViewSkeleton } from "./skeleton";

interface TodayTeam {
  id: string;
  name: string;
  short_name: string;
  logo_url: string | null;
}

interface TodayMatch {
  id: string;
  phase: string;
  start_time: string | null;
  venue: string | null;
  score: { home: number; away: number };
  clock: string | null;
  period: string | null;
  version: number;
  home_team: TodayTeam;
  away_team: TodayTeam;
}

interface TodayLeagueGroup {
  league_id: string;
  league_name: string;
  league_short_name: string | null;
  league_country: string;
  league_logo_url: string | null;
  sport: string;
  sport_type: string;
  matches: TodayMatch[];
}

interface TodayResponse {
  date: string;
  total_matches: number;
  live: number;
  finished: number;
  scheduled: number;
  leagues: TodayLeagueGroup[];
  generated_at: string;
}

type MatchFilter = "all" | "live" | "scheduled" | "finished";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchToday(dateStr: string): Promise<TodayResponse> {
  const res = await fetch(`${API_BASE}/v1/today?date=${dateStr}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
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
}

export function TodayView({
  onMatchSelect,
  onLeagueSelect,
  pinnedIds = [],
  onTogglePin,
}: TodayViewProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [filter, setFilter] = useState<MatchFilter>("all");
  const scrollRef = useRef<HTMLDivElement>(null);

  const dateStr = formatDateISO(selectedDate);

  const fetcher = useCallback(() => fetchToday(dateStr), [dateStr]);

  const { data, loading, error } = usePolling({
    fetcher,
    interval: 20000,
    enabled: true,
    key: dateStr,
  });

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

  const filteredLeagues = useMemo(() => {
    if (!data?.leagues) return [];
    return data.leagues
      .map((league) => {
        const filtered = league.matches.filter((m) => {
          if (filter === "all") return true;
          if (filter === "live")
            return m.phase.startsWith("live") || m.phase === "break";
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
        return { ...league, matches: filtered };
      })
      .filter((league) => league.matches.length > 0);
  }, [data, filter]);

  const groupedBySport = useMemo(() => {
    const groups: { sport: string; sportType: string; leagues: typeof filteredLeagues }[] = [];
    const map = new Map<string, typeof filteredLeagues>();
    for (const league of filteredLeagues) {
      const key = league.sport_type;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(league);
    }
    Array.from(map.entries()).forEach(([sportType, leagues]) => {
      groups.push({ sport: leagues[0].sport, sportType, leagues });
    });
    return groups;
  }, [filteredLeagues]);

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

      {/* Filter tabs */}
      <div className="mb-4 flex border-b border-surface-border">
        {(
          [
            { key: "all", label: "All", count: data?.total_matches },
            { key: "live", label: "Live", count: data?.live },
            { key: "scheduled", label: "Upcoming", count: data?.scheduled },
            { key: "finished", label: "Finished", count: data?.finished },
          ] as const
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

      {/* Loading skeleton */}
      {loading && !data && (
        <TodayViewSkeleton />
      )}

      {/* Error */}
      {error && !data && (
        <div className="px-3 py-4 text-center text-xs text-accent-red">
          Failed to load matches
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
                    onClick={() => onMatchSelect(m.id)}
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
      {data && filteredLeagues.length === 0 && (
        <div className="py-16 text-center text-sm text-text-muted">
          {filter === "all"
            ? "No matches on this date"
            : `No ${filter} matches`}
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
