"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchESPNScoreboard,
  findESPNMatch,
  getLeagueESPNKey,
  type ESPNLiveMatch,
} from "@/lib/espn-live";
import { isLive } from "@/lib/utils";
import type { MatchSummary } from "@/lib/types";

function shouldPatch(backendPhase: string, espn: ESPNLiveMatch): boolean {
  if (!isLive(backendPhase)) return true;
  return espn.isLive || espn.isFinished;
}

/**
 * Hook that fetches live ESPN data for a single league and patches MatchSummary
 * arrays with real-time scores, phases, and clocks.
 */
export function useESPNLive(leagueName: string, interval = 15000) {
  const [espnData, setEspnData] = useState<ESPNLiveMatch[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const espnKey = getLeagueESPNKey(leagueName);

  const refresh = useCallback(async () => {
    if (!espnKey) return;
    const data = await fetchESPNScoreboard(espnKey);
    setEspnData(data);
  }, [espnKey]);

  useEffect(() => {
    if (!espnKey) return;
    refresh();
    timerRef.current = setInterval(refresh, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [espnKey, interval, refresh]);

  const patchMatches = useCallback(
    (matches: MatchSummary[]): MatchSummary[] => {
      if (espnData.length === 0) return matches;

      return matches.map((m) => {
        const espn = findESPNMatch(
          espnData,
          m.home_team.name,
          m.away_team.name,
        );
        if (!espn || !shouldPatch(m.phase, espn)) return m;

        return {
          ...m,
          phase: espn.phase,
          clock: espn.clock,
          period: espn.period,
          score: {
            home: espn.homeScore,
            away: espn.awayScore,
          },
        };
      });
    },
    [espnData],
  );

  const findMatch = useCallback(
    (homeTeamName: string, awayTeamName: string): ESPNLiveMatch | null => {
      return findESPNMatch(espnData, homeTeamName, awayTeamName);
    },
    [espnData],
  );

  return { espnData, patchMatches, findMatch, refresh };
}

/**
 * Hook that fetches live ESPN data for multiple leagues simultaneously.
 * Used by the TodayView which displays matches from many leagues at once.
 */
export function useESPNLiveMulti(leagueNames: string[], interval = 15000) {
  const [allData, setAllData] = useState<Map<string, ESPNLiveMatch[]>>(new Map());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const namesRef = useRef(leagueNames);
  namesRef.current = leagueNames;

  const refresh = useCallback(async () => {
    const names = namesRef.current;
    const uniqueKeys = new Map<string, string>();
    for (const name of names) {
      const key = getLeagueESPNKey(name);
      if (key && !uniqueKeys.has(key)) {
        uniqueKeys.set(key, name);
      }
    }

    if (uniqueKeys.size === 0) return;

    const entries = Array.from(uniqueKeys.entries());
    const results = await Promise.allSettled(
      entries.map(([key]) => fetchESPNScoreboard(key)),
    );

    const newMap = new Map<string, ESPNLiveMatch[]>();
    entries.forEach(([key], i) => {
      const result = results[i];
      if (result.status === "fulfilled") {
        newMap.set(key, result.value);
      }
    });

    setAllData(newMap);
  }, []);

  const namesKey = leagueNames.sort().join("|");

  useEffect(() => {
    if (leagueNames.length === 0) return;
    refresh();
    timerRef.current = setInterval(refresh, interval);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [namesKey, interval, refresh]);

  const findMatch = useCallback(
    (homeTeamName: string, awayTeamName: string): ESPNLiveMatch | null => {
      for (const matches of Array.from(allData.values())) {
        const found = findESPNMatch(matches, homeTeamName, awayTeamName);
        if (found) return found;
      }
      return null;
    },
    [allData],
  );

  const patchMatch = useCallback(
    <T extends { phase: string; clock: string | null; period: string | null; score: { home: number; away: number }; home_team: { name: string }; away_team: { name: string } }>(
      m: T,
    ): T => {
      const espn = findMatch(m.home_team.name, m.away_team.name);
      if (!espn || !shouldPatch(m.phase, espn)) return m;

      return {
        ...m,
        phase: espn.phase,
        clock: espn.clock,
        period: espn.period,
        score: {
          home: espn.homeScore,
          away: espn.awayScore,
        },
      };
    },
    [findMatch],
  );

  return { allData, findMatch, patchMatch, refresh };
}
