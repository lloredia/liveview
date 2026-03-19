"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchLeagues, fetchLiveCounts } from "@/lib/api";
import type { LeagueGroup, TodayResponse } from "@/lib/types";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { MatchDetail } from "@/components/match-detail";
import { LiveTicker } from "@/components/live-ticker";
import { MultiTracker } from "@/components/multi-tracker";
import { PullToRefresh } from "@/components/pull-to-refresh";
import { ProviderAttribution } from "@/components/provider-attribution";
import { useRequireAuth } from "@/hooks/use-require-auth";
import { useAuthToken } from "@/hooks/use-auth-token";
import {
  fetchUserTrackedGames,
  addUserTrackedGame,
  removeUserTrackedGame,
  fetchUserFavorites,
  addUserFavorite,
  removeUserFavorite,
} from "@/lib/auth-api";
import { hapticSelection } from "@/lib/haptics";

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = (params?.id as string) || "";
  const leagueName = searchParams?.get("league") || "";

  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [favLeagueIds, setFavLeagueIds] = useState<string[]>([]);

  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [totalLive, setTotalLive] = useState(0);
  const [todaySnapshot, setTodaySnapshot] = useState<TodayResponse | null>(null);
  const [tabVisible, setTabVisible] = useState(true);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const { isAuthed, requireAuth } = useRequireAuth();
  const { token, refresh: refreshToken } = useAuthToken();

  useEffect(() => {
    if (!isAuthed || !token) {
      setPinnedIds([]);
      setFavLeagueIds([]);
      return;
    }
    Promise.all([fetchUserTrackedGames(token), fetchUserFavorites(token)]).then(([pinned, favs]) => {
      setPinnedIds(pinned);
      setFavLeagueIds(favs.leagues);
    });
  }, [isAuthed, token]);

  useEffect(() => {
    fetchLeagues()
      .then((data) => {
        setLeagues(data);
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    const pollLiveCounts = async () => {
      const data = await fetchLiveCounts();
      setTodaySnapshot(data);

      const counts: Record<string, number> = {};
      let total = 0;
      for (const league of data.leagues ?? []) {
        const liveCount = (league.matches ?? []).filter((match) => {
          const phase = (match.phase || "").toLowerCase();
          return phase.startsWith("live") || phase === "break";
        }).length;
        if (liveCount > 0) {
          counts[league.league_id] = liveCount;
          total += liveCount;
        }
      }
      setLiveCounts(counts);
      setTotalLive(total);
    };

    pollLiveCounts();
    const interval = tabVisible ? (totalLive > 0 ? 12_000 : 30_000) : 60_000;
    const timer = setInterval(pollLiveCounts, interval);
    return () => clearInterval(timer);
  }, [tabVisible, totalLive]);

  const handleLeagueSelect = useCallback(
    (id: string) => {
      router.push(`/?league=${id}`);
    },
    [router],
  );

  const handleMatchSelect = useCallback(
    (id: string, league?: string) => {
      const params = league ? `?league=${encodeURIComponent(league)}` : "";
      router.push(`/match/${id}${params}`);
    },
    [router],
  );

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleTogglePin = useCallback(
    (matchId: string) => {
      hapticSelection();
      requireAuth({
        returnPath: typeof window !== "undefined" ? `/match/${matchId}${leagueName ? `?league=${encodeURIComponent(leagueName)}` : ""}` : `/match/${matchId}`,
        onAuthed: async () => {
          if (!token) return;
          const wasPinned = pinnedIds.includes(matchId);
          if (wasPinned) await removeUserTrackedGame(matchId, token);
          else await addUserTrackedGame(matchId, {}, token);
          const next = await fetchUserTrackedGames(token);
          setPinnedIds(next);
          refreshToken();
        },
      });
    },
    [requireAuth, token, pinnedIds, refreshToken, leagueName]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshTrigger((t) => t + 1);
  }, []);

  const handleToggleFavoriteLeague = useCallback(
    (leagueId: string) => {
      hapticSelection();
      requireAuth({
        returnPath: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
        onAuthed: async () => {
          if (!token) return;
          const isFav = favLeagueIds.includes(leagueId);
          if (isFav) await removeUserFavorite("league", leagueId, token);
          else await addUserFavorite("league", leagueId, token);
          const favs = await fetchUserFavorites(token);
          setFavLeagueIds(favs.leagues);
        },
      });
    },
    [requireAuth, token, favLeagueIds]
  );

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
          />

      <LiveTicker todayData={todaySnapshot} onMatchSelect={handleMatchSelect} />

      <div className="flex flex-1">
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <Sidebar
          leagues={leagues}
          selectedLeagueId={null}
          onSelect={handleLeagueSelect}
          open={sidebarOpen}
          liveCounts={liveCounts}
          favoriteLeagueIds={favLeagueIds}
          onToggleFavoriteLeague={handleToggleFavoriteLeague}
        />

        <PullToRefresh onRefresh={handleRefresh}>
          <main className="flex-1 overflow-y-auto p-4 md:p-7">
            <MatchDetail
              matchId={matchId}
              onBack={handleBack}
              leagueName={leagueName}
              pinned={pinnedIds.includes(matchId)}
              onTogglePin={handleTogglePin}
              refreshTrigger={refreshTrigger}
            />
            <footer className="mt-8 pb-6 text-center">
              <ProviderAttribution />
              <p className="mt-2 text-label-xs text-text-dim">
                <Link href="/privacy" className="text-text-muted hover:text-text-secondary hover:underline">
                  Privacy Policy
                </Link>
              </p>
            </footer>
          </main>
        </PullToRefresh>
      </div>

      <MultiTracker
        pinnedIds={pinnedIds}
        todaySnapshot={todaySnapshot}
        onPinnedChange={setPinnedIds}
        onMatchSelect={(id) => handleMatchSelect(id)}
        onRemove={
          isAuthed && token
            ? async (id) => {
                await removeUserTrackedGame(id, token);
                const next = await fetchUserTrackedGames(token);
                setPinnedIds(next);
                refreshToken();
              }
            : undefined
        }
      />
    </div>
  );
}
