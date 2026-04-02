import { useEffect, useRef } from "react";
import { fetchScoreboard } from "@/lib/api";
import { isLive } from "@/lib/utils";
import { isSoundEnabled } from "@/lib/notification-settings";
import { playGoalSound } from "@/lib/sounds";
import { sendScoreNotification } from "@/lib/native-notifications";
import type { LeagueGroup, MatchSummary, TodayResponse } from "@/lib/types";

interface ScoreSnapshot {
  home: number;
  away: number;
  homeName: string;
  awayName: string;
  league: string;
}

/**
 * Monitors live matches across favorite leagues for score changes.
 * Uses the shared /today snapshot first so alerts stay aligned with the home feed.
 */
export function useScoreAlerts(
  leagues: LeagueGroup[],
  favoriteLeagueIds: string[],
  todaySnapshot: TodayResponse | null = null,
): void {
  const prevScores = useRef<Record<string, ScoreSnapshot>>({});

  useEffect(() => {
    if (leagues.length === 0) return;

    const allLeagueIds = leagues.flatMap((group) => group.leagues.map((league) => league.id));
    const idsToMonitor =
      favoriteLeagueIds.length > 0
        ? allLeagueIds.filter((id) => favoriteLeagueIds.includes(id))
        : [];

    if (idsToMonitor.length === 0) return;

    const processMatch = (match: MatchSummary, leagueName: string) => {
      const key = match.id;
      const currentHome = match.score.home;
      const currentAway = match.score.away;
      const prev = prevScores.current[key];

      if (!prev) {
        prevScores.current[key] = {
          home: currentHome,
          away: currentAway,
          homeName: match.home_team.name,
          awayName: match.away_team.name,
          league: leagueName,
        };
        return;
      }

      const homeScored = currentHome > prev.home;
      const awayScored = currentAway > prev.away;

      if (!homeScored && !awayScored) return;

      const scorer = homeScored ? match.home_team.name : match.away_team.name;
      const scoreLine = `${match.home_team.short_name} ${currentHome} - ${currentAway} ${match.away_team.short_name}`;

      if (isSoundEnabled()) {
        playGoalSound();
      }

      sendScoreNotification(
        `⚽ ${scorer} scores!`,
        `${scoreLine} · ${leagueName}`,
        match.id,
      );

      prevScores.current[key] = {
        home: currentHome,
        away: currentAway,
        homeName: match.home_team.name,
        awayName: match.away_team.name,
        league: leagueName,
      };
    };

    const checkScores = async () => {
      if (todaySnapshot?.leagues?.length) {
        for (const league of todaySnapshot.leagues) {
          if (!favoriteLeagueIds.includes(league.league_id)) continue;

          const liveMatches = (league.matches ?? []).filter((match) => isLive(match.phase));
          for (const match of liveMatches) {
            processMatch(match, league.league_name);
          }
        }
        return;
      }

      for (let i = 0; i < idsToMonitor.length; i += 3) {
        const batch = idsToMonitor.slice(i, i + 3);
        const results = await Promise.allSettled(
          batch.map((id) => fetchScoreboard(id)),
        );

        for (const result of results) {
          if (result.status !== "fulfilled") continue;

          const { matches, league_name } = result.value;
          const liveMatches = matches.filter((match) => isLive(match.phase));
          for (const match of liveMatches) {
            processMatch(match, league_name);
          }
        }
      }
    };

    checkScores();
    const timer = setInterval(checkScores, 30000);
    return () => clearInterval(timer);
  }, [favoriteLeagueIds, leagues, todaySnapshot]);
}
