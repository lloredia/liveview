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

// ── Props ───────────────────────────────────────────────────────────

interface KnockoutBracketProps {
  bracket: KnockoutBracketData;
  leagueName: string;
}

// ── Main component ──────────────────────────────────────────────────

export function KnockoutBracket({ bracket, leagueName }: KnockoutBracketProps) {
  if (bracket.rounds.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border bg-surface-card">
      <div className="flex min-w-max gap-0">
        {bracket.rounds.map((round, ri) => (
          <RoundColumn
            key={round.slug}
            round={round}
            leagueName={leagueName}
            isLast={ri === bracket.rounds.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

// ── Round column ────────────────────────────────────────────────────

function RoundColumn({
  round,
  leagueName,
  isLast,
}: {
  round: KnockoutRound;
  leagueName: string;
  isLast: boolean;
}) {
  return (
    <div
      className={`flex min-w-[240px] flex-col ${
        !isLast ? "border-r border-surface-border" : ""
      }`}
    >
      <div className="border-b border-surface-border bg-surface-hover/30 px-3 py-2.5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
          {round.displayName}
        </span>
        <span className="ml-1.5 text-[10px] text-text-muted">
          ({round.ties.length})
        </span>
      </div>

      <div className="flex flex-1 flex-col justify-around gap-2 p-2">
        {round.ties.map((tie, ti) => (
          <TieCard key={ti} tie={tie} leagueName={leagueName} />
        ))}
        {round.ties.length === 0 && (
          <div className="py-6 text-center text-[11px] text-text-muted">
            TBD
          </div>
        )}
      </div>
    </div>
  );
}

// ── Tie card ────────────────────────────────────────────────────────

function TieCard({ tie, leagueName }: { tie: KnockoutTie; leagueName: string }) {
  const primaryLeg = tie.legs[0] ?? null;
  const canLink = primaryLeg && !tie.teamA.isTBD && !tie.teamB.isTBD;

  return (
    <div className="overflow-hidden rounded-lg border border-surface-border/70 bg-surface-card transition-shadow hover:shadow-sm">
      {/* Status header */}
      <TieStatusHeader tie={tie} />

      {/* Team rows */}
      <TeamRow
        team={tie.teamA}
        side="A"
        tie={tie}
        leagueName={leagueName}
        canLink={canLink}
      />
      <div className="mx-2 h-px bg-surface-border/50" />
      <TeamRow
        team={tie.teamB}
        side="B"
        tie={tie}
        leagueName={leagueName}
        canLink={canLink}
      />

      {/* Leg details for two-legged ties */}
      {tie.isTwoLegged && tie.legs.length > 0 && (
        <LegDetails legs={tie.legs} leagueName={leagueName} />
      )}
    </div>
  );
}

// ── Tie status header ───────────────────────────────────────────────

function TieStatusHeader({ tie }: { tie: KnockoutTie }) {
  const allScheduled = tie.legs.every(l => l.status === "STATUS_SCHEDULED");
  const anyLive = tie.legs.some(l =>
    l.status === "STATUS_IN_PROGRESS" || l.status === "STATUS_HALFTIME",
  );

  let statusText: string;
  let statusColor: string;

  if (anyLive) {
    const liveLeg = tie.legs.find(l =>
      l.status === "STATUS_IN_PROGRESS" || l.status === "STATUS_HALFTIME",
    )!;
    statusText = liveLeg.statusDetail || "LIVE";
    statusColor = "text-accent-red";
  } else if (tie.completed) {
    statusText = "FT";
    statusColor = "text-text-muted";
  } else if (allScheduled && tie.legs.length > 0) {
    const nextLeg = tie.legs.find(l => l.status === "STATUS_SCHEDULED");
    statusText = nextLeg ? formatShortDate(nextLeg.date) : "Scheduled";
    statusColor = "text-accent-blue";
  } else if (tie.legs.some(l => l.status === "STATUS_FULL_TIME")) {
    statusText = tie.isTwoLegged ? "1st leg played" : "FT";
    statusColor = "text-text-muted";
  } else {
    statusText = "TBD";
    statusColor = "text-text-muted";
  }

  return (
    <div className="flex items-center justify-between border-b border-surface-border/40 px-2.5 py-1.5">
      <span className={`text-[10px] font-semibold uppercase tracking-wide ${statusColor}`}>
        {anyLive && (
          <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-accent-red" />
        )}
        {statusText}
      </span>
      {tie.isTwoLegged && tie.aggregateA != null && tie.aggregateB != null && (
        <span className="text-[10px] font-bold text-text-secondary">
          AGG {tie.aggregateA}-{tie.aggregateB}
        </span>
      )}
    </div>
  );
}

// ── Team row ────────────────────────────────────────────────────────

function TeamRow({
  team,
  side,
  tie,
  leagueName,
  canLink,
}: {
  team: KnockoutTeam;
  side: "A" | "B";
  tie: KnockoutTie;
  leagueName: string;
  canLink: boolean;
}) {
  const isWinner = tie.winner === side;
  const score = getTeamScore(tie, side);

  const content = (
    <div
      className={`flex items-center gap-2 px-2.5 py-2 transition-colors ${
        canLink ? "hover:bg-surface-hover/40" : ""
      } ${isWinner ? "bg-accent-green/5" : ""}`}
    >
      <TeamLogo url={team.logo} name={team.abbreviation} size={18} />
      <span
        className={`flex-1 truncate text-[12px] ${
          team.isTBD
            ? "italic text-text-muted"
            : isWinner
              ? "font-bold text-text-primary"
              : "font-medium text-text-primary"
        }`}
      >
        {team.name}
      </span>
      {score !== null && (
        <span
          className={`min-w-[20px] text-right font-mono text-[12px] ${
            isWinner ? "font-bold text-text-primary" : "text-text-secondary"
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );

  if (canLink && tie.legs.length === 1) {
    const leg = tie.legs[0];
    return (
      <Link
        href={`/match/${leg.eventId}?league=${encodeURIComponent(leagueName)}`}
        className="block"
      >
        {content}
      </Link>
    );
  }

  return content;
}

// ── Leg details (expanded for two-legged ties) ─────────────────────

function LegDetails({ legs, leagueName }: { legs: KnockoutLeg[]; leagueName: string }) {
  return (
    <div className="border-t border-surface-border/40 bg-surface-hover/20 px-2.5 py-1.5">
      {legs.map((leg) => {
        const finished = leg.status === "STATUS_FULL_TIME" || leg.status === "STATUS_FINAL";
        const isLive = leg.status === "STATUS_IN_PROGRESS" || leg.status === "STATUS_HALFTIME";
        const scheduled = leg.status === "STATUS_SCHEDULED";

        const inner = (
          <div className="flex items-center gap-1.5 py-0.5 text-[10px]">
            <span className="w-[42px] font-semibold text-text-muted">
              Leg {leg.legNumber}
            </span>
            <span className="flex-1 truncate text-text-secondary">
              {leg.homeTeam.abbreviation} {finished || isLive ? `${leg.homeScore}-${leg.awayScore}` : "vs"} {leg.awayTeam.abbreviation}
            </span>
            <span
              className={`text-[9px] font-semibold ${
                isLive ? "text-accent-red" : scheduled ? "text-accent-blue" : "text-text-muted"
              }`}
            >
              {isLive
                ? leg.statusDetail || "LIVE"
                : scheduled
                  ? formatShortDate(leg.date)
                  : "FT"}
            </span>
          </div>
        );

        if (finished || isLive) {
          return (
            <Link
              key={leg.eventId}
              href={`/match/${leg.eventId}?league=${encodeURIComponent(leagueName)}`}
              className="block rounded transition-colors hover:bg-surface-hover/40"
            >
              {inner}
            </Link>
          );
        }

        return <div key={leg.eventId}>{inner}</div>;
      })}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function getTeamScore(tie: KnockoutTie, side: "A" | "B"): string | null {
  if (tie.legs.length === 0) return null;
  const allScheduled = tie.legs.every(l => l.status === "STATUS_SCHEDULED");
  if (allScheduled) return null;

  if (tie.isTwoLegged && tie.aggregateA != null && tie.aggregateB != null) {
    return side === "A" ? String(tie.aggregateA) : String(tie.aggregateB);
  }

  // Single leg: show score of the only leg
  const leg = tie.legs[0];
  if (!leg) return null;
  const isScheduled = leg.status === "STATUS_SCHEDULED";
  if (isScheduled) return null;

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
