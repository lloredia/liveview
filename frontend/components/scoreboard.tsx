"use client";

import { useCallback, useMemo, useState } from "react";
import { fetchScoreboard } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { isLive } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import { MatchCard } from "./match-card";
import { ScoreboardSkeleton } from "./skeleton";
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
      className="h-6 w-6 object-contain"
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
      <div className="py-16 text-center text-sm text-text-muted">
        Select a league from the sidebar
      </div>
    );
  }

  if (loading && !data) {
    return <ScoreboardSkeleton />;
  }

  if (error && !data) {
    return (
      <div className="px-3 py-4 text-center text-xs text-accent-red">
        Failed to load scoreboard
      </div>
    );
  }

  const leagueName = data?.league_name || "";

  const tabs: { key: Tab; label: string }[] = [
    { key: "matches", label: "Matches" },
    { key: "standings", label: "Standings" },
    { key: "stats", label: "Stats" },
  ];

  return (
    <div>
      {/* League header */}
      <div className="mb-3 flex items-center gap-2.5 px-3">
        <LeagueIcon name={leagueName} />
        <h2 className="text-[15px] font-extrabold text-text-primary">
          {leagueName}
        </h2>
        <div className="ml-2 h-px flex-1 bg-surface-border" />
        <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-medium text-text-muted">
          {(data?.matches || []).length} matches
        </span>
      </div>

      {/* Tab switcher — underline style */}
      <div className="mb-4 flex border-b border-surface-border">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`
              relative px-4 py-2 text-[11px] font-semibold uppercase tracking-wider transition-colors
              ${tab === key
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
              }
            `}
          >
            {label}
            {tab === key && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent-green" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "standings" ? (
        <Standings
          leagueId={leagueId}
          leagueName={leagueName}
          leagueShortName={leagueName}
        />
      ) : tab === "stats" ? (
        <StatsDashboard
          leagueName={leagueName}
          leagueShortName={leagueName}
        />
      ) : (
        <>
          {/* Live */}
          {liveMatches.length > 0 && (
            <section className="mb-4">
              <div className="mb-1 flex items-center gap-2 px-3 text-[11px] font-extrabold uppercase tracking-wider text-accent-red">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-red" />
                </span>
                Live
              </div>
              <div className="border-t border-surface-border">
                {liveMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onClick={() => onMatchSelect(m.id)}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Scheduled */}
          {scheduledMatches.length > 0 && (
            <section className="mb-4">
              <div className="mb-1 px-3 text-[11px] font-extrabold uppercase tracking-wider text-accent-blue">
                Upcoming
              </div>
              <div className="border-t border-surface-border">
                {scheduledMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onClick={() => onMatchSelect(m.id)}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Finished */}
          {finishedMatches.length > 0 && (
            <section className="mb-4">
              <div className="mb-1 px-3 text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
                Finished
              </div>
              <div className="border-t border-surface-border">
                {finishedMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    onClick={() => onMatchSelect(m.id)}
                    compact
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                  />
                ))}
              </div>
            </section>
          )}

          {(data?.matches || []).length === 0 && (
            <div className="py-16 text-center text-sm text-text-muted">
              No matches today
            </div>
          )}
        </>
      )}
    </div>
  );
}
