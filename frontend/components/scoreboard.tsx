"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchScoreboard } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { useESPNLive } from "@/hooks/use-espn-live";
import { isLive } from "@/lib/utils";
import { getLeagueLogo } from "@/lib/league-logos";
import { MatchCard } from "./match-card";
import { ScoreboardSkeleton } from "./skeleton";
import { Standings } from "./standings";
import { StatsDashboard } from "./stats-dashboard";
import { GlassTabBar, GlassPill, GlassDivider } from "./ui/glass";

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

  const [hasLive, setHasLive] = useState(false);
  const { data, loading, error } = usePolling({
    fetcher,
    interval: hasLive ? 10000 : 20000,
    enabled: !!leagueId,
    key: leagueId,
  });

  const leagueName = data?.league_name || "";
  const { patchMatches } = useESPNLive(leagueName, hasLive ? 10000 : 30000);

  useMemo(() => {
    setTab("matches");
  }, [leagueId]);

  const { liveMatches, scheduledMatches, finishedMatches } = useMemo(() => {
    const raw = data?.matches || [];
    const matches = patchMatches(raw);
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
  }, [data, patchMatches]);

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

  if (loading && !data) {
    return <ScoreboardSkeleton />;
  }

  if (error && !data) {
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
          {(data?.matches || []).length} matches
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
              </div>
              <div className="mx-2 overflow-hidden rounded-[14px] border border-glass-border bg-glass">
                {liveMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    leagueNameForLink={leagueName}
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
                  />
                ))}
              </div>
            </section>
          )}

          {(data?.matches || []).length === 0 && (
            <div className="py-16 text-center text-body-md text-text-muted">
              No matches today
            </div>
          )}
        </>
      )}
    </div>
  );
}
