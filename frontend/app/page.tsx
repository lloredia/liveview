"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { useScoreAlerts } from "@/hooks/use-score-alerts";
import { getPushPermission, subscribeToWebPush } from "@/lib/push-notifications";
import { ensureDeviceRegistered } from "@/lib/device";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { OfflineBanner } from "@/components/offline-banner";
import { ProviderAttribution } from "@/components/provider-attribution";
import { hapticSelection } from "@/lib/haptics";
import type { TodayResponse } from "@/components/today-view";
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

function HomeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [selectedLeague, setSelectedLeague] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [totalLive, setTotalLive] = useState(0);
  const totalLiveRef = useRef(0);
  useEffect(() => {
    totalLiveRef.current = totalLive;
  }, [totalLive]);
  const [todaySnapshot, setTodaySnapshot] = useState<TodayResponse | null>(null);
  const online = useOnlineStatus();
  const { isAuthed, requireAuth, openLogin } = useRequireAuth();
  const { token, refresh: refreshToken } = useAuthToken();

  // When authed, load pinned and favorites from backend; when not, keep empty (no local tracking)
  useEffect(() => {
    if (!isAuthed || !token) {
      setPinnedIds([]);
      setFavTeamIds([]);
      setFavLeagueIds([]);
      return;
    }
    (async () => {
      const [pinned, favs] = await Promise.all([
        fetchUserTrackedGames(token),
        fetchUserFavorites(token),
      ]);
      setPinnedIds(pinned);
      setFavTeamIds(favs.teams);
      setFavLeagueIds(favs.leagues);
    })();
  }, [isAuthed, token]);

  // Register device with backend notification system
  useEffect(() => {
    ensureDeviceRegistered()
      .then(() => {
        if (getPushPermission() === "granted") {
          subscribeToWebPush().catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const leagueParam = searchParams?.get("league");
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

  const [tabVisible, setTabVisible] = useState(true);
  useEffect(() => {
    const onVisibility = () => setTabVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (leagues.length === 0) return;
    const isLive = (m: { phase?: string }) => {
      const p = (m.phase || "").toLowerCase();
      return p.startsWith("live") || p === "break";
    };
    const applyTodayData = (data: TodayResponse) => {
      setTodaySnapshot(data);
      const counts: Record<string, number> = {};
      let total = 0;
      for (const lg of data.leagues ?? []) {
        const liveCount = (lg.matches ?? []).filter(isLive).length;
        if (liveCount > 0) {
          counts[lg.league_id] = liveCount;
          total += liveCount;
        }
      }
      setLiveCounts(counts);
      setTotalLive(total);
    };
    const pollCounts = async (retry = false) => {
      try {
        const data = await fetchLiveCounts();
        applyTodayData(data);
      } catch {
        if (!retry) setTimeout(() => pollCounts(true), 2000);
      }
    };
    const getInterval = () =>
      tabVisible ? (totalLiveRef.current > 0 ? 12_000 : 30_000) : 60_000;
    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      pollCounts();
      timer = setTimeout(loop, getInterval());
    };
    loop();
    return () => clearTimeout(timer);
  }, [leagues, tabVisible]);

  useEffect(() => {
    const HEALTH_TIMEOUT_MS = 25_000;
    const check = async () => {
      try {
        const { getHealthUrl } = await import("@/lib/api");
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
        const res = await fetch(getHealthUrl(), { signal: controller.signal });
        clearTimeout(t);
        setConnected(res.ok);
        if (res.ok) {
          setError(null);
          // Re-fetch leagues when backend becomes reachable (e.g. after cold start)
          fetchLeagues()
            .then((data) => {
              setLeagues(data);
              setConnected(true);
            })
            .catch(() => {});
        }
      } catch {
        setConnected(false);
      }
    };
    check();
    const timer = setInterval(check, 30000);
    return () => clearInterval(timer);
  }, []);

  const [favLeagueIds, setFavLeagueIds] = useState<string[]>([]);
  const [favTeamIds, setFavTeamIds] = useState<string[]>([]);

  const favoriteLeagueIds = useMemo(
    () =>
      leagues
        .flatMap((g) => g.leagues)
        .filter((l) => favLeagueIds.includes(l.id))
        .map((l) => l.id),
    [leagues, favLeagueIds],
  );

  useScoreAlerts(leagues, favoriteLeagueIds, todaySnapshot);

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

  const handleTogglePin = useCallback(
    (matchId: string) => {
      hapticSelection();
      requireAuth({
        returnPath: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
        onAuthed: async () => {
          if (!token) return;
          const wasPinned = pinnedIds.includes(matchId);
          if (wasPinned) {
            await removeUserTrackedGame(matchId, token);
          } else {
            await addUserTrackedGame(matchId, {}, token);
          }
          const next = await fetchUserTrackedGames(token);
          setPinnedIds(next);
          refreshToken();
        },
      });
    },
    [requireAuth, token, pinnedIds, refreshToken]
  );

  const refreshFavorites = useCallback(async () => {
    if (!token) return;
    const favs = await fetchUserFavorites(token);
    setFavTeamIds(favs.teams);
    setFavLeagueIds(favs.leagues);
  }, [token]);

  const handleToggleFavoriteTeam = useCallback(
    (teamId: string) => {
      hapticSelection();
      requireAuth({
        returnPath: typeof window !== "undefined" ? window.location.pathname + window.location.search : "/",
        onAuthed: async () => {
          if (!token) return;
          const isFav = favTeamIds.includes(teamId);
          if (isFav) await removeUserFavorite("team", teamId, token);
          else await addUserFavorite("team", teamId, token);
          await refreshFavorites();
        },
      });
    },
    [requireAuth, token, favTeamIds, refreshFavorites]
  );

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
          await refreshFavorites();
        },
      });
    },
    [requireAuth, token, favLeagueIds, refreshFavorites]
  );

  const handleRefresh = useCallback(async () => {
    const current = selectedLeague;
    setSelectedLeague(null);
    await new Promise((r) => setTimeout(r, 150));
    setSelectedLeague(current);
  }, [selectedLeague]);

  const retryConnection = useCallback(() => {
    setError(null);
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
      />

      <LiveTicker todayData={todaySnapshot} onMatchSelect={handleMatchSelect} />

      <div className="flex flex-1">
        <Sidebar
          leagues={leagues}
          selectedLeagueId={selectedLeague}
          onSelect={handleLeagueSelect}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          liveCounts={liveCounts}
          onTodayClick={handleTodayView}
          favoriteLeagueIds={favLeagueIds}
          onToggleFavoriteLeague={handleToggleFavoriteLeague}
        />

        <PullToRefresh onRefresh={handleRefresh}>
          <main id="main-content" className="min-w-0 flex-1 px-0 py-3 md:px-4" role="main" aria-label="Match results">
            {!online && (
              <OfflineBanner onRetry={() => handleRefresh()} />
            )}
            <div className="mx-auto max-w-[900px]">
              <div aria-live="polite" aria-atomic="true" className="sr-only">
                {totalLive > 0 ? `${totalLive} live matches in progress` : ""}
              </div>

              {error && (
                <div role="alert" className="mx-3 mb-3 rounded border border-accent-red/20 bg-accent-red/5 px-3 py-2 text-[12px] text-accent-red md:mx-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>Cannot connect to API</span>
                    <button
                      type="button"
                      onClick={retryConnection}
                      className="rounded bg-accent-red/20 px-2 py-1 text-[11px] font-medium text-accent-red hover:bg-accent-red/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-red focus-visible:outline-offset-2"
                    >
                      Retry
                    </button>
                  </div>
                  <span className="block text-[10px] opacity-60">{error}</span>
                  <span className="mt-2 block text-[11px] text-text-secondary">
                    Make sure the backend is running. Using a deployed API? Set{" "}
                    <strong>NEXT_PUBLIC_API_URL</strong> in <code className="rounded bg-black/20 px-1">frontend/.env.local</code> (e.g.{" "}
                    <strong className="break-all">https://backend-api-production-8b9f.up.railway.app</strong>), then restart the dev server.
                  </span>
                </div>
              )}

              {selectedLeague ? (
                <Scoreboard
                  leagueId={selectedLeague}
                  todaySnapshot={todaySnapshot}
                  onMatchSelect={handleMatchSelect}
                  pinnedIds={pinnedIds}
                  onTogglePin={handleTogglePin}
                  favoriteTeamIds={favTeamIds}
                  onToggleFavoriteTeam={handleToggleFavoriteTeam}
                />
              ) : (
                <TodayView
                  onMatchSelect={handleMatchSelect}
                  onLeagueSelect={handleLeagueSelect}
                  pinnedIds={pinnedIds}
                  onTogglePin={handleTogglePin}
                  headerLiveCount={totalLive}
                  headerTodayData={todaySnapshot}
                  favoriteTeamIds={favTeamIds}
                  onToggleFavoriteTeam={handleToggleFavoriteTeam}
                  isAuthed={isAuthed}
                  openLogin={openLogin}
                />
              )}
              <footer className="mt-6 pb-4 text-center">
                <ProviderAttribution />
                <p className="mt-2 text-label-xs text-text-dim">
                  <Link href="/privacy" className="text-text-muted hover:text-text-secondary hover:underline">
                    Privacy Policy
                  </Link>
                </p>
              </footer>
            </div>
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
            ? async (matchId) => {
                await removeUserTrackedGame(matchId, token);
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
