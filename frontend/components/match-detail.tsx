"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Highlights } from "./highlights";
import { fetchMatch, fetchTimeline } from "@/lib/api";
import { usePolling } from "@/hooks/use-polling";
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
import { playGoalSound } from "@/lib/sounds";
import { isSoundEnabled } from "@/lib/notification-settings";
import type { MatchDetailResponse, MatchEvent, TimelineResponse } from "@/lib/types";

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
  const live = isLive(match.phase);
  const color = phaseColor(match.phase);

  return (
    <div className="mx-auto max-w-2xl animate-slide-up">
      {/* Score change sound */}
      <ScoreWatcher scoreHome={state?.score_home ?? 0} scoreAway={state?.score_away ?? 0} live={live} />

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
              phase: match.phase,
              start_time: match.start_time,
              venue: match.venue,
              score: { home: state?.score_home ?? 0, away: state?.score_away ?? 0 },
              clock: state?.clock ?? null,
              period: state?.period ?? null,
              version: 0,
              home_team: match.home_team as any,
              away_team: match.away_team as any,
            }}
            leagueName={leagueName}
          />
          <ShareButton
            title={`${match.home_team?.name} vs ${match.away_team?.name}`}
            text={`${match.home_team?.short_name} ${state?.score_home ?? 0} - ${state?.score_away ?? 0} ${match.away_team?.short_name}`}
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
            {phaseLabel(match.phase)}
            {state?.clock ? ` · ${state.clock}` : ""}
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
              value={state?.score_home ?? 0}
              className={`font-mono text-4xl font-black text-text-primary md:text-5xl ${
                live ? "drop-shadow-[0_0_20px_rgba(239,68,68,0.2)]" : ""
              }`}
            />
            <span className="text-2xl font-light text-surface-border-light">:</span>
            <AnimatedScore
              value={state?.score_away ?? 0}
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
          <TimelineTab events={timeline?.events || []} live={live} />
        )}
        {activeTab === "stats" && (
          <StatsTab matchData={matchData} />
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

function TimelineTab({ events, live }: { events: MatchEvent[]; live: boolean }) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
        <div className="mb-2 text-2xl">⏱</div>
        <div className="text-[13px] text-text-tertiary">
          {live ? "Waiting for events..." : "No events yet"}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      {events.map((evt, i) => {
        const meta = eventMeta(evt.event_type);
        const isGoal = evt.event_type === "goal" || evt.event_type === "basket" || evt.event_type === "run";
        return (
          <div
            key={evt.id || i}
            className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/30 ${
              i < events.length - 1 ? "border-b border-surface-border" : ""
            } ${isGoal ? "bg-accent-green/[0.03]" : ""}`}
            style={{ animation: `fadeIn 0.3s ease ${i * 0.05}s both` }}
          >
            <span className="min-w-[32px] font-mono text-[11px] font-bold text-accent-blue">
              {evt.minute != null ? `${evt.minute}'` : "—"}
            </span>
            <span className="text-sm">{meta.icon}</span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
              style={{ color: meta.color, background: `${meta.color}12` }}
            >
              {meta.label}
            </span>
            <span className="flex-1 truncate text-xs text-text-secondary">
              {evt.detail || ""}
            </span>
            {evt.score_home != null && evt.score_away != null && (
              <span className="font-mono text-[11px] font-bold text-text-primary">
                {evt.score_home}-{evt.score_away}
              </span>
            )}
            {evt.synthetic && (
              <span className="text-[9px] text-text-muted">synth</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatsTab({ matchData }: { matchData: MatchDetailResponse }) {
  const { state, recent_events } = matchData;

  const stats = [
    { label: "Score", home: String(state?.score_home ?? 0), away: String(state?.score_away ?? 0) },
    { label: "Period", home: state?.period || "—", away: state?.period || "—" },
    { label: "Events", home: String(recent_events.filter((e) => e.detail?.toLowerCase().includes("home")).length), away: String(recent_events.filter((e) => e.detail?.toLowerCase().includes("away")).length) },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-3">
        <h4 className="text-[11px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Match Statistics
        </h4>
      </div>
      {stats.map((stat, i) => (
        <div
          key={stat.label}
          className={`flex items-center justify-between px-4 py-3 ${
            i < stats.length - 1 ? "border-b border-surface-border" : ""
          }`}
          style={{ animation: `fadeIn 0.3s ease ${i * 0.08}s both` }}
        >
          <span className="min-w-[60px] text-right font-mono text-sm font-bold text-text-primary">
            {stat.home}
          </span>
          <span className="flex-1 text-center text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">
            {stat.label}
          </span>
          <span className="min-w-[60px] text-left font-mono text-sm font-bold text-text-primary">
            {stat.away}
          </span>
        </div>
      ))}

      {recent_events.length === 0 && (
        <div className="px-4 py-6 text-center text-[12px] text-text-muted">
          Detailed stats will populate as the match progresses
        </div>
      )}
    </div>
  );
}

function FeedTab({ messages, connected }: { messages: unknown[]; connected: boolean }) {
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
        <div className="max-h-[300px] overflow-y-auto rounded-xl border border-surface-border bg-surface-card p-3 font-mono text-[11px] leading-relaxed text-accent-blue">
          {messages.slice(-20).map((msg, i) => (
            <div key={i} className="truncate border-b border-surface-border/50 py-1 last:border-0">
              {JSON.stringify(msg).substring(0, 140)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}