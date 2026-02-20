"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Highlights } from "./highlights";
import { fetchMatch, fetchStats, fetchTimeline } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
import { useESPNLive } from "@/hooks/use-espn-live";
import { useWebSocket } from "@/hooks/use-websocket";
import {
  eventMeta,
  formatDate,
  formatTime,
  isLive,
  phaseColor,
  phaseLabel,
} from "@/lib/utils";
import { TeamLogo } from "./team-logo";
import { ShareButton } from "./share-button";
import { CalendarButton } from "./calendar-button";
import { AnimatedScore } from "./animated-score";
import { MatchForm } from "./match-form";
import { HeadToHead } from "./head-to-head";
import { Lineup } from "./lineup";
import { PlayerStats } from "./player-stats";
import { playGoalSound } from "@/lib/sounds";
import { isSoundEnabled } from "@/lib/notification-settings";
import type { MatchDetailResponse, MatchEvent, MatchStatsResponse, TimelineResponse, WSMessage } from "@/lib/types";

interface MatchDetailProps {
  matchId: string;
  onBack: () => void;
  leagueName?: string;
}

type Tab = "timeline" | "stats" | "feed";

export function MatchDetail({ matchId, onBack, leagueName = "" }: MatchDetailProps) {
  const [activeTab, setActiveTab] = useState<Tab>("timeline");

  const matchFetcher = useCallback(() => fetchMatch(matchId), [matchId]);
  const timelineFetcher = useCallback(() => fetchTimeline(matchId), [matchId]);

  const { data: matchData, loading: matchLoading } = usePolling<MatchDetailResponse>({
    fetcher: matchFetcher,
    interval: 15000,
    key: matchId,
  });

  const { data: timeline } = usePolling<TimelineResponse>({
    fetcher: timelineFetcher,
    interval: 15000,
    key: `tl-${matchId}`,
  });

  const { messages: wsMessages, connected: wsConnected } = useWebSocket({ matchId });
  const { findMatch: findESPN } = useESPNLive(leagueName, 15000);

  if (matchLoading && !matchData) {
    return (
      <div className="flex justify-center py-16">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (!matchData) {
    return (
      <div className="rounded-lg border border-accent-red/20 bg-accent-red/5 px-4 py-3 text-sm text-accent-red">
        Failed to load match
      </div>
    );
  }

  const { match, state } = matchData;

  const espnLive = findESPN(match.home_team?.name || "", match.away_team?.name || "");
  const effectivePhase = espnLive ? espnLive.phase : match.phase;
  const effectiveClock = espnLive ? espnLive.clock : state?.clock ?? null;
  const effectivePeriod = espnLive ? espnLive.period : state?.period ?? null;
  const effectiveScoreHome = espnLive ? espnLive.homeScore : state?.score_home ?? 0;
  const effectiveScoreAway = espnLive ? espnLive.awayScore : state?.score_away ?? 0;

  const live = isLive(effectivePhase);
  const color = phaseColor(effectivePhase);

  return (
    <div className="mx-auto max-w-2xl animate-slide-up">
      {/* Score change sound */}
      <ScoreWatcher scoreHome={effectiveScoreHome} scoreAway={effectiveScoreAway} live={live} />

      {/* Back + Actions row */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] text-accent-blue transition-colors hover:bg-surface-hover hover:text-text-primary"
        >
          ← Back to scoreboard
        </button>
        <div className="flex items-center gap-2">
          <CalendarButton
            match={{
              id: matchId,
              phase: effectivePhase,
              start_time: match.start_time,
              venue: match.venue,
              score: { home: effectiveScoreHome, away: effectiveScoreAway },
              clock: effectiveClock,
              period: effectivePeriod,
              version: 0,
              home_team: match.home_team as any,
              away_team: match.away_team as any,
            }}
            leagueName={leagueName}
          />
          <ShareButton
            title={`${match.home_team?.name} vs ${match.away_team?.name}`}
            text={`${match.home_team?.short_name} ${effectiveScoreHome} - ${effectiveScoreAway} ${match.away_team?.short_name}`}
            url={`/match/${matchId}`}
          />
        </div>
      </div>

      {/* Score header */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 text-center md:p-8 ${
          live
            ? "border-red-500/20 bg-gradient-to-br from-surface-card via-[#1a0f0f] to-surface-card shadow-[0_0_30px_rgba(239,68,68,0.06)]"
            : "border-surface-border bg-surface-card"
        }`}
      >
        {live && (
          <div className="absolute inset-x-0 top-0 h-[2px] animate-shimmer bg-gradient-to-r from-transparent via-red-500 to-transparent" />
        )}

        {/* Phase badge */}
        <div
          className="mb-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1"
          style={{ background: live ? "rgba(239,68,68,0.1)" : `${color}15` }}
        >
          {live && (
            <div className="relative h-1.5 w-1.5">
              <div className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" />
              <div className="relative h-1.5 w-1.5 rounded-full bg-red-500" />
            </div>
          )}
          <span
            className="text-[11px] font-bold uppercase tracking-[0.1em]"
            style={{ color: live ? "#f87171" : color }}
          >
            {phaseLabel(effectivePhase)}
            {effectiveClock ? ` · ${effectiveClock}` : ""}
          </span>
        </div>

        {/* Teams and score */}
        <div className="flex items-center justify-center gap-4 md:gap-8">
          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center">
              <TeamLogo url={match.home_team?.logo_url} name={match.home_team?.short_name} size={56} />
            </div>
            <div className="text-sm font-semibold text-text-primary md:text-base">
              {match.home_team?.name}
            </div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              {match.home_team?.short_name}
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <AnimatedScore
              value={effectiveScoreHome}
              className={`font-mono text-4xl font-black text-text-primary md:text-5xl ${
                live ? "drop-shadow-[0_0_20px_rgba(239,68,68,0.2)]" : ""
              }`}
            />
            <span className="text-2xl font-light text-surface-border-light">:</span>
            <AnimatedScore
              value={effectiveScoreAway}
              className={`font-mono text-4xl font-black text-text-primary md:text-5xl ${
                live ? "drop-shadow-[0_0_20px_rgba(239,68,68,0.2)]" : ""
              }`}
            />
          </div>

          <div className="flex-1 text-center">
            <div className="mb-2 flex justify-center">
              <TeamLogo url={match.away_team?.logo_url} name={match.away_team?.short_name} size={56} />
            </div>
            <div className="text-sm font-semibold text-text-primary md:text-base">
              {match.away_team?.name}
            </div>
            <div className="mt-0.5 text-[11px] text-text-muted">
              {match.away_team?.short_name}
            </div>
          </div>
        </div>

        {match.venue && (
          <div className="mt-5 text-[11px] text-text-muted">
            📍 {match.venue} · {formatDate(match.start_time)} {formatTime(match.start_time)}
          </div>
        )}
      </div>

      {/* Form Guide */}
      <MatchForm
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        leagueName={leagueName}
      />

      {/* Head to Head */}
      <HeadToHead
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        homeTeamLogo={match.home_team?.logo_url || null}
        awayTeamLogo={match.away_team?.logo_url || null}
        leagueName={leagueName}
      />

      {/* Roster & Injuries */}
      <Lineup
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        homeTeamLogo={match.home_team?.logo_url || null}
        awayTeamLogo={match.away_team?.logo_url || null}
        leagueName={leagueName}
      />

      {/* Player Stats */}
      <PlayerStats
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        homeTeamLogo={match.home_team?.logo_url || null}
        awayTeamLogo={match.away_team?.logo_url || null}
        leagueName={leagueName}
      />

      {/* Highlights & Recap */}
      <Highlights
        homeTeamName={match.home_team?.name || ""}
        awayTeamName={match.away_team?.name || ""}
        leagueName={leagueName}
        matchPhase={match.phase}
      />
      {/* Tabs */}
      <div className="mt-6 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {(["timeline", "stats", "feed"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 rounded-lg py-2 text-[12px] font-semibold uppercase tracking-wider transition-all ${
              activeTab === tab
                ? "bg-surface-hover text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary"
            }`}
          >
            {tab === "timeline" ? "⏱ Timeline" : tab === "stats" ? "📊 Stats" : "📡 Feed"}
            {tab === "feed" && wsMessages.length > 0 && (
              <span className="ml-1 rounded-full bg-accent-green/15 px-1.5 py-0.5 text-[9px] text-accent-green">
                {wsMessages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="mt-4 animate-fade-in">
        {activeTab === "timeline" && (
          <TimelineTab
            events={timeline?.events || []}
            phase={match.phase}
            homeTeamId={match.home_team?.id}
            awayTeamId={match.away_team?.id}
            homeTeamName={match.home_team?.short_name}
            awayTeamName={match.away_team?.short_name}
          />
        )}
        {activeTab === "stats" && (
          <StatsTab matchId={matchId} live={live} />
        )}
        {activeTab === "feed" && (
          <FeedTab messages={wsMessages} connected={wsConnected} />
        )}
      </div>
    </div>
  );
}

/**
 * Invisible component that watches score changes and plays a sound.
 * Extracted to avoid hook ordering issues in the main component.
 */
function ScoreWatcher({ scoreHome, scoreAway, live }: { scoreHome: number; scoreAway: number; live: boolean }) {
  const prevRef = useRef({ home: -1, away: -1 });

  useEffect(() => {
    const prev = prevRef.current;

    if (prev.home === -1) {
      prevRef.current = { home: scoreHome, away: scoreAway };
      return;
    }

    if ((scoreHome !== prev.home || scoreAway !== prev.away) && live) {
      if (isSoundEnabled()) {
        playGoalSound();
      }
    }

    prevRef.current = { home: scoreHome, away: scoreAway };
  }, [scoreHome, scoreAway, live]);

  return null;
}

interface TimelineTabProps {
  events: MatchEvent[];
  phase: string;
  homeTeamId?: string;
  awayTeamId?: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

function TimelineTab({ events, phase, homeTeamId, awayTeamId, homeTeamName, awayTeamName }: TimelineTabProps) {
  const live = isLive(phase);

  if (events.length === 0) {
    const isScheduled = phase === "scheduled" || phase === "pre_match";
    const isFinished = phase === "finished" || phase === "postponed" || phase === "cancelled";
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
        <div className="mb-2 text-2xl">{isScheduled ? "📅" : live ? "⏱" : "🏁"}</div>
        <div className="text-[13px] text-text-tertiary">
          {isScheduled
            ? "Match hasn't started yet"
            : live
              ? "Waiting for events..."
              : isFinished
                ? "No events recorded for this match"
                : "No events yet"}
        </div>
      </div>
    );
  }

  const grouped: { period: string; events: MatchEvent[] }[] = [];
  let currentPeriod = "";
  for (const evt of events) {
    const p = evt.period || "—";
    if (p !== currentPeriod) {
      currentPeriod = p;
      grouped.push({ period: p, events: [] });
    }
    grouped[grouped.length - 1].events.push(evt);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {grouped.map((group, gi) => (
        <div key={`${group.period}-${gi}`}>
          {group.period !== "—" && (
            <div className="flex items-center gap-3 bg-surface-hover/40 px-4 py-1.5">
              <div className="h-px flex-1 bg-surface-border" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-text-muted">
                {group.period}
              </span>
              <div className="h-px flex-1 bg-surface-border" />
            </div>
          )}
          {group.events.map((evt, i) => {
            const meta = eventMeta(evt.event_type);
            const isGoal = evt.event_type === "goal" || evt.event_type === "basket" || evt.event_type === "run";
            const isHome = evt.team_id === homeTeamId;
            const isAway = evt.team_id === awayTeamId;
            const teamLabel = isHome ? homeTeamName : isAway ? awayTeamName : null;

            return (
              <div
                key={evt.id || `${gi}-${i}`}
                className={`flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-hover/30 ${
                  i < group.events.length - 1 ? "border-b border-surface-border/50" : gi < grouped.length - 1 ? "border-b border-surface-border" : ""
                } ${isGoal ? "bg-accent-green/[0.03]" : ""}`}
                style={{ animation: `fadeIn 0.3s ease ${i * 0.05}s both` }}
              >
                {/* Team side dot */}
                <div
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    isHome ? "bg-accent-blue" : isAway ? "bg-accent-red/70" : "bg-surface-border"
                  }`}
                />

                <span className="min-w-[32px] font-mono text-[11px] font-bold text-accent-blue">
                  {evt.minute != null ? `${evt.minute}'` : "—"}
                </span>
                <span className="text-sm">{meta.icon}</span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: meta.color, background: `${meta.color}12` }}
                >
                  {meta.label}
                </span>
                <div className="min-w-0 flex-1">
                  {evt.player_name && (
                    <span className="mr-1 text-xs font-semibold text-text-primary">
                      {evt.player_name}
                    </span>
                  )}
                  {teamLabel && !evt.player_name && (
                    <span className="mr-1 text-[10px] font-medium text-text-muted">
                      {teamLabel}
                    </span>
                  )}
                  {evt.detail && (
                    <span className="truncate text-xs text-text-secondary">
                      {evt.player_name ? `— ${evt.detail}` : evt.detail}
                    </span>
                  )}
                </div>
                {evt.score_home != null && evt.score_away != null && (
                  <span className="shrink-0 font-mono text-[11px] font-bold text-text-primary">
                    {evt.score_home}-{evt.score_away}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

const STAT_LABELS: Record<string, string> = {
  possession: "Possession",
  shots: "Total Shots",
  shots_on_target: "Shots on Target",
  corners: "Corners",
  fouls: "Fouls",
  offsides: "Offsides",
  passes: "Passes",
  pass_accuracy: "Pass Accuracy",
  yellow_cards: "Yellow Cards",
  red_cards: "Red Cards",
  field_goal_pct: "Field Goal %",
  field_goals_made: "Field Goals Made",
  field_goals_attempted: "Field Goals Attempted",
  three_point_pct: "3-Point %",
  three_point_made: "3-Pointers Made",
  three_point_attempted: "3-Point Attempts",
  free_throw_pct: "Free Throw %",
  free_throws_made: "Free Throws Made",
  free_throws_attempted: "Free Throws Attempted",
  rebounds: "Rebounds",
  assists: "Assists",
  turnovers: "Turnovers",
  steals: "Steals",
  blocks: "Blocks",
  power_plays: "Power Plays",
  penalty_minutes: "Penalty Minutes",
  faceoff_wins: "Faceoff Wins",
  hits: "Hits",
  at_bats: "At Bats",
  runs: "Runs",
  home_runs: "Home Runs",
  strikeouts: "Strikeouts",
  walks: "Walks",
  era: "ERA",
};

const HERO_STATS = new Set([
  "possession", "shots", "shots_on_target",
  "field_goal_pct", "rebounds", "three_point_pct",
]);

const STAT_GROUPS: { label: string; keys: string[] }[] = [
  { label: "Shooting", keys: [
    "field_goal_pct", "field_goals_made", "field_goals_attempted",
    "three_point_pct", "three_point_made", "three_point_attempted",
    "free_throw_pct", "free_throws_made", "free_throws_attempted",
    "shots", "shots_on_target", "corners", "offsides",
  ]},
  { label: "Playmaking", keys: ["assists", "turnovers", "passes", "pass_accuracy"] },
  { label: "Defense & Rebounding", keys: [
    "rebounds", "steals", "blocks",
    "fouls", "yellow_cards", "red_cards",
    "hits", "strikeouts", "walks", "era",
  ]},
  { label: "Special Teams", keys: ["power_plays", "penalty_minutes", "faceoff_wins"] },
  { label: "Batting", keys: ["at_bats", "runs", "home_runs"] },
];

function ComparisonBar({ homeVal, awayVal, homeLeads }: { homeVal: number; awayVal: number; homeLeads: boolean }) {
  const total = homeVal + awayVal || 1;
  const homePct = Math.round((homeVal / total) * 100);
  return (
    <div className="relative flex h-2.5 w-full overflow-hidden rounded-full bg-surface-hover/50">
      <div
        className="rounded-l-full transition-all duration-700 ease-out"
        style={{
          width: `${homePct}%`,
          background: homeLeads
            ? "linear-gradient(90deg, rgba(68,138,255,0.3), rgba(68,138,255,0.85))"
            : "linear-gradient(90deg, rgba(68,138,255,0.15), rgba(68,138,255,0.45))",
        }}
      />
      <div
        className="flex-1 rounded-r-full transition-all duration-700 ease-out"
        style={{
          background: !homeLeads && (homePct < 50)
            ? "linear-gradient(90deg, rgba(255,23,68,0.85), rgba(255,23,68,0.3))"
            : "linear-gradient(90deg, rgba(255,23,68,0.45), rgba(255,23,68,0.15))",
        }}
      />
      <div
        className="absolute top-0 h-full w-px bg-surface-border-light/40"
        style={{ left: "50%" }}
      />
    </div>
  );
}

function HeroStat({
  label,
  homeVal,
  awayVal,
  homeStr,
  awayStr,
  suffix,
}: {
  label: string;
  homeVal: number;
  awayVal: number;
  homeStr: string;
  awayStr: string;
  suffix?: string;
}) {
  const homeLeads = homeVal > awayVal;
  const awayLeads = awayVal > homeVal;
  return (
    <div className="rounded-xl bg-surface-hover/30 px-4 py-3.5">
      <div className="mb-2 text-center text-[9px] font-bold uppercase tracking-[0.15em] text-text-muted">
        {label}
      </div>
      <div className="mb-2.5 flex items-end justify-between">
        <span
          className={`font-mono text-2xl font-black transition-colors ${
            homeLeads ? "text-accent-blue" : "text-text-primary"
          }`}
        >
          {homeStr}{suffix || ""}
        </span>
        <span
          className={`font-mono text-2xl font-black transition-colors ${
            awayLeads ? "text-accent-red" : "text-text-primary"
          }`}
        >
          {awayStr}{suffix || ""}
        </span>
      </div>
      <ComparisonBar homeVal={homeVal} awayVal={awayVal} homeLeads={homeLeads} />
    </div>
  );
}

function StatRow({
  label,
  homeStr,
  awayStr,
  homeVal,
  awayVal,
  suffix,
  index,
}: {
  label: string;
  homeStr: string;
  awayStr: string;
  homeVal: number;
  awayVal: number;
  suffix?: string;
  index: number;
}) {
  const homeLeads = homeVal > awayVal;
  const awayLeads = awayVal > homeVal;
  return (
    <div
      className="group px-4 py-3 transition-colors hover:bg-surface-hover/20"
      style={{ animation: `fadeIn 0.3s ease ${index * 0.04}s both` }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span
          className={`min-w-[52px] text-right font-mono text-[15px] font-bold transition-colors ${
            homeLeads ? "text-accent-blue" : "text-text-primary"
          }`}
        >
          {homeStr}{suffix || ""}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          {label}
        </span>
        <span
          className={`min-w-[52px] text-left font-mono text-[15px] font-bold transition-colors ${
            awayLeads ? "text-accent-red" : "text-text-primary"
          }`}
        >
          {awayStr}{suffix || ""}
        </span>
      </div>
      <ComparisonBar homeVal={homeVal} awayVal={awayVal} homeLeads={homeLeads} />
    </div>
  );
}

function StatsTab({ matchId, live }: { matchId: string; live: boolean }) {
  const statsFetcher = useCallback(() => fetchStats(matchId), [matchId]);
  const { data, loading } = usePolling<MatchStatsResponse>({
    fetcher: statsFetcher,
    interval: live ? 15000 : 30000,
    key: `stats-${matchId}`,
  });

  const homeStats = data?.teams?.find((t) => t.side === "home");
  const awayStats = data?.teams?.find((t) => t.side === "away");

  const allKeys = homeStats?.stats || awayStats?.stats
    ? Object.keys({ ...homeStats?.stats, ...awayStats?.stats }).filter((k) => {
        if (k === "period_scores") return false;
        const h = homeStats?.stats?.[k];
        const a = awayStats?.stats?.[k];
        if (h != null && typeof h === "object") return false;
        if (a != null && typeof a === "object") return false;
        return h != null || a != null;
      })
    : [];

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-xl border border-surface-border bg-surface-card p-4">
              <div className="mb-2 h-2 w-16 animate-pulse rounded bg-surface-hover" />
              <div className="mb-3 h-7 w-12 animate-pulse rounded bg-surface-hover" />
              <div className="h-2.5 w-full animate-pulse rounded-full bg-surface-hover" />
            </div>
          ))}
        </div>
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-b border-surface-border/50 px-4 py-3.5 last:border-0">
              <div className="h-3 w-10 animate-pulse rounded bg-surface-hover" />
              <div className="h-2 w-16 animate-pulse rounded bg-surface-hover" />
              <div className="h-3 w-10 animate-pulse rounded bg-surface-hover" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (allKeys.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-10 text-center">
        <div className="mb-3 text-3xl opacity-60">📊</div>
        <div className="mb-1 text-[14px] font-semibold text-text-secondary">
          {live ? "Waiting for Statistics" : "No Statistics Available"}
        </div>
        <div className="text-[12px] text-text-muted">
          {live
            ? "Stats will populate as the match progresses"
            : "Match stats were not recorded for this game"}
        </div>
      </div>
    );
  }

  const heroKeys = allKeys.filter((k) => HERO_STATS.has(k));
  const remainingKeys = allKeys.filter((k) => !HERO_STATS.has(k));

  const getStatData = (key: string) => {
    const hRaw = homeStats?.stats?.[key];
    const aRaw = awayStats?.stats?.[key];
    const hStr = hRaw != null ? String(hRaw) : "—";
    const aStr = aRaw != null ? String(aRaw) : "—";
    const hNum = typeof hRaw === "number" ? hRaw : parseFloat(String(hRaw ?? "0")) || 0;
    const aNum = typeof aRaw === "number" ? aRaw : parseFloat(String(aRaw ?? "0")) || 0;
    const label = STAT_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    const isPercentage = key.includes("pct") || key.includes("accuracy");
    return { hStr, aStr, hNum, aNum, label, suffix: isPercentage ? "%" : undefined };
  };

  const groupedSections: { label: string; keys: string[] }[] = [];
  const usedKeys = new Set<string>();
  for (const group of STAT_GROUPS) {
    const matchedKeys = group.keys.filter((k) => remainingKeys.includes(k));
    if (matchedKeys.length > 0) {
      groupedSections.push({ label: group.label, keys: matchedKeys });
      matchedKeys.forEach((k) => usedKeys.add(k));
    }
  }
  const ungrouped = remainingKeys.filter((k) => !usedKeys.has(k));
  if (ungrouped.length > 0) {
    groupedSections.push({ label: "Other", keys: ungrouped });
  }

  let rowIdx = 0;

  return (
    <div className="space-y-3">
      {/* Team header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-accent-blue" />
          <span className="text-[12px] font-bold text-text-primary">
            {homeStats?.team_name || "Home"}
          </span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-dim">
          Match Stats
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-text-primary">
            {awayStats?.team_name || "Away"}
          </span>
          <div className="h-3 w-3 rounded-full bg-accent-red/70" />
        </div>
      </div>

      {/* Hero stats */}
      {heroKeys.length > 0 && (
        <div className={`grid gap-2.5 ${heroKeys.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
          {heroKeys.map((key) => {
            const s = getStatData(key);
            return (
              <HeroStat
                key={key}
                label={s.label}
                homeVal={s.hNum}
                awayVal={s.aNum}
                homeStr={s.hStr}
                awayStr={s.aStr}
                suffix={s.suffix}
              />
            );
          })}
        </div>
      )}

      {/* Grouped stats */}
      {groupedSections.map((section) => (
        <div key={section.label} className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          <div className="border-b border-surface-border bg-surface-hover/25 px-4 py-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-text-muted">
              {section.label}
            </span>
          </div>
          {section.keys.map((key, i) => {
            const s = getStatData(key);
            const idx = rowIdx++;
            return (
              <div
                key={key}
                className={i < section.keys.length - 1 ? "border-b border-surface-border/40" : ""}
              >
                <StatRow
                  label={s.label}
                  homeStr={s.hStr}
                  awayStr={s.aStr}
                  homeVal={s.hNum}
                  awayVal={s.aNum}
                  suffix={s.suffix}
                  index={idx}
                />
              </div>
            );
          })}
        </div>
      ))}

      {live && (
        <div className="flex items-center justify-center gap-1.5 py-2 text-[10px] text-text-dim">
          <div className="h-1 w-1 animate-pulse rounded-full bg-accent-green" />
          Stats update live
        </div>
      )}
    </div>
  );
}

const FEED_ICONS: Record<string, string> = {
  snapshot: "📸",
  delta: "⚡",
  state: "🔄",
  welcome: "👋",
  error: "⚠️",
};

const FEED_COLORS: Record<string, string> = {
  snapshot: "#448AFF",
  delta: "#00E676",
  state: "#FFB347",
  welcome: "#5b9cf6",
  error: "#FF1744",
};

function parseFeedSummary(msg: WSMessage): string {
  const d = msg.data as Record<string, unknown> | undefined;
  if (!d) {
    if (msg.type === "welcome") return `Connected · ${msg.connection_id ?? ""}`;
    if (msg.type === "error") return msg.error ?? "Unknown error";
    return msg.type;
  }

  if (msg.type === "snapshot") {
    const score = d.score as Record<string, number> | undefined;
    const phase = d.phase as string | undefined;
    if (score) return `Snapshot · ${score.home ?? 0} - ${score.away ?? 0}${phase ? ` · ${phase}` : ""}`;
    return "Match snapshot received";
  }

  if (msg.type === "delta") {
    const eventType = d.event_type as string | undefined;
    const detail = d.detail as string | undefined;
    const scoreHome = d.score_home as number | undefined;
    const scoreAway = d.score_away as number | undefined;
    const parts: string[] = [];
    if (eventType) parts.push(eventType.replace(/_/g, " "));
    if (detail) parts.push(detail);
    if (scoreHome != null && scoreAway != null) parts.push(`${scoreHome}-${scoreAway}`);
    return parts.join(" · ") || "Match update";
  }

  if (msg.type === "state") {
    const phase = d.phase as string | undefined;
    const clock = d.clock as string | undefined;
    const parts: string[] = ["State update"];
    if (phase) parts.push(phase);
    if (clock) parts.push(clock);
    return parts.join(" · ");
  }

  return msg.type;
}

function formatFeedTime(ts: string | undefined): string {
  if (!ts) return "";
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch {
    return "";
  }
}

function FeedTab({ messages, connected }: { messages: WSMessage[]; connected: boolean }) {
  const feedEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  return (
    <div>
      <div className="mb-3 flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <div
          className={`h-1.5 w-1.5 rounded-full ${
            connected ? "animate-pulse bg-accent-green" : "bg-accent-red"
          }`}
        />
        {connected ? "Connected" : "Disconnected"} · {messages.length} messages
      </div>
      {messages.length === 0 ? (
        <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
          <div className="mb-2 text-2xl">📡</div>
          <div className="text-[13px] text-text-tertiary">
            {connected ? "Listening for live updates..." : "Not connected"}
          </div>
        </div>
      ) : (
        <div className="max-h-[350px] space-y-1.5 overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-2">
          {messages.slice(-30).map((msg, i) => {
            const icon = FEED_ICONS[msg.type] ?? "•";
            const color = FEED_COLORS[msg.type] ?? "#5b6b7b";
            const summary = parseFeedSummary(msg);
            const time = formatFeedTime(msg.ts);

            return (
              <div
                key={i}
                className="flex items-start gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-hover/30"
                style={{ animation: `fadeIn 0.2s ease ${i * 0.03}s both` }}
              >
                <span className="mt-0.5 shrink-0 text-sm">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide"
                      style={{ color, background: `${color}15` }}
                    >
                      {msg.type}
                    </span>
                    {time && (
                      <span className="text-[10px] text-text-muted">{time}</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-text-secondary">
                    {summary}
                  </p>
                </div>
              </div>
            );
          })}
          <div ref={feedEndRef} />
        </div>
      )}
    </div>
  );
}