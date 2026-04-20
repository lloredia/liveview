"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Highlights } from "../highlights";
import {
  ApiError,
  fetchMatch,
  fetchMatchDetails,
  type MatchCenterDetailsResponse,
} from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import {
  formatDate,
  formatTime,
  isLive,
  phaseColor,
  phaseLabelWithClock,
} from "@/lib/utils";
import { TeamLogo } from "../team-logo";
import { ShareButton } from "../share-button";
import { AnimatedScore } from "../animated-score";
import { MatchForm } from "../match-form";
import { HeadToHead } from "../head-to-head";
import { useTheme } from "@/lib/theme";
import type { MatchDetailResponse } from "@/lib/types";

import { ScoreWatcher } from "./score-watcher";
import { SoccerPlayerDetailModal } from "./soccer-player-modal";
import { PlayByPlayTab } from "./tabs/play-by-play";
import { PlayerStatsTab } from "./tabs/player-stats";
import { LineupTab } from "./tabs/lineup";
import { TeamStatsTab } from "./tabs/team-stats";
import { getLeagueMapping, TAB_LABELS } from "./helpers";
import type {
  CanonicalMatchState,
  MatchCenterLineupSection,
  MatchCenterPlayByPlaySection,
  MatchCenterPlayerStatsSection,
  MatchCenterTeamStatsSection,
  MatchDetailProps,
  SoccerPlayerSelection,
  Tab,
} from "./types";

export function MatchDetail({
  matchId,
  onBack,
  leagueName = "",
  pinned = false,
  onTogglePin,
  refreshTrigger,
}: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("play_by_play");
  const [selectedSoccerPlayer, setSelectedSoccerPlayer] =
    useState<SoccerPlayerSelection | null>(null);

  const matchFetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const detailsFetcher = useCallback(() => fetchMatchDetails(matchId), [matchId]);
  const {
    data: detailsData,
    loading: detailsLoading,
    refresh: refreshDetails,
  } = usePolling<MatchCenterDetailsResponse>({
    fetcher: detailsFetcher,
    interval: 15000,
    intervalWhenHidden: 45000,
    enabled: true,
    key: `match-details-${matchId}`,
  });
  const headerData = detailsData?.header ?? null;
  const matchPollingEnabled = !headerData;
  const {
    data: matchData,
    loading: matchLoading,
    lastError: matchError,
    refresh: refreshMatch,
  } = usePolling<MatchDetailResponse>({
    fetcher: matchFetcher,
    interval: 15000,
    enabled: matchPollingEnabled,
    key: matchId,
  });

  useEffect(() => {
    if (refreshTrigger != null && refreshTrigger > 0) {
      refreshMatch();
      refreshDetails();
    }
  }, [refreshTrigger, refreshDetails, refreshMatch]);

  const leagueForESPN =
    leagueName || headerData?.league?.name || matchData?.league?.name || "";

  // Soccer: show lineup/player_stats tabs when league is a known soccer league.
  const isSoccerLeague = !!(
    leagueForESPN && getLeagueMapping(leagueForESPN)?.sport === "soccer"
  );
  const isSoccer = isSoccerLeague;
  const tabs: Tab[] = isSoccer
    ? ["play_by_play", "player_stats", "lineup", "team_stats"]
    : ["play_by_play", "player_stats", "team_stats"];

  useEffect(() => {
    if (activeTab === "lineup" && !tabs.includes("lineup"))
      setActiveTab("play_by_play");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, isSoccer]);

  const backendSections = detailsData?.sections ?? null;
  const detailSections: {
    playByPlay: MatchCenterPlayByPlaySection;
    playerStats: MatchCenterPlayerStatsSection | null;
    lineup: MatchCenterLineupSection | null;
    teamStats: MatchCenterTeamStatsSection;
  } = useMemo(() => {
    let normalizedPlayerStats: MatchCenterPlayerStatsSection | null = null;
    if (
      backendSections?.playerStats?.home &&
      backendSections.playerStats?.away
    ) {
      normalizedPlayerStats = {
        source: backendSections.playerStats.source,
        sport: backendSections.playerStats.sport || "soccer",
        home: backendSections.playerStats.home,
        away: backendSections.playerStats.away,
        injuries: backendSections.playerStats.injuries,
      };
    }

    return {
      playByPlay:
        backendSections?.playByPlay ?? {
          plays: [],
          homeTeamName:
            headerData?.match.home_team?.short_name ||
            matchData?.match.home_team?.short_name ||
            "Home",
          awayTeamName:
            headerData?.match.away_team?.short_name ||
            matchData?.match.away_team?.short_name ||
            "Away",
          homeTeamId:
            headerData?.match.home_team?.id ||
            matchData?.match.home_team?.id ||
            "",
          awayTeamId:
            headerData?.match.away_team?.id ||
            matchData?.match.away_team?.id ||
            "",
          loading: detailsLoading,
        },
      playerStats: normalizedPlayerStats,
      lineup: backendSections?.lineup ?? null,
      teamStats:
        backendSections?.teamStats ?? {
          homeStats: [],
          awayStats: [],
          homeTeamName:
            headerData?.match.home_team?.short_name ||
            matchData?.match.home_team?.short_name ||
            "Home",
          awayTeamName:
            headerData?.match.away_team?.short_name ||
            matchData?.match.away_team?.short_name ||
            "Away",
          loading: detailsLoading,
        },
    };
  }, [backendSections, detailsLoading, headerData, matchData]);

  const { theme } = useTheme();

  if (matchLoading && !matchData) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (matchError instanceof ApiError && matchError.status === 404) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg border border-surface-border bg-surface-raised px-6 py-12 text-center">
        <h2 className="text-lg font-bold text-text-primary">Match not found</h2>
        <p className="max-w-sm text-sm text-text-secondary">
          This match doesn&apos;t exist or has been removed. Check the ID or go back to today&apos;s matches.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="rounded-md bg-accent-green px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-accent-green/90"
        >
          Back to matches
        </button>
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="mx-auto flex min-h-[280px] max-w-md flex-col items-center justify-center gap-5 rounded-xl border border-accent-red/25 bg-accent-red/10 px-6 py-8 text-center">
        <p className="text-base font-semibold text-accent-red">Failed to load match</p>
        <p className="text-sm text-text-secondary">
          Check your connection. You can try again or go back to the scoreboard.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => refreshMatch()}
            className="rounded-xl bg-accent-blue px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 active:scale-[0.98]"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-xl border border-surface-border bg-surface-raised px-5 py-2.5 text-sm font-semibold text-text-primary hover:bg-surface-hover active:scale-[0.98]"
          >
            Back to scoreboard
          </button>
        </div>
      </div>
    );
  }

  const match = headerData?.match ?? matchData.match;
  const state = headerData?.state ?? matchData.state;

  const canonical: CanonicalMatchState = {
    phase: match.phase ?? "scheduled",
    score_home: state?.score_home ?? 0,
    score_away: state?.score_away ?? 0,
    clock: state?.clock ?? null,
    period: state?.period ?? null,
    version: state?.version ?? 0,
  };

  const live = isLive(canonical.phase);
  const color = phaseColor(canonical.phase);
  const bigScoreClass =
    theme === "light"
      ? "font-mono text-5xl font-black text-text-primary md:text-6xl"
      : "font-mono text-5xl font-black text-white md:text-6xl drop-shadow-[0_0_24px_rgba(255,255,255,0.25)] [text-shadow:0_0_30px_rgba(239,68,68,0.35)]";

  return (
    <div className="mx-auto max-w-2xl animate-slide-up">
      <ScoreWatcher scoreHome={canonical.score_home} scoreAway={canonical.score_away} live={live} />

      {/* Back + Actions */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-full border border-surface-border bg-surface-card px-3 py-1.5 text-label-lg font-medium text-accent-blue transition-all hover:border-accent-blue/40 hover:bg-accent-blue/10 active:scale-95"
        >
          <span aria-hidden>←</span> Back to scoreboard
        </button>
        <div className="flex items-center gap-2">
          {onTogglePin && (
            <button
              type="button"
              onClick={() => onTogglePin(matchId)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-label-lg font-medium transition-all active:scale-95 ${
                pinned
                  ? "border-accent-blue/40 bg-accent-blue/15 text-accent-blue hover:bg-accent-blue/25"
                  : "border-surface-border bg-surface-card text-text-secondary hover:border-surface-border-light hover:text-accent-blue"
              }`}
              aria-label={pinned ? "Untrack this match" : "Track this match"}
            >
              <span aria-hidden>{pinned ? "★" : "☆"}</span>
              {pinned ? "Tracked" : "Track match"}
            </button>
          )}
          <ShareButton
            title={`${match.home_team?.name} vs ${match.away_team?.name}`}
            text={`${match.home_team?.short_name} ${canonical.score_home} - ${canonical.score_away} ${match.away_team?.short_name}`}
            url={`/match/${matchId}`}
          />
        </div>
      </div>

      {/* Score header */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 text-center md:p-8 ${
          live
            ? theme === "light"
              ? "border-accent-red/30 bg-gradient-to-br from-surface-card via-accent-red/5 to-surface-card shadow-[0_0_20px_rgba(239,68,68,0.08)]"
              : "border-red-500/20 bg-gradient-to-br from-surface-card via-[#1a0f0f] to-surface-card shadow-[0_0_30px_rgba(239,68,68,0.06)]"
            : "border-surface-border bg-surface-card"
        }`}
      >
        {live && <div className="absolute inset-x-0 top-0 h-[2px] animate-shimmer bg-gradient-to-r from-transparent via-red-500 to-transparent" />}
        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1" style={{ background: live ? "rgba(239,68,68,0.1)" : `${color}15` }}>
          {live && (
            <div className="relative h-1.5 w-1.5">
              <div className="absolute inset-0 animate-ping rounded-full bg-accent-red opacity-75" />
              <div className="relative h-1.5 w-1.5 rounded-full bg-accent-red" />
            </div>
          )}
          <span
            className="text-label-md font-bold uppercase tracking-[0.1em]"
            style={{ color: live ? "#f87171" : color }}
          >
            {phaseLabelWithClock(canonical.phase, canonical.clock)}
            {canonical.clock ? ` · ${canonical.clock}` : ""}
          </span>
        </div>
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center">
              <TeamLogo url={match.home_team?.logo_url} name={match.home_team?.short_name} size={56} />
            </div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.home_team?.name}</div>
            <div className="mt-0.5 text-label-md text-text-muted">{match.home_team?.short_name}</div>
          </div>
          <div className="flex items-center gap-3 md:gap-4">
            <AnimatedScore
              value={canonical.score_home}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
            <span className="text-2xl font-light text-text-muted/40 md:text-3xl">:</span>
            <AnimatedScore
              value={canonical.score_away}
              className={live ? bigScoreClass : `font-mono text-5xl font-black text-text-primary md:text-6xl [text-shadow:0_1px_8px_rgba(0,0,0,0.15)]`}
            />
          </div>
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center">
              <TeamLogo url={match.away_team?.logo_url} name={match.away_team?.short_name} size={56} />
            </div>
            <div className="text-sm font-semibold text-text-primary md:text-base">{match.away_team?.name}</div>
            <div className="mt-0.5 text-label-md text-text-muted">{match.away_team?.short_name}</div>
          </div>
        </div>
        {state?.aggregate_home != null && state?.aggregate_away != null && (
          <div className="mt-3 text-sm font-semibold text-text-muted">
            Aggregate: {state.aggregate_home}-{state.aggregate_away}
          </div>
        )}
        {match.venue && (
          <div className="mt-5 text-label-md text-text-muted">
            📍 {match.venue} · {formatDate(match.start_time)} {formatTime(match.start_time)}
          </div>
        )}
      </div>

      <MatchForm homeTeamName={match.home_team?.name || ""} awayTeamName={match.away_team?.name || ""} leagueName={leagueName} />
      <HeadToHead
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        homeTeamLogo={match.home_team?.logo_url || null}
        awayTeamLogo={match.away_team?.logo_url || null}
        leagueName={leagueName}
      />
      <Highlights
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        leagueName={leagueName}
        matchPhase={match.phase}
      />

      {/* Tabs: show Lineup only for soccer */}
      <div className="mt-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-label-md font-semibold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "bg-surface-hover text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4 animate-fade-in">
        {activeTab === "play_by_play" && (
          <PlayByPlayTab
            plays={detailSections.playByPlay.plays}
            homeTeamName={detailSections.playByPlay.homeTeamName}
            awayTeamName={detailSections.playByPlay.awayTeamName}
            homeTeamId={detailSections.playByPlay.homeTeamId}
            awayTeamId={detailSections.playByPlay.awayTeamId}
            loading={detailSections.playByPlay.loading}
            live={live}
            phase={canonical.phase}
          />
        )}
        {activeTab === "player_stats" && (
          <PlayerStatsTab
            section={detailSections.playerStats}
            loading={detailsLoading && !detailSections.playerStats}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            leagueName={leagueForESPN}
            phase={canonical.phase}
            onPlayerClick={
              detailSections.playerStats?.sport === "soccer"
                ? (player, teamName, teamLogo, side) =>
                    setSelectedSoccerPlayer({ player, teamName, teamLogo, side })
                : undefined
            }
          />
        )}
        {activeTab === "lineup" && isSoccer && (
          <LineupTab
            section={detailSections.lineup}
            loading={detailsLoading && !detailSections.lineup}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={match.home_team?.name || "Home"}
            awayTeamName={match.away_team?.name || "Away"}
            phase={canonical.phase}
            onPlayerClick={(player, teamName, teamLogo, side) =>
              setSelectedSoccerPlayer({ player, teamName, teamLogo, side })
            }
          />
        )}
        {activeTab === "team_stats" && (
          <TeamStatsTab
            homeStats={detailSections.teamStats.homeStats}
            awayStats={detailSections.teamStats.awayStats}
            homeTeamLogo={match.home_team?.logo_url || null}
            awayTeamLogo={match.away_team?.logo_url || null}
            homeTeamName={detailSections.teamStats.homeTeamName}
            awayTeamName={detailSections.teamStats.awayTeamName}
            loading={detailSections.teamStats.loading}
            live={live}
            phase={canonical.phase}
          />
        )}
      </div>

      {selectedSoccerPlayer && (
        <SoccerPlayerDetailModal
          player={selectedSoccerPlayer.player}
          teamName={selectedSoccerPlayer.teamName}
          teamLogo={selectedSoccerPlayer.teamLogo}
          leagueName={leagueForESPN}
          matchContext={`${match.home_team?.name || "Home"} vs ${match.away_team?.name || "Away"}`}
          onClose={() => setSelectedSoccerPlayer(null)}
        />
      )}
    </div>
  );
}

// Re-export shared types that other modules import from here.
export type { SubstitutionEntry, CanonicalMatchState, SoccerPlayerSelection } from "./types";
