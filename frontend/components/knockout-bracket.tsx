"use client";

import Link from "next/link";
import { TeamLogo } from "./team-logo";
import type {
  KnockoutBracket as KnockoutBracketData,
  KnockoutRound,
  KnockoutTie,
  KnockoutLeg,
  KnockoutTeam,
} from "@/lib/types";

interface KnockoutBracketProps {
  bracket: KnockoutBracketData;
  leagueName: string;
}

export function KnockoutBracket({ bracket, leagueName }: KnockoutBracketProps) {
  if (bracket.rounds.length === 0) return null;

  return (
    <div className="overflow-x-auto pb-4">
      <div className="flex min-w-max items-start">
        {bracket.rounds.map((round, ri) => (
          <div key={round.slug} className="flex items-start">
            <RoundColumn
              round={round}
              roundIndex={ri}
              totalRounds={bracket.rounds.length}
              leagueName={leagueName}
            />
            {ri < bracket.rounds.length - 1 && (
              <ConnectorColumn
                tiesLeft={round.ties.length}
                tiesRight={bracket.rounds[ri + 1].ties.length}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Round column ────────────────────────────────────────────────────

function RoundColumn({
  round,
  roundIndex,
  totalRounds,
  leagueName,
}: {
  round: KnockoutRound;
  roundIndex: number;
  totalRounds: number;
  leagueName: string;
}) {
  const isFinal = roundIndex === totalRounds - 1;
  const width = isFinal ? "min-w-[220px] max-w-[240px]" : "min-w-[240px] max-w-[280px]";

  return (
    <div className={`flex flex-col ${width}`}>
      <div className="mb-3 text-center">
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-tertiary">
          {round.displayName}
        </span>
      </div>

      <div
        className="flex flex-1 flex-col justify-around"
        style={{ gap: gapForRound(roundIndex, totalRounds) }}
      >
        {round.ties.map((tie, ti) => (
          <MatchupCard key={ti} tie={tie} leagueName={leagueName} isFinal={isFinal} />
        ))}
        {round.ties.length === 0 && (
          <div className="flex h-[72px] items-center justify-center rounded-lg border border-dashed border-surface-border/60">
            <span className="text-[11px] italic text-text-muted">TBD</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Matchup card (UEFA-style) ───────────────────────────────────────

function MatchupCard({
  tie,
  leagueName,
  isFinal,
}: {
  tie: KnockoutTie;
  leagueName: string;
  isFinal: boolean;
}) {
  return (
    <div
      className={`overflow-hidden rounded-lg border border-surface-border bg-surface-card shadow-sm transition-shadow hover:shadow-md ${
        isFinal ? "ring-1 ring-accent-green/20" : ""
      }`}
    >
      {/* Header: date + aggregate */}
      <MatchupHeader tie={tie} />

      {/* Team A */}
      <TeamStrip team={tie.teamA} side="A" tie={tie} leagueName={leagueName} />

      {/* Divider */}
      <div className="h-px bg-surface-border/60" />

      {/* Team B */}
      <TeamStrip team={tie.teamB} side="B" tie={tie} leagueName={leagueName} />

      {/* Leg details footer */}
      {tie.isTwoLegged && tie.legs.length > 0 && (
        <LegFooter legs={tie.legs} leagueName={leagueName} />
      )}
    </div>
  );
}

// ── Matchup header ──────────────────────────────────────────────────

function MatchupHeader({ tie }: { tie: KnockoutTie }) {
  const anyLive = tie.legs.some(
    (l) => l.status === "STATUS_IN_PROGRESS" || l.status === "STATUS_HALFTIME",
  );
  const allScheduled = tie.legs.every((l) => l.status === "STATUS_SCHEDULED");
  const hasAggregate = tie.isTwoLegged && tie.aggregateA != null && tie.aggregateB != null;

  let label: string;
  let color: string;

  if (anyLive) {
    label = "LIVE";
    color = "text-accent-red";
  } else if (tie.completed) {
    label = "FT";
    color = "text-text-muted";
  } else if (allScheduled && tie.legs.length > 0) {
    const next = tie.legs.find((l) => l.status === "STATUS_SCHEDULED");
    label = next ? formatShortDate(next.date) : "Scheduled";
    color = "text-accent-blue";
  } else if (tie.legs.some((l) => l.status === "STATUS_FULL_TIME")) {
    label = tie.isTwoLegged ? "1st leg played" : "FT";
    color = "text-text-muted";
  } else {
    label = "";
    color = "text-text-muted";
  }

  return (
    <div className="flex items-center justify-between bg-surface-hover/40 px-3 py-1.5">
      <div className="flex items-center gap-1.5">
        {anyLive && (
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-red opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-red" />
          </span>
        )}
        <span className={`text-[10px] font-semibold uppercase tracking-wide ${color}`}>
          {label}
        </span>
      </div>
      {hasAggregate && (
        <span className="rounded bg-surface-card px-1.5 py-0.5 text-[10px] font-bold text-text-secondary shadow-sm">
          Agg {tie.aggregateA}-{tie.aggregateB}
        </span>
      )}
    </div>
  );
}

// ── Team strip (single row for a team) ──────────────────────────────

function TeamStrip({
  team,
  side,
  tie,
  leagueName,
}: {
  team: KnockoutTeam;
  side: "A" | "B";
  tie: KnockoutTie;
  leagueName: string;
}) {
  const isWinner = tie.winner === side;
  const score = getTeamScore(tie, side);
  const canLink = tie.legs.length > 0 && !team.isTBD;

  const strip = (
    <div
      className={`flex items-center gap-2.5 px-3 py-2 transition-colors ${
        canLink ? "cursor-pointer hover:bg-surface-hover/50" : ""
      } ${isWinner ? "bg-accent-green/[0.06]" : ""}`}
    >
      {/* Winner indicator bar */}
      <div
        className={`h-8 w-[3px] flex-shrink-0 rounded-full ${
          isWinner ? "bg-accent-green" : "bg-transparent"
        }`}
      />

      {/* Team logo */}
      <TeamLogo url={team.logo} name={team.abbreviation} size={28} />

      {/* Team name */}
      <span
        className={`flex-1 truncate text-[13px] ${
          team.isTBD
            ? "italic text-text-muted"
            : isWinner
              ? "font-bold text-text-primary"
              : "font-medium text-text-primary"
        }`}
      >
        {team.name}
      </span>

      {/* Score */}
      {score !== null ? (
        <span
          className={`flex h-7 min-w-[28px] items-center justify-center rounded-md text-[14px] font-bold ${
            isWinner
              ? "bg-accent-green/15 text-accent-green"
              : "bg-surface-hover/60 text-text-secondary"
          }`}
        >
          {score}
        </span>
      ) : (
        <span className="flex h-7 min-w-[28px] items-center justify-center rounded-md bg-surface-hover/40 text-[12px] text-text-muted">
          -
        </span>
      )}
    </div>
  );

  if (canLink && !tie.isTwoLegged && tie.legs.length === 1) {
    return (
      <Link
        href={`/match/${tie.legs[0].eventId}?league=${encodeURIComponent(leagueName)}`}
        className="block"
      >
        {strip}
      </Link>
    );
  }

  return strip;
}

// ── Leg footer ──────────────────────────────────────────────────────

function LegFooter({ legs, leagueName }: { legs: KnockoutLeg[]; leagueName: string }) {
  return (
    <div className="border-t border-surface-border/50 bg-surface-hover/20">
      {legs.map((leg) => {
        const finished = leg.status === "STATUS_FULL_TIME" || leg.status === "STATUS_FINAL";
        const isLive = leg.status === "STATUS_IN_PROGRESS" || leg.status === "STATUS_HALFTIME";
        const scheduled = leg.status === "STATUS_SCHEDULED";

        const row = (
          <div className="flex items-center gap-2 px-3 py-1 text-[10px]">
            <span className="w-[32px] flex-shrink-0 font-semibold text-text-muted">
              Leg {leg.legNumber}
            </span>
            <TeamLogo url={leg.homeTeam.logo} name={leg.homeTeam.abbreviation} size={14} />
            <span className="font-medium text-text-secondary">
              {leg.homeTeam.abbreviation}
            </span>
            <span className="font-bold text-text-primary">
              {finished || isLive ? `${leg.homeScore} - ${leg.awayScore}` : "vs"}
            </span>
            <span className="font-medium text-text-secondary">
              {leg.awayTeam.abbreviation}
            </span>
            <TeamLogo url={leg.awayTeam.logo} name={leg.awayTeam.abbreviation} size={14} />
            <span className="ml-auto flex-shrink-0">
              {isLive ? (
                <span className="font-bold text-accent-red">{leg.statusDetail || "LIVE"}</span>
              ) : scheduled ? (
                <span className="text-accent-blue">{formatShortDate(leg.date)}</span>
              ) : (
                <span className="text-text-muted">FT</span>
              )}
            </span>
          </div>
        );

        if (finished || isLive) {
          return (
            <Link
              key={leg.eventId}
              href={`/match/${leg.eventId}?league=${encodeURIComponent(leagueName)}`}
              className="block transition-colors hover:bg-surface-hover/40"
            >
              {row}
            </Link>
          );
        }
        return <div key={leg.eventId}>{row}</div>;
      })}
    </div>
  );
}

// ── Bracket connector lines (SVG) ───────────────────────────────────

function ConnectorColumn({
  tiesLeft,
  tiesRight,
}: {
  tiesLeft: number;
  tiesRight: number;
}) {
  if (tiesLeft === 0 || tiesRight === 0) {
    return <div className="w-6 flex-shrink-0" />;
  }

  const leftH = tiesLeft * 100;
  const rightH = tiesRight * 100;
  const svgH = Math.max(leftH, rightH, 200);
  const midX = 24;

  const leftPositions = distributePositions(tiesLeft, svgH);
  const rightPositions = distributePositions(tiesRight, svgH);

  const paths: string[] = [];
  for (let i = 0; i < tiesRight; i++) {
    const topIdx = i * 2;
    const bottomIdx = i * 2 + 1;
    const rightY = rightPositions[i];

    if (topIdx < leftPositions.length) {
      const topY = leftPositions[topIdx];
      paths.push(`M 0 ${topY} C ${midX} ${topY}, ${midX} ${rightY}, ${midX * 2} ${rightY}`);
    }
    if (bottomIdx < leftPositions.length) {
      const bottomY = leftPositions[bottomIdx];
      paths.push(`M 0 ${bottomY} C ${midX} ${bottomY}, ${midX} ${rightY}, ${midX * 2} ${rightY}`);
    }
  }

  return (
    <div className="flex flex-shrink-0 items-start" style={{ width: 48 }}>
      <svg
        width={48}
        height={svgH}
        viewBox={`0 0 48 ${svgH}`}
        className="text-surface-border"
        style={{ marginTop: 28 }}
      >
        {paths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            strokeOpacity={0.5}
          />
        ))}
      </svg>
    </div>
  );
}

function distributePositions(count: number, height: number): number[] {
  if (count <= 0) return [];
  if (count === 1) return [height / 2];
  const positions: number[] = [];
  const cardH = 72;
  const totalUsed = count * cardH;
  const gap = count > 1 ? (height - totalUsed) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    positions.push(i * (cardH + gap) + cardH / 2);
  }
  return positions;
}

// ── Helpers ─────────────────────────────────────────────────────────

function gapForRound(roundIndex: number, totalRounds: number): string {
  const base = 8;
  const multiplier = Math.pow(2, roundIndex);
  const gap = Math.min(base * multiplier, 64);
  return `${gap}px`;
}

function getTeamScore(tie: KnockoutTie, side: "A" | "B"): string | null {
  if (tie.legs.length === 0) return null;
  const allScheduled = tie.legs.every((l) => l.status === "STATUS_SCHEDULED");
  if (allScheduled) return null;

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

function formatShortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return dateStr.slice(0, 10);
  }
}
