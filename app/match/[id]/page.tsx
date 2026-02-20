"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { fetchLeagues, fetchScoreboard } from "@/lib/api";
import type { LeagueGroup } from "@/lib/types";
import { isLive } from "@/lib/utils";
import { Header } from "@/components/header";
import { Sidebar } from "@/components/sidebar";
import { MatchDetail } from "@/components/match-detail";
import { LiveTicker } from "@/components/live-ticker";

export default function MatchPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const matchId = params.id as string;
  const leagueName = searchParams.get("league") || "";

  const [leagues, setLeagues] = useState<LeagueGroup[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [connected, setConnected] = useState(false);

  const [liveCounts, setLiveCounts] = useState<Record<string, number>>({});
  const [totalLive, setTotalLive] = useState(0);

  useEffect(() => {
    fetchLeagues()
      .then((data) => {
        setLeagues(data);
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }, []);

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
          selectedLeagueId={null}
          onSelect={handleLeagueSelect}
          open={sidebarOpen}
          liveCounts={liveCounts}
        />

        <main className="flex-1 overflow-y-auto p-4 md:p-7">
          <MatchDetail matchId={matchId} onBack={handleBack} leagueName={leagueName} />
        </main>
      </div>
    </div>
  );
}