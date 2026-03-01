"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TeamLogo } from "./team-logo";
import type {
  KnockoutBracket as KnockoutBracketData,
  KnockoutRound,
  KnockoutTie,
  KnockoutLeg,
  KnockoutTeam,
} from "@/lib/types";

// ── Layout constants ────────────────────────────────────────────────

const CARD_H = 84;
const BASE_GAP = 14;
const COL_W = 220;
const CONN_W = 44;
const HEADER_H = 32;

// ── Position computation ────────────────────────────────────────────

function computePositions(rounds: KnockoutRound[]): number[][] {
  if (rounds.length === 0) return [];

  const positions: number[][] = [];
  const n0 = rounds[0].ties.length || 1;
  const first: number[] = [];
  for (let i = 0; i < n0; i++) first.push(i * (CARD_H + BASE_GAP));
  positions.push(first);

  for (let r = 1; r < rounds.length; r++) {
    const prev = positions[r - 1];
    const curr = rounds[r].ties.length || 1;
    const prevCount = prev.length;

    if (curr === prevCount) {
      positions.push([...prev]);
    } else if (curr * 2 <= prevCount) {
      const p: number[] = [];
      for (let i = 0; i < curr; i++) {
        const topIdx = i * 2;
        const bottomIdx = Math.min(i * 2 + 1, prevCount - 1);
        p.push((prev[topIdx] + prev[bottomIdx]) / 2);
      }
      positions.push(p);
    } else {
      const totalH = prev[prev.length - 1] + CARD_H;
      const p: number[] = [];
      if (curr === 1) {
        p.push((totalH - CARD_H) / 2);
      } else {
        const gap = (totalH - curr * CARD_H) / (curr - 1);
        for (let i = 0; i < curr; i++) p.push(i * (CARD_H + gap));
      }
      positions.push(p);
    }
  }

  return positions;
}

// ── Main component ──────────────────────────────────────────────────

interface KnockoutBracketProps {
  bracket: KnockoutBracketData;
  leagueName: string;
}

export function KnockoutBracket({ bracket, leagueName }: KnockoutBracketProps) {
  const positions = useMemo(() => computePositions(bracket.rounds), [bracket.rounds]);

  if (bracket.rounds.length === 0) return null;

  const n0 = bracket.rounds[0].ties.length || 1;
  const totalH = n0 * CARD_H + Math.max(0, n0 - 1) * BASE_GAP + HEADER_H;

  return (
    <div className="overflow-x-auto pb-4">
      <div
        className="relative flex"
        style={{
          minWidth:
            bracket.rounds.length * COL_W +
            Math.max(0, bracket.rounds.length - 1) * CONN_W,
          minHeight: totalH,
        }}
      >
        {bracket.rounds.map((round, ri) => {
          const roundPos = positions[ri] ?? [];
          const isFinal = ri === bracket.rounds.length - 1;

          return (
            <div
              key={round.slug}
              className="flex-shrink-0"
              style={{ width: COL_W + (ri < bracket.rounds.length - 1 ? CONN_W : 0) }}
            >
              {/* Round header */}
              <div className="mb-1 text-center" style={{ width: COL_W }}>
                <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-tertiary">
                  {round.displayName}
                </div>
              </div>

              <div
                className="relative flex"
                style={{ width: COL_W + (ri < bracket.rounds.length - 1 ? CONN_W : 0) }}
              >
                {/* Cards */}
                <div className="relative" style={{ width: COL_W, height: totalH - HEADER_H }}>
                  {round.ties.length > 0 ? (
                    round.ties.map((tie, ti) => (
                      <div
                        key={ti}
                        className="absolute left-0 right-0"
                        style={{ top: roundPos[ti] ?? 0, height: CARD_H }}
                      >
                        <VsCard
                          tie={tie}
                          leagueName={leagueName}
                          isFinal={isFinal}
                          prevRoundName={ri > 0 ? bracket.rounds[ri - 1].displayName : undefined}
                        />
                      </div>
                    ))
                  ) : (
                    <div
                      className="absolute left-0 right-0"
                      style={{ top: roundPos[0] ?? 0, height: CARD_H }}
                    >
                      <TBDCard prevRoundName={ri > 0 ? bracket.rounds[ri - 1].displayName : undefined} index={0} />
                    </div>
                  )}

                  {isFinal && (
                    <div
                      className="absolute flex items-center justify-center"
                      style={{
                        top: (roundPos[0] ?? 0) - 52,
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                    >
                      <TrophyIcon />
                    </div>
                  )}
                </div>

                {/* Connector SVG */}
                {ri < bracket.rounds.length - 1 && (
                  <div className="flex-shrink-0" style={{ width: CONN_W }}>
                    <BracketConnector
                      leftPositions={roundPos}
                      rightPositions={positions[ri + 1] ?? []}
                      height={totalH - HEADER_H}
                      leftCount={round.ties.length}
                      rightCount={bracket.rounds[ri + 1].ties.length}
                    />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Bracket connector (right-angle lines) ───────────────────────────

function BracketConnector({
  leftPositions,
  rightPositions,
  height,
  leftCount,
  rightCount,
}: {
  leftPositions: number[];
  rightPositions: number[];
  height: number;
  leftCount: number;
  rightCount: number;
}) {
  const midY = (pos: number) => pos + CARD_H / 2;
  const w = CONN_W;
  const halfW = w / 2;
  const paths: string[] = [];

  if (rightCount > 0 && leftCount > 0) {
    if (leftCount === rightCount) {
      for (let i = 0; i < rightCount; i++) {
        if (i < leftPositions.length) {
          const y = midY(leftPositions[i]);
          paths.push(`M 0 ${y} L ${w} ${y}`);
        }
      }
    } else {
      for (let i = 0; i < rightCount; i++) {
        const topIdx = i * 2;
        const bottomIdx = i * 2 + 1;
        const rightY = midY(rightPositions[i] ?? 0);

        if (topIdx < leftPositions.length && bottomIdx < leftPositions.length) {
          const topY = midY(leftPositions[topIdx]);
          const bottomY = midY(leftPositions[bottomIdx]);
          paths.push(`M 0 ${topY} L ${halfW} ${topY} L ${halfW} ${bottomY} L 0 ${bottomY}`);
          paths.push(`M ${halfW} ${rightY} L ${w} ${rightY}`);
        } else if (topIdx < leftPositions.length) {
          const topY = midY(leftPositions[topIdx]);
          paths.push(`M 0 ${topY} L ${w} ${rightY}`);
        }
      }
    }
  }

  return (
    <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} fill="none" className="block">
      {paths.map((d, i) => (
        <path key={i} d={d} stroke="#d1d5db" strokeWidth={1.5} strokeLinecap="round" />
      ))}
    </svg>
  );
}

// ── VS card (icon vs icon) ──────────────────────────────────────────

function VsCard({
  tie,
  leagueName,
  isFinal,
  prevRoundName,
}: {
  tie: KnockoutTie;
  leagueName: string;
  isFinal: boolean;
  prevRoundName?: string;
}) {
  const bothTBD = tie.teamA.isTBD && tie.teamB.isTBD;
  if (bothTBD) return <TBDCard prevRoundName={prevRoundName} index={0} />;

  const scoreA = getTeamScore(tie, "A");
  const scoreB = getTeamScore(tie, "B");
  const hasScore = scoreA !== null && scoreB !== null;
  const winnerA = tie.completed && tie.winner === "A";
  const winnerB = tie.completed && tie.winner === "B";

  const canLink =
    tie.legs.length > 0 &&
    !tie.teamA.isTBD &&
    !tie.teamB.isTBD &&
    tie.legs.some((l) => l.status !== "STATUS_SCHEDULED");

  const statusInfo = getStatusInfo(tie);
  const aggLabel = buildAggLabel(tie);

  const card = (
    <div
      className={`flex h-full flex-col overflow-hidden rounded-lg border bg-surface-card ${
        isFinal
          ? "border-amber-400/40 shadow-md shadow-amber-400/10"
          : "border-surface-border shadow-sm"
      } transition-shadow hover:shadow-md`}
    >
      {/* Main: Logo vs Logo */}
      <div className="flex flex-1 items-center justify-center gap-3 px-3">
        {/* Team A */}
        <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 56 }}>
          <div className={`rounded-full p-0.5 ${winnerA ? "ring-2 ring-accent-green/50" : ""}`}>
            <TeamLogo url={tie.teamA.logo} name={tie.teamA.abbreviation} size={34} />
          </div>
          <span
            className={`max-w-[64px] truncate text-center text-[10px] leading-tight ${
              winnerA ? "font-bold text-text-primary" : winnerB ? "text-text-muted" : "font-medium text-text-primary"
            }`}
          >
            {tie.teamA.isTBD ? "TBD" : tie.teamA.abbreviation}
          </span>
        </div>

        {/* Score / VS */}
        <div className="flex flex-col items-center">
          {hasScore ? (
            <div className="flex items-center gap-1">
              <span
                className={`text-[18px] tabular-nums ${
                  winnerA ? "font-bold text-text-primary" : "font-semibold text-text-secondary"
                }`}
              >
                {scoreA}
              </span>
              <span className="text-[12px] text-text-muted">-</span>
              <span
                className={`text-[18px] tabular-nums ${
                  winnerB ? "font-bold text-text-primary" : "font-semibold text-text-secondary"
                }`}
              >
                {scoreB}
              </span>
            </div>
          ) : (
            <span className="text-[12px] font-semibold uppercase text-text-muted">vs</span>
          )}
        </div>

        {/* Team B */}
        <div className="flex flex-col items-center gap-0.5" style={{ minWidth: 56 }}>
          <div className={`rounded-full p-0.5 ${winnerB ? "ring-2 ring-accent-green/50" : ""}`}>
            <TeamLogo url={tie.teamB.logo} name={tie.teamB.abbreviation} size={34} />
          </div>
          <span
            className={`max-w-[64px] truncate text-center text-[10px] leading-tight ${
              winnerB ? "font-bold text-text-primary" : winnerA ? "text-text-muted" : "font-medium text-text-primary"
            }`}
          >
            {tie.teamB.isTBD ? "TBD" : tie.teamB.abbreviation}
          </span>
        </div>
      </div>

      {/* Footer: status + aggregate */}
      <div className="flex items-center justify-center gap-1.5 border-t border-surface-border/40 bg-surface-hover/30 px-2 py-1">
        {statusInfo.isLive && (
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-red" />
          </span>
        )}
        <span className={`text-[10px] font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
        {aggLabel && (
          <>
            <span className="text-[10px] text-text-muted">·</span>
            <span className="text-[10px] font-semibold text-text-tertiary">{aggLabel}</span>
          </>
        )}
      </div>
    </div>
  );

  if (canLink && !tie.isTwoLegged && tie.legs.length === 1) {
    return (
      <Link
        href={`/match/${tie.legs[0].eventId}?league=${encodeURIComponent(leagueName)}`}
        className="block h-full"
      >
        {card}
      </Link>
    );
  }

  return card;
}

// ── TBD placeholder card ────────────────────────────────────────────

function TBDCard({
  prevRoundName,
  index,
}: {
  prevRoundName?: string;
  index: number;
}) {
  return (
    <div className="flex h-full items-center justify-center rounded-lg border-2 border-dashed border-indigo-300/40 bg-surface-card/50 px-3">
      <div className="flex items-center gap-3">
        {/* Placeholder A */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-dashed border-surface-border/50 bg-surface-hover/40">
            <span className="text-[10px] text-text-muted">?</span>
          </div>
          <span className="max-w-[56px] truncate text-center text-[9px] text-text-muted">
            {prevRoundName ? `W${index * 2 + 1}` : "TBD"}
          </span>
        </div>

        <span className="text-[11px] font-medium text-text-muted">vs</span>

        {/* Placeholder B */}
        <div className="flex flex-col items-center gap-0.5">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 border-dashed border-surface-border/50 bg-surface-hover/40">
            <span className="text-[10px] text-text-muted">?</span>
          </div>
          <span className="max-w-[56px] truncate text-center text-[9px] text-text-muted">
            {prevRoundName ? `W${index * 2 + 2}` : "TBD"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Trophy icon ─────────────────────────────────────────────────────

function TrophyIcon() {
  return (
    <svg
      width="44"
      height="44"
      viewBox="0 0 48 48"
      fill="none"
      className="text-amber-400 drop-shadow-lg"
    >
      <path
        d="M16 8h16v2h4a4 4 0 010 8h-2.5c-1.5 4-4 7.2-7.5 9v5h4a2 2 0 012 2v2H16v-2a2 2 0 012-2h4v-5c-3.5-1.8-6-5-7.5-9H12a4 4 0 010-8h4V8z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M12 12h-0a2 2 0 00-2 2v0a2 2 0 002 2h2.2M36 12h0a2 2 0 012 2v0a2 2 0 01-2 2h-2.2"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function getStatusInfo(tie: KnockoutTie): { label: string; color: string; isLive: boolean } {
  const anyLive = tie.legs.some(
    (l) => l.status === "STATUS_IN_PROGRESS" || l.status === "STATUS_HALFTIME",
  );
  const allScheduled = tie.legs.every((l) => l.status === "STATUS_SCHEDULED");

  if (anyLive) {
    const live = tie.legs.find(
      (l) => l.status === "STATUS_IN_PROGRESS" || l.status === "STATUS_HALFTIME",
    );
    return { label: live?.statusDetail || "LIVE", color: "text-accent-red", isLive: true };
  }
  if (tie.completed) {
    return { label: "Full time", color: "text-text-muted", isLive: false };
  }
  if (allScheduled && tie.legs.length > 0) {
    const next = tie.legs.find((l) => l.status === "STATUS_SCHEDULED");
    return {
      label: next ? formatDate(next.date) : "Scheduled",
      color: "text-text-secondary",
      isLive: false,
    };
  }
  if (tie.legs.some((l) => l.status === "STATUS_FULL_TIME")) {
    return {
      label: tie.isTwoLegged ? "1st leg played" : "Full time",
      color: "text-text-muted",
      isLive: false,
    };
  }
  return { label: "TBD", color: "text-text-muted", isLive: false };
}

function buildAggLabel(tie: KnockoutTie): string | null {
  if (!tie.isTwoLegged || tie.aggregateA == null || tie.aggregateB == null) return null;
  const agg = `Agg ${tie.aggregateA}-${tie.aggregateB}`;
  if (!tie.completed || !tie.winner) return agg;
  const winner = tie.winner === "A" ? tie.teamA : tie.teamB;
  return `${agg} ${winner.abbreviation} win`;
}

function getTeamScore(tie: KnockoutTie, side: "A" | "B"): string | null {
  if (tie.legs.length === 0) return null;
  if (tie.legs.every((l) => l.status === "STATUS_SCHEDULED")) return null;

  if (tie.isTwoLegged && tie.aggregateA != null && tie.aggregateB != null) {
    return side === "A" ? String(tie.aggregateA) : String(tie.aggregateB);
  }

  const leg = tie.legs[0];
  if (!leg || leg.status === "STATUS_SCHEDULED") return null;
  const team = side === "A" ? tie.teamA : tie.teamB;
  if (leg.homeTeam.id === team.id) return String(leg.homeScore);
  if (leg.awayTeam.id === team.id) return String(leg.awayScore);
  return null;
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr.slice(0, 10);
  }
}
