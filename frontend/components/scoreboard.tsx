"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchScoreboard } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { isLive } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import type { ScoreboardResponse, TodayResponse } from "@/lib/types";
import { MatchCard } from "./match-card";
import { ScoreboardSkeleton } from "./skeleton";
import { Standings } from "./standings";
import { StatsDashboard } from "./stats-dashboard";
import { EmptyState } from "./ui/empty-state";
import { GlassTabBar, GlassPill, GlassDivider } from "./ui/glass";
import { LastUpdatedIndicator } from "./last-updated-indicator";

interface ScoreboardProps {
  leagueId: string | null;
  todaySnapshot?: TodayResponse | null;
  onMatchSelect: (matchId: string) => void;
  pinnedIds?: string[];
  onTogglePin?: (matchId: string) => void;
  favoriteTeamIds?: string[];
  onToggleFavoriteTeam?: (teamId: string) => void;
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
  todaySnapshot = null,
  onMatchSelect,
  pinnedIds = [],
  onTogglePin,
  favoriteTeamIds = [],
  onToggleFavoriteTeam,
}: ScoreboardProps) {
  const [tab, setTab] = useState<Tab>("matches");

  const fetcher = useCallback(() => {
    if (!leagueId) throw new Error("No league");
    return fetchScoreboard(leagueId);
  }, [leagueId]);

  const todayLeagueData = useMemo(() => {
    if (!leagueId || !todaySnapshot) return null;
    return todaySnapshot.leagues.find((league) => league.league_id === leagueId) ?? null;
  }, [leagueId, todaySnapshot]);

  const [hasLive, setHasLive] = useState(false);
  const { data, loading, error, lastSuccessAt } = usePolling({
    fetcher,
    interval: hasLive ? 5000 : 20000,
    enabled: !!leagueId && !todayLeagueData,
    key: leagueId,
  });

  const effectiveData: ScoreboardResponse | null = useMemo(() => {
    if (todayLeagueData) {
      return {
        league_id: todayLeagueData.league_id,
        league_name: todayLeagueData.league_name,
        matches: todayLeagueData.matches,
        generated_at: todaySnapshot?.generated_at || new Date().toISOString(),
      };
    }
    return data ?? null;
  }, [data, todayLeagueData, todaySnapshot?.generated_at]);

  const effectiveLastSuccessAt = todayLeagueData
    ? Date.parse(todaySnapshot?.generated_at || "")
    : lastSuccessAt;

  const leagueName = effectiveData?.league_name || "";

  useEffect(() => {
    setTab("matches");
  }, [leagueId]);

  const { liveMatches, scheduledMatches, finishedMatches } = useMemo(() => {
    const matches = effectiveData?.matches || [];
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
  }, [effectiveData]);

  useEffect(() => {
    setHasLive(liveMatches.length > 0);
  }, [liveMatches]);

  if (!leagueId) {
    return (
      <div className="py-16 text-center text-body-md text-text-muted">
        Select a league from the sidebar
      </div>
    );
  }

  if (loading && !effectiveData) {
    return <ScoreboardSkeleton />;
  }

  if (error && !effectiveData) {
    return (
      <div className="px-3 py-4 text-center text-label-md text-accent-red">
        Failed to load scoreboard
      </div>
    );
  }

  const tabs = [
    { key: "matches", label: "Matches" },
    { key: "standings", label: "Standings" },
    { key: "stats", label: "Stats" },
  ];

  return (
    <div className="animate-glass-fade-in">
      {/* League header */}
      <div className="mb-4 flex items-center gap-2.5 px-3">
        <LeagueIcon name={leagueName} />
        <h2 className="text-heading-sm text-text-primary">
          {leagueName}
        </h2>
        <GlassDivider className="ml-2 flex-1" />
        <GlassPill variant="info" size="sm">
          {(effectiveData?.matches || []).length} matches
        </GlassPill>
      </div>

      {/* Tab switcher — glass pill style */}
      <div className="mb-4 px-3">
        <GlassTabBar
          tabs={tabs}
          active={tab}
          onSelect={(key) => setTab(key as Tab)}
        />
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
              <div className="mb-1.5 flex items-center gap-2 px-3">
                <GlassPill variant="live" size="sm" pulse>
                  Live
                </GlassPill>
                <LastUpdatedIndicator lastSuccessAt={Number.isFinite(effectiveLastSuccessAt) ? effectiveLastSuccessAt : null} show={liveMatches.length > 0} className="ml-auto" />
              </div>
              <div className="mx-2 overflow-hidden rounded-[14px] border border-glass-border bg-glass">
                {liveMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    leagueNameForLink={leagueName}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                    favoriteTeamIds={favoriteTeamIds}
                    onToggleFavoriteTeam={
                      onToggleFavoriteTeam
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Scheduled */}
          {scheduledMatches.length > 0 && (
            <section className="mb-4">
              <div className="mb-1.5 flex items-center gap-2 px-3">
                <GlassPill variant="info" size="sm">
                  Upcoming
                </GlassPill>
              </div>
              <div className="mx-2 overflow-hidden rounded-[14px] border border-glass-border bg-glass">
                {scheduledMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    leagueNameForLink={leagueName}
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                    favoriteTeamIds={favoriteTeamIds}
                    onToggleFavoriteTeam={
                      onToggleFavoriteTeam
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {/* Finished */}
          {finishedMatches.length > 0 && (
            <section className="mb-4">
              <div className="mb-1.5 flex items-center gap-2 px-3">
                <GlassPill variant="ft" size="sm">
                  Finished
                </GlassPill>
              </div>
              <div className="mx-2 overflow-hidden rounded-[14px] border border-glass-border bg-glass">
                {finishedMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    leagueNameForLink={leagueName}
                    compact
                    pinned={pinnedIds.includes(m.id)}
                    onTogglePin={onTogglePin}
                    favoriteTeamIds={favoriteTeamIds}
                    onToggleFavoriteTeam={
                      onToggleFavoriteTeam
                    }
                  />
                ))}
              </div>
            </section>
          )}

          {(effectiveData?.matches || []).length === 0 && (
            <EmptyState title="No matches today" />
          )}
        </>
      )}
    </div>
  );
}
