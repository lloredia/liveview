"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchMatch } from "@/lib/api";
import { setPinnedMatches, togglePinned, MAX_PINNED } from "@/lib/pinned-matches";
import { isLive, phaseLabel } from "@/lib/utils";
import { endLiveActivity, updateLiveActivity } from "@/lib/live-activity";
import { sendTrackedScoreSummary } from "@/lib/native-notifications";
import { TeamLogo } from "./team-logo";
import { GlassPill } from "./ui/glass";
import type { MatchDetailResponse, MatchSummary, TodayResponse } from "@/lib/types";

interface MultiTrackerProps {
  pinnedIds: string[];
  todaySnapshot?: TodayResponse | null;
  onPinnedChange: (ids: string[]) => void;
  onMatchSelect: (matchId: string) => void;
  /** When provided (e.g. auth flow), called when user removes one game from tracker instead of local toggle */
  onRemove?: (matchId: string) => void;
}

function findTodayMatch(todaySnapshot: TodayResponse | null | undefined, matchId: string): MatchSummary | null {
  if (!todaySnapshot) return null;
  for (const league of todaySnapshot.leagues ?? []) {
    const match = (league.matches ?? []).find((candidate) => candidate.id === matchId);
    if (match) return match;
  }
  return null;
}

function trackerGameFromSummary(match: MatchSummary) {
  return {
    matchId: match.id,
    homeName: match.home_team?.short_name ?? match.home_team?.name ?? "Home",
    awayName: match.away_team?.short_name ?? match.away_team?.name ?? "Away",
    scoreHome: match.score.home ?? 0,
    scoreAway: match.score.away ?? 0,
    isLive: isLive(match.phase),
    phaseLabel: phaseLabel(match.phase),
  };
}

function trackerGameFromDetail(result: MatchDetailResponse) {
  return {
    matchId: result.match.id,
    homeName: result.match.home_team?.short_name ?? result.match.home_team?.name ?? "Home",
    awayName: result.match.away_team?.short_name ?? result.match.away_team?.name ?? "Away",
    scoreHome: result.state?.score_home ?? 0,
    scoreAway: result.state?.score_away ?? 0,
    isLive: isLive(result.match.phase),
    phaseLabel: phaseLabel(result.match.phase),
  };
}

export function MultiTracker({ pinnedIds, todaySnapshot = null, onPinnedChange, onMatchSelect, onRemove }: MultiTrackerProps) {
  const [expanded, setExpanded] = useState(false);
  // Central store of fetched details for matches not in todaySnapshot.
  // One fetch cycle populates it; child chips/cards read from this map.
  const [detailsByMatchId, setDetailsByMatchId] = useState<Record<string, MatchDetailResponse>>({});

  useEffect(() => {
    if (pinnedIds.length === 0) {
      endLiveActivity();
      setDetailsByMatchId({});
      return;
    }

    const getMissingIds = () =>
      pinnedIds.filter((id) => !findTodayMatch(todaySnapshot, id));

    const sync = async () => {
      const missingIds = getMissingIds();

      const fetched: MatchDetailResponse[] =
        missingIds.length > 0
          ? (await Promise.all(missingIds.map((id) => fetchMatch(id)))).filter(
              (r): r is MatchDetailResponse => r != null,
            )
          : [];

      // Write everything we fetched into the details map, by matchId.
      if (fetched.length > 0) {
        setDetailsByMatchId((prev) => {
          const next = { ...prev };
          for (const d of fetched) next[d.match.id] = d;
          return next;
        });
      }

      const snapshotGames = pinnedIds
        .map((id) => findTodayMatch(todaySnapshot, id))
        .filter((match): match is MatchSummary => match != null)
        .map(trackerGameFromSummary);
      const fetchedGames = fetched.map(trackerGameFromDetail);

      const games = [...snapshotGames, ...fetchedGames];
      await updateLiveActivity(games);
      await sendTrackedScoreSummary(games);
    };

    sync();

    // Unified interval: 10s when expanded, 15s collapsed, 30s when no live games.
    const anyLive = () =>
      pinnedIds.some((id) => {
        const t = findTodayMatch(todaySnapshot, id);
        if (t) return isLive(t.phase);
        const d = detailsByMatchId[id];
        return d ? isLive(d.match.phase) : false;
      });

    let timer: ReturnType<typeof setTimeout>;
    const loop = () => {
      const delay = !anyLive() ? 30_000 : expanded ? 10_000 : 15_000;
      timer = setTimeout(() => {
        sync();
        loop();
      }, delay);
    };
    loop();

    return () => clearTimeout(timer);
    // detailsByMatchId intentionally excluded — it's referenced via closure inside anyLive(),
    // and re-running the effect on every detail update would cascade endlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinnedIds, todaySnapshot, expanded]);

  if (pinnedIds.length === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 safe-bottom">
      <div className="glass-surface-prominent glass-blur border-t border-glass-border">
        {/* Header bar */}
        <div className="relative flex w-full items-center justify-between px-4 py-2">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="absolute inset-0 glass-press"
            aria-label={expanded ? "Collapse tracker" : "Expand tracker"}
          />
          <div className="relative flex items-center gap-2">
            <span className="text-label-md font-bold uppercase tracking-wider text-text-muted">
              Tracking
            </span>
            <GlassPill variant="info" size="xs">
              {pinnedIds.length}/{MAX_PINNED}
            </GlassPill>
          </div>
          <div className="relative flex items-center gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPinnedMatches([]);
                onPinnedChange([]);
              }}
              className="rounded-[8px] px-2 py-0.5 text-label-sm text-text-dim transition-colors hover:bg-glass-hover hover:text-accent-red"
            >
              Clear all
            </button>
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              className={`text-text-muted transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            >
              <path d="M2 8l4-4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none" />
            </svg>
          </div>
        </div>

        {/* Collapsed: horizontal chips */}
        {!expanded && (
          <div className="flex items-center gap-1.5 overflow-x-auto px-4 pb-2 scrollbar-hide">
            {pinnedIds.map((id) => (
              <TrackerChip
                key={id}
                matchId={id}
                todaySnapshot={todaySnapshot}
                detail={detailsByMatchId[id] ?? null}
                onClick={() => onMatchSelect(id)}
              />
            ))}
          </div>
        )}

        {/* Expanded: full mini-scoreboards */}
        {expanded && (
          <div className="max-h-[50vh] overflow-y-auto px-3 pb-3">
            {pinnedIds.map((id) => (
              <TrackerCard
                key={id}
                matchId={id}
                todaySnapshot={todaySnapshot}
                detail={detailsByMatchId[id] ?? null}
                onClick={() => onMatchSelect(id)}
                onRemove={() => {
                  if (onRemove) {
                    onRemove(id);
                  } else {
                    const next = togglePinned(id);
                    onPinnedChange(next);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TrackerChip({
  matchId,
  todaySnapshot,
  detail,
  onClick,
}: {
  matchId: string;
  todaySnapshot?: TodayResponse | null;
  detail: MatchDetailResponse | null;
  onClick: () => void;
}) {
  const todayMatch = useMemo(() => findTodayMatch(todaySnapshot, matchId), [todaySnapshot, matchId]);
  const data = detail;

  if (!todayMatch && !data) {
    return (
      <div className="flex h-7 w-20 shrink-0 items-center justify-center rounded-[10px] glass-surface">
        <div className="h-3 w-3 animate-spin rounded-full border border-glass-border border-t-accent-green" />
      </div>
    );
  }

  const live = todayMatch ? isLive(todayMatch.phase) : isLive(data?.match.phase || "");
  const home = todayMatch
    ? todayMatch.home_team?.short_name || "HOM"
    : data?.match.home_team?.short_name || "HOM";
  const away = todayMatch
    ? todayMatch.away_team?.short_name || "AWY"
    : data?.match.away_team?.short_name || "AWY";
  const sh = todayMatch ? todayMatch.score.home ?? 0 : data?.state?.score_home ?? 0;
  const sa = todayMatch ? todayMatch.score.away ?? 0 : data?.state?.score_away ?? 0;

  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 py-1.5 text-label-md font-semibold transition-all glass-press ${
        live
          ? "bg-accent-red/10 text-text-primary border border-accent-red/20"
          : "glass-surface text-text-secondary hover:bg-glass-hover"
      }`}
    >
      {live && (
        <span className="relative mr-0.5 flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
        </span>
      )}
      <span className="max-w-[40px] truncate">{home}</span>
      <span className="font-mono text-text-primary">{sh}-{sa}</span>
      <span className="max-w-[40px] truncate">{away}</span>
    </button>
  );
}

function TrackerCard({
  matchId,
  todaySnapshot,
  detail,
  onClick,
  onRemove,
}: {
  matchId: string;
  todaySnapshot?: TodayResponse | null;
  detail: MatchDetailResponse | null;
  onClick: () => void;
  onRemove: () => void;
}) {
  const todayMatch = useMemo(() => findTodayMatch(todaySnapshot, matchId), [todaySnapshot, matchId]);
  const data = detail;

  if (!todayMatch && !data) {
    return (
      <div className="mb-1.5 flex h-14 items-center justify-center rounded-[14px] glass-surface">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-glass-border border-t-accent-green" />
      </div>
    );
  }

  const live = todayMatch ? isLive(todayMatch.phase) : isLive(data?.match.phase || "");
  const sh = todayMatch ? todayMatch.score.home ?? 0 : data?.state?.score_home ?? 0;
  const sa = todayMatch ? todayMatch.score.away ?? 0 : data?.state?.score_away ?? 0;
  const homeName = todayMatch
    ? todayMatch.home_team?.name || "Home"
    : data?.match.home_team?.name || "Home";
  const homeShortName = todayMatch
    ? todayMatch.home_team?.short_name || todayMatch.home_team?.name || "Home"
    : data?.match.home_team?.short_name || data?.match.home_team?.name || "Home";
  const homeLogo = todayMatch ? todayMatch.home_team?.logo_url : data?.match.home_team?.logo_url;
  const awayName = todayMatch
    ? todayMatch.away_team?.name || "Away"
    : data?.match.away_team?.name || "Away";
  const awayShortName = todayMatch
    ? todayMatch.away_team?.short_name || todayMatch.away_team?.name || "Away"
    : data?.match.away_team?.short_name || data?.match.away_team?.name || "Away";
  const awayLogo = todayMatch ? todayMatch.away_team?.logo_url : data?.match.away_team?.logo_url;
  const phase = todayMatch?.phase || data?.match.phase || "scheduled";

  return (
    <div
      className={`relative mb-1.5 flex items-center gap-3 rounded-[14px] px-3 py-2.5 transition-all glass-press ${
        live
          ? "bg-accent-red/5 border border-accent-red/15"
          : "glass-surface hover:bg-glass-hover"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Open ${homeShortName} vs ${awayShortName}`}
        className="absolute inset-0 rounded-[14px]"
      />
      {/* Home team */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <TeamLogo url={homeLogo} name={homeName} size={20} />
        <span className="truncate text-label-lg text-text-primary">
          {homeShortName}
        </span>
      </div>

      {/* Score */}
      <div className="flex flex-col items-center">
        <div className="flex items-center gap-1">
          {live && (
            <span className="relative mr-1 flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
            </span>
          )}
          <span className="font-mono text-score-md text-text-primary">{sh}</span>
          <span className="text-label-sm text-text-dim">-</span>
          <span className="font-mono text-score-md text-text-primary">{sa}</span>
        </div>
        <span className="text-label-xs text-text-muted">{phaseLabel(phase)}</span>
      </div>

      {/* Away team */}
      <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
        <span className="truncate text-right text-label-lg text-text-primary">
          {awayShortName}
        </span>
        <TeamLogo url={awayLogo} name={awayName} size={20} />
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="relative z-10 ml-1 shrink-0 rounded-[8px] p-1 text-text-dim transition-colors hover:bg-glass-hover hover:text-accent-red"
        aria-label="Remove from tracker"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <path d="M2 2l6 6M8 2l-6 6" />
        </svg>
      </button>
    </div>
  );
}
