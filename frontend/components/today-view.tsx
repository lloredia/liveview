"use client";

import { useCallback, useMemo, useState } from "react";
import { usePolling } from "@/hooks/use-polling";
import { isLive } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import { MatchCard } from "./match-card";

// ── Types ────────────────────────────────────────────────────────────

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

// ── Filter type ──────────────────────────────────────────────────────

type MatchFilter = "all" | "live" | "scheduled" | "finished";

// ── API fetch ────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function fetchToday(dateStr: string): Promise<TodayResponse> {
  const res = await fetch(`${API_BASE}/v1/today?date=${dateStr}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Date helpers ─────────────────────────────────────────────────────

function formatDateISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

function formatDateDisplay(d: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const iso = formatDateISO(d);
  if (iso === formatDateISO(today)) return "Today";
  if (iso === formatDateISO(yesterday)) return "Yesterday";
  if (iso === formatDateISO(tomorrow)) return "Tomorrow";

  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── League logo helper ───────────────────────────────────────────────

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

// ── Main component ───────────────────────────────────────────────────

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

  const dateStr = formatDateISO(selectedDate);

  const fetcher = useCallback(() => fetchToday(dateStr), [dateStr]);

  const { data, loading, error } = usePolling({
    fetcher,
    interval: 20000,
    enabled: true,
    key: dateStr,
  });

  // Date navigation
  const goToPrev = useCallback(() => {
    setSelectedDate((d) => {
      const prev = new Date(d);
      prev.setDate(d.getDate() - 1);
      return prev;
    });
  }, []);

  const goToNext = useCallback(() => {
    setSelectedDate((d) => {
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      return next;
    });
  }, []);

  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  // Filter leagues and matches
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

  // Convert TodayMatch to MatchSummary format for MatchCard
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

  const isToday = formatDateISO(selectedDate) === formatDateISO(new Date());

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
          📅 All Matches
        </h2>
        {data && (
          <span className="text-[11px] text-text-muted">
            {data.total_matches} match{data.total_matches !== 1 ? "es" : ""}
            {data.live > 0 && (
              <span className="ml-1.5 text-red-400">
                • {data.live} live
              </span>
            )}
          </span>
        )}
      </div>

      {/* Date Picker */}
      <div className="mb-5 flex items-center gap-2">
        <button
          onClick={goToPrev}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border bg-surface-card text-text-secondary transition-colors hover:bg-surface-hover"
          aria-label="Previous day"
        >
          ‹
        </button>

        <div className="flex flex-1 items-center justify-center gap-2">
          <button
            onClick={goToToday}
            className={
              "rounded-lg px-4 py-2 text-sm font-bold transition-all " +
              (isToday
                ? "bg-accent-green/10 text-accent-green"
                : "bg-surface-card text-text-secondary hover:bg-surface-hover")
            }
          >
            {formatDateDisplay(selectedDate)}
          </button>

          <input
            type="date"
            value={dateStr}
            onChange={(e) => {
              if (e.target.value) {
                const [y, m, d] = e.target.value.split("-").map(Number);
                setSelectedDate(new Date(y, m - 1, d));
              }
            }}
            className="h-9 rounded-lg border border-surface-border bg-surface-card px-2 text-xs text-text-secondary"
          />
        </div>

        <button
          onClick={goToNext}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-surface-border bg-surface-card text-text-secondary transition-colors hover:bg-surface-hover"
          aria-label="Next day"
        >
          ›
        </button>
      </div>

      {/* Quick date buttons */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1">
        {[-2, -1, 0, 1, 2, 3].map((offset) => {
          const d = new Date();
          d.setDate(d.getDate() + offset);
          const dStr = formatDateISO(d);
          const isSelected = dStr === dateStr;
          return (
            <button
              key={offset}
              onClick={() => setSelectedDate(new Date(d))}
              className={
                "flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all " +
                (isSelected
                  ? "bg-accent-green text-white shadow-sm"
                  : "bg-surface-card text-text-tertiary hover:bg-surface-hover hover:text-text-secondary")
              }
            >
              {offset === 0
                ? "Today"
                : offset === -1
                  ? "Yesterday"
                  : offset === 1
                    ? "Tomorrow"
                    : d.toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
            </button>
          );
        })}
      </div>

      {/* Filter tabs */}
      <div className="mb-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {(
          [
            { key: "all", label: "All", count: data?.total_matches },
            { key: "live", label: "🔴 Live", count: data?.live },
            { key: "scheduled", label: "Upcoming", count: data?.scheduled },
            { key: "finished", label: "Finished", count: data?.finished },
          ] as const
        ).map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={
              "flex-1 rounded-lg py-2 text-[11px] font-semibold uppercase tracking-wider transition-all " +
              (filter === key
                ? "bg-surface-hover text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary")
            }
          >
            {label}
            {count !== undefined && count > 0 && (
              <span className="ml-1 text-[10px] opacity-60">({count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
        </div>
      )}

      {/* Error */}
      {error && !data && (
        <div className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
          ⚠ Failed to load matches: {error}
        </div>
      )}

      {/* Match groups by league */}
      {filteredLeagues.map((league) => {
        const liveMatches = league.matches.filter(
          (m) => m.phase.startsWith("live") || m.phase === "break",
        );
        const scheduledMatches = league.matches.filter(
          (m) => m.phase === "scheduled" || m.phase === "pre_match",
        );
        const finishedMatches = league.matches.filter(
          (m) =>
            m.phase === "finished" ||
            m.phase === "postponed" ||
            m.phase === "cancelled",
        );

        return (
          <section key={league.league_id} className="mb-6">
            {/* League header */}
            <button
              onClick={() => onLeagueSelect(league.league_id)}
              className="mb-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover"
            >
              <LeagueLogo name={league.league_name} />
              <div>
                <span className="text-[13px] font-bold text-text-primary">
                  {league.league_name}
                </span>
                <span className="ml-2 text-[10px] text-text-dim">
                  {league.league_country}
                </span>
              </div>
              <span className="ml-auto text-[10px] text-text-muted">
                {league.matches.length} match
                {league.matches.length !== 1 ? "es" : ""}
              </span>
            </button>

            {/* Live */}
            {liveMatches.length > 0 && (
              <div className="mb-2">
                <div className="mb-1.5 flex items-center gap-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.1em] text-red-400">
                  <div className="relative h-1.5 w-1.5">
                    <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                    <div className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
                  </div>
                  Live
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {liveMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={toMatchSummary(m)}
                      onClick={() => onMatchSelect(m.id)}
                      pinned={pinnedIds.includes(m.id)}
                      onTogglePin={onTogglePin}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Scheduled */}
            {scheduledMatches.length > 0 && (
              <div className="mb-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {scheduledMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={toMatchSummary(m)}
                      onClick={() => onMatchSelect(m.id)}
                      pinned={pinnedIds.includes(m.id)}
                      onTogglePin={onTogglePin}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Finished */}
            {finishedMatches.length > 0 && (
              <div className="mb-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {finishedMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      match={toMatchSummary(m)}
                      onClick={() => onMatchSelect(m.id)}
                      compact
                      pinned={pinnedIds.includes(m.id)}
                      onTogglePin={onTogglePin}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })}

      {/* Empty state */}
      {data && filteredLeagues.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
          <div className="text-3xl">
            {filter === "live" ? "📡" : filter === "finished" ? "🏁" : "📭"}
          </div>
          <div className="text-sm text-text-tertiary">
            {filter === "live"
              ? "No live matches right now"
              : filter === "finished"
                ? "No finished matches yet"
                : filter === "scheduled"
                  ? "No upcoming matches"
                  : `No matches on ${formatDateDisplay(selectedDate)}`}
          </div>
          {filter !== "all" && (
            <button
              onClick={() => setFilter("all")}
              className="mt-1 text-xs text-accent-green hover:underline"
            >
              Show all matches
            </button>
          )}
        </div>
      )}
    </div>
  );
}