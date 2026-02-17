"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { fetchLeagues, fetchScoreboard } from "@/lib/api";
import type { LeagueGroup } from "@/lib/types";
import { isLive } from "@/lib/utils";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { Scoreboard } from "@/components/scoreboard";
import { LiveTicker } from "@/components/live-ticker";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { MultiTracker } from "@/components/multi-tracker";
import { getPinnedMatches, togglePinned } from "@/lib/pinned-matches";
import { useScoreAlerts } from "@/hooks/use-score-alerts";
import { requestPushPermission, getPushPermission } from "@/lib/push-notifications";

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

  // Load pinned matches
  useEffect(() => {
    setPinnedIds(getPinnedMatches());
  }, []);

  // Check push permission
  useEffect(() => {
    setPushEnabled(getPushPermission() === "granted");
  }, []);

  // Sync URL → state
  useEffect(() => {
    const leagueParam = searchParams.get("league");
    if (leagueParam) {
      setSelectedLeague(leagueParam);
    }
  }, [searchParams]);

  // Initial data fetch
  useEffect(() => {
    fetchLeagues()
      .then((data) => {
        setLeagues(data);
        setConnected(true);
        if (!selectedLeague && data.length > 0 && data[0].leagues?.length > 0) {
          setSelectedLeague(data[0].leagues[0].id);
        }
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : "Connection failed");
        setConnected(false);
      });
  }, []);

  // Poll live counts
  useEffect(() => {
    if (leagues.length === 0) return;

    const pollLiveCounts = async () => {
      const allIds = leagues.flatMap((g) => g.leagues.map((l) => l.id));
      const counts: Record<string, number> = {};
      let total = 0;

      for (let i = 0; i < allIds.length; i += 5) {
        const batch = allIds.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map((id) => fetchScoreboard(id)),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            const liveCount = r.value.matches.filter((m) => isLive(m.phase)).length;
            if (liveCount > 0) {
              counts[r.value.league_id] = liveCount;
              total += liveCount;
            }
          }
        }
      }

      setLiveCounts(counts);
      setTotalLive(total);
    };

    pollLiveCounts();
    const timer = setInterval(pollLiveCounts, 45000);
    return () => clearInterval(timer);
  }, [leagues]);

  // Health check
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

  // Get favorite league IDs for score alerts
  const favoriteLeagueIds = leagues
    .flatMap((g) => g.leagues)
    .filter((l) => {
      try {
        const favs = JSON.parse(localStorage.getItem("lv_favorites") || "{}");
        return favs.leagues?.includes(l.id);
      } catch {
        return false;
      }
    })
    .map((l) => l.id);

  // Score alerts for favorited leagues
  useScoreAlerts(leagues, favoriteLeagueIds);

  const handleLeagueSelect = useCallback(
    (id: string) => {
      setSelectedLeague(id);
      router.push(`/?league=${id}`);
      if (window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [router],
  );

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

  // Responsive sidebar
  useEffect(() => {
    const handleResize = () => {
      setSidebarOpen(window.innerWidth >= 768);
    };
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
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          leagues={leagues}
          selectedLeagueId={selectedLeague}
          onSelect={handleLeagueSelect}
          open={sidebarOpen}
          liveCounts={liveCounts}
        />

        <PullToRefresh onRefresh={handleRefresh}>
          <main className="p-4 md:p-7">
            {error && (
              <div className="mb-5 animate-fade-in rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-[13px] text-accent-red">
                ⚠ Cannot connect to API — make sure the backend is running.
                <span className="block text-[11px] text-accent-red/60">{error}</span>
              </div>
            )}

            <Scoreboard
              leagueId={selectedLeague}
              onMatchSelect={handleMatchSelect}
              pinnedIds={pinnedIds}
              onTogglePin={handleTogglePin}
            />
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
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
        </div>
      }
    >
      <HomeContent />
    </Suspense>
  );
}