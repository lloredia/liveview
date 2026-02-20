import { useEffect, useRef } from "react";
import { fetchScoreboard } from "@/lib/api";
import { isLive } from "@/lib/utils";
import { isSoundEnabled } from "@/lib/notification-settings";
import { playGoalSound } from "@/lib/sounds";
import {
  getPushPermission,
  sendLocalNotification,
} from "@/lib/push-notifications";
import type { LeagueGroup, MatchSummary } from "@/lib/types";

interface ScoreSnapshot {
  home: number;
  away: number;
  homeName: string;
  awayName: string;
  league: string;
}

/**
 * Monitors live matches across all leagues for score changes.
 * Sends browser notifications and plays sounds when a score changes.
 */
export function useScoreAlerts(
  leagues: LeagueGroup[],
  favoriteLeagueIds: string[],
): void {
  const prevScores = useRef<Record<string, ScoreSnapshot>>({});

  useEffect(() => {
    if (leagues.length === 0) return;

    // Get all league IDs to monitor (favorites first, then all)
    const allLeagueIds = leagues.flatMap((g) => g.leagues.map((l) => l.id));
    const idsToMonitor =
      favoriteLeagueIds.length > 0
        ? allLeagueIds.filter((id) => favoriteLeagueIds.includes(id))
        : [];

    if (idsToMonitor.length === 0) return;

    const checkScores = async () => {
      for (let i = 0; i < idsToMonitor.length; i += 3) {
        const batch = idsToMonitor.slice(i, i + 3);
        const results = await Promise.allSettled(
          batch.map((id) => fetchScoreboard(id)),
        );

        for (const result of results) {
          if (result.status !== "fulfilled") continue;

          const { matches, league_name } = result.value;
          const liveMatches = matches.filter((m) => isLive(m.phase));

          for (const match of liveMatches) {
            processMatch(match, league_name);
          }
        }
      }
    };

    const processMatch = (match: MatchSummary, leagueName: string) => {
      const key = match.id;
      const currentHome = match.score.home;
      const currentAway = match.score.away;

      const prev = prevScores.current[key];

      if (!prev) {
        // First time seeing this match — store snapshot
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

      if (homeScored || awayScored) {
        const scorer = homeScored ? match.home_team.name : match.away_team.name;
        const scoreLine = `${match.home_team.short_name} ${currentHome} - ${currentAway} ${match.away_team.short_name}`;

        // Play sound
        if (isSoundEnabled()) {
          playGoalSound();
        }

        // Send browser notification
        if (getPushPermission() === "granted") {
          sendLocalNotification(
            `⚽ ${scorer} scores!`,
            `${scoreLine} · ${leagueName}`,
            match.home_team.logo_url || undefined,
          );
        }

        // Update snapshot
        prevScores.current[key] = {
          home: currentHome,
          away: currentAway,
          homeName: match.home_team.name,
          awayName: match.away_team.name,
          league: leagueName,
        };
      }
    };

    // Poll every 30 seconds
    checkScores();
    const timer = setInterval(checkScores, 30000);

    return () => clearInterval(timer);
  }, [leagues, favoriteLeagueIds]);
}