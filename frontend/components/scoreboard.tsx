"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchScoreboard } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { isLive } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import { MatchCard } from "./match-card";
import { Standings } from "./standings";
import { StatsDashboard } from "./stats-dashboard";

interface ScoreboardProps {
  leagueId: string | null;
  onMatchSelect: (matchId: string) => void;
  pinnedIds?: string[];
  onTogglePin?: (matchId: string) => void;
}

type Tab = "matches" | "standings" | "stats";

function LeagueIcon({ name }: { name: string }) {
  const [err, setErr] = useState(false);
  const url = getLeagueLogo(name);
  if (!url || err) return null;
  return (
    <img
      src={url}
      alt={name}
      className="h-8 w-8 object-contain"
      onError={() => setErr(true)}
    />
  );
}

export function Scoreboard({
  leagueId,
  onMatchSelect,
  pinnedIds = [],
  onTogglePin,
}: ScoreboardProps) {
  const [tab, setTab] = useState<Tab>("matches");

  const fetcher = useCallback(() => {
    if (!leagueId) throw new Error("No league");
    return fetchScoreboard(leagueId);
  }, [leagueId]);

  const { data, loading, error } = usePolling({
    fetcher,
    interval: 20000,
    enabled: !!leagueId,
    key: leagueId,
  });

  // Reset to matches tab when league changes
  useMemo(() => {
    setTab("matches");
  }, [leagueId]);

  const { liveMatches, scheduledMatches, finishedMatches } = useMemo(() => {
    const matches = data?.matches || [];
    return {
      liveMatches: matches.filter((m) => isLive(m.phase)),
      scheduledMatches: matches.filter(
        (m) => m.phase === "scheduled" || m.phase === "pre_match"
      ),
      finishedMatches: matches.filter(
        (m) =>
          m.phase === "finished" ||
          m.phase === "postponed" ||
          m.phase === "cancelled"
      ),
    };
  }, [data]);

  if (!leagueId) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-3 text-center">
        <div className="text-4xl">🏟</div>
        <div className="text-base font-medium text-text-tertiary">
          Select a league
        </div>
        <div className="text-xs text-text-dim">
          Choose from the sidebar to see today&apos;s matches
        </div>
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
        ⚠ Failed to load scoreboard: {error}
      </div>
    );
  }

  const totalMatches = (data?.matches || []).length;
  const leagueName = data?.league_name || "";
  const leagueShortName = leagueName;

  const renderCard = (
    m: (typeof liveMatches)[0],
    compact = false
  ) => (
    <MatchCard
      key={m.id}
      match={m}
      onClick={() => onMatchSelect(m.id)}
      compact={compact}
      pinned={pinnedIds.includes(m.id)}
      onTogglePin={onTogglePin}
    />
  );

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <LeagueIcon name={leagueName} />
          <h2 className="text-xl font-extrabold tracking-tight text-text-primary">
            {leagueName}
          </h2>
        </div>
        <span className="text-[11px] text-text-muted">
          {totalMatches} match{totalMatches !== 1 ? "es" : ""}
        </span>
      </div>

      {/* Tab switcher */}
      <div className="mb-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        <button
          onClick={() => setTab("matches")}
          className={
            "flex-1 rounded-lg py-2 text-[12px] font-semibold uppercase tracking-wider transition-all " +
            (tab === "matches"
              ? "bg-surface-hover text-text-primary shadow-sm"
              : "text-text-tertiary hover:text-text-secondary")
          }
        >
          ⚽ Matches
        </button>
        <button
          onClick={() => setTab("standings")}
          className={
            "flex-1 rounded-lg py-2 text-[12px] font-semibold uppercase tracking-wider transition-all " +
            (tab === "standings"
              ? "bg-surface-hover text-text-primary shadow-sm"
              : "text-text-tertiary hover:text-text-secondary")
          }
        >
          📊 Standings
        </button>
        <button
          onClick={() => setTab("stats")}
          className={
            "flex-1 rounded-lg py-2 text-[12px] font-semibold uppercase tracking-wider transition-all " +
            (tab === "stats"
              ? "bg-surface-hover text-text-primary shadow-sm"
              : "text-text-tertiary hover:text-text-secondary")
          }
        >
          🏆 Stats
        </button>
      </div>

      {/* Tab content */}
      {tab === "standings" ? (
        <Standings
          leagueId={leagueId}
          leagueName={leagueName}
          leagueShortName={leagueShortName}
        />
      ) : tab === "stats" ? (
        <StatsDashboard
          leagueName={leagueName}
          leagueShortName={leagueShortName}
        />
      ) : (
        <>
          {/* Live section */}
          {liveMatches.length > 0 && (
            <section className="mb-7">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.1em] text-red-400">
                <div className="relative h-2 w-2">
                  <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
                  <div className="relative h-2 w-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)]" />
                </div>
                Live Now
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {liveMatches.map((m) => renderCard(m))}
              </div>
            </section>
          )}

          {/* Scheduled */}
          {scheduledMatches.length > 0 && (
            <section className="mb-7">
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-accent-blue">
                Upcoming
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {scheduledMatches.map((m) => renderCard(m))}
              </div>
            </section>
          )}

          {/* Finished */}
          {finishedMatches.length > 0 && (
            <section>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
                Finished
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {finishedMatches.map((m) => renderCard(m, true))}
              </div>
            </section>
          )}

          {totalMatches === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <div className="text-3xl">📭</div>
              <div className="text-sm text-text-tertiary">
                No matches today
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
