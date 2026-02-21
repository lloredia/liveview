"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchLeagues, fetchLiveCounts } from "@/lib/api";
import type { LeagueGroup } from "@/lib/types";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Scoreboard } from "@/components/scoreboard";
import { TodayView } from "@/components/today-view";
import { LiveTicker } from "@/components/live-ticker";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { MultiTracker } from "@/components/multi-tracker";
import { getPinnedMatches, togglePinned } from "@/lib/pinned-matches";
import { useScoreAlerts } from "@/hooks/use-score-alerts";
import { requestPushPermission, getPushPermission } from "@/lib/push-notifications";
import { getFavoriteLeagues } from "@/lib/favorites";

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);

  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [totalLive, setTotalLive] = useState(0);
  const [todaySnapshot, setTodaySnapshot] = useState<{ leagues?: Array<{ league_id: string; matches: Array<{ phase?: string }> }> } | null>(null);

  useEffect(() => {
    setPinnedIds(getPinnedMatches());
  }, []);

  useEffect(() => {
    setPushEnabled(getPushPermission() === "granted");
  }, []);

  useEffect(() => {
    const leagueParam = searchParams.get("league");
    setSelectedLeague(leagueParam || null);
  }, [searchParams]);

  useEffect(() => {
    fetchLeagues()
      .then((data) => {
        setLeagues(data);
        setConnected(true);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Connection failed");
        setConnected(false);
      });
  }, []);

  useEffect(() => {
    if (leagues.length === 0) return;
    const pollCounts = async () => {
      try {
        const data = await fetchLiveCounts();
        setTodaySnapshot(data);
        const counts: Record<string, number> = {};
        let total = 0;
        const isLive = (m: { phase?: string }) => {
          const p = (m.phase || "").toLowerCase();
          return p.startsWith("live") || p === "break";
        };
        for (const lg of data.leagues ?? []) {
          const liveCount = (lg.matches ?? []).filter(isLive).length;
          if (liveCount > 0) {
            counts[lg.league_id] = liveCount;
            total += liveCount;
          }
        }
        setLiveCounts(counts);
        setTotalLive(total);
      } catch {
        // silent
      }
    };
    pollCounts();
    const timer = setInterval(pollCounts, 30000);
    return () => clearInterval(timer);
  }, [leagues]);

  useEffect(() => {
    const check = async () => {
      try {
        const { getHealthUrl } = await import("@/lib/api");
        const res = await fetch(getHealthUrl());
        setConnected(res.ok);
        if (res.ok) setError(null);
      } catch {
        setConnected(false);
      }
    };
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);

  const [favLeagueIds, setFavLeagueIds] = useState<string[]>([]);
  useEffect(() => {
    setFavLeagueIds(getFavoriteLeagues());
  }, []);

  const favoriteLeagueIds = useMemo(
    () =>
      leagues
        .flatMap((g) => g.leagues)
        .filter((l) => favLeagueIds.includes(l.id))
        .map((l) => l.id),
    [leagues, favLeagueIds],
  );

  useScoreAlerts(leagues, favoriteLeagueIds);

  const handleLeagueSelect = useCallback(
    (id: string) => {
      setSelectedLeague(id);
      router.push(`/?league=${id}`);
      if (window.innerWidth < 768) setSidebarOpen(false);
    },
    [router],
  );

  const handleTodayView = useCallback(() => {
    setSelectedLeague(null);
    router.push("/");
    if (window.innerWidth < 768) setSidebarOpen(false);
  }, [router]);

  const handleMatchSelect = useCallback(
    (matchId: string, leagueName?: string) => {
      const params = leagueName ? `?league=${encodeURIComponent(leagueName)}` : "";
      router.push(`/match/${matchId}${params}`);
    },
    [router],
  );

  const handleTogglePin = useCallback((matchId: string) => {
    const next = togglePinned(matchId);
    setPinnedIds(next);
  }, []);

  const handleRefresh = useCallback(async () => {
    const current = selectedLeague;
    setSelectedLeague(null);
    await new Promise((r) => setTimeout(r, 150));
    setSelectedLeague(current);
  }, [selectedLeague]);

  useEffect(() => {
    const handleResize = () => setSidebarOpen(window.innerWidth >= 768);
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <Header
        connected={connected}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        liveCount={totalLive}
        onLeagueSelect={handleLeagueSelect}
        onMatchSelect={handleMatchSelect}
        pushEnabled={pushEnabled}
        onPushToggle={async () => {
          const granted = await requestPushPermission();
          setPushEnabled(granted);
        }}
      />

      <LiveTicker leagues={leagues} onMatchSelect={handleMatchSelect} />

      <div className="flex flex-1">
        <Sidebar
          leagues={leagues}
          selectedLeagueId={selectedLeague}
          onSelect={handleLeagueSelect}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          liveCounts={liveCounts}
          onTodayClick={handleTodayView}
        />

        <PullToRefresh onRefresh={handleRefresh}>
          <main id="main-content" className="min-w-0 flex-1 px-0 py-3 md:px-4" role="main" aria-label="Match results">
            <div className="mx-auto max-w-[900px]">
              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {totalLive > 0 ? `${totalLive} live matches in progress` : ""}
              </div>

              {error && (
                <div role="alert" className="mx-3 mb-3 rounded border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-[12px] text-accent-red md:mx-0">
                  Cannot connect to API
                  <span className="block text-[10px] opacity-60">{error}</span>
                </div>
              )}

              {selectedLeague ? (
                <Scoreboard
                  leagueId={selectedLeague}
                  onMatchSelect={handleMatchSelect}
                  pinnedIds={pinnedIds}
                  onTogglePin={handleTogglePin}
                />
              ) : (
                <TodayView
                  onMatchSelect={handleMatchSelect}
                  onLeagueSelect={handleLeagueSelect}
                  pinnedIds={pinnedIds}
                  onTogglePin={handleTogglePin}
                  headerLiveCount={totalLive}
                  headerTodayData={todaySnapshot}
                />
              )}
            </div>
          </main>
        </PullToRefresh>
      </div>

      <MultiTracker
        pinnedIds={pinnedIds}
        onPinnedChange={setPinnedIds}
        onMatchSelect={(id) => handleMatchSelect(id)}
      />
    </div>
  );
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}
