"use client";

import { useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { TeamLogo } from "./team-logo";

interface HeadToHeadProps {
  homeTeamName: string;
  awayTeamName: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  leagueName: string;
}

interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  venue: string;
}

interface H2HSummary {
  matches: H2HMatch[];
  homeWins: number;
  awayWins: number;
  draws: number;
}

const LEAGUE_ESPN_MAP: Record<string, { sport: string; slug: string }> = {
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  "Bundesliga": { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  "MLS": { sport: "soccer", slug: "usa.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  "NBA": { sport: "basketball", slug: "nba" },
  "WNBA": { sport: "basketball", slug: "wnba" },
  "NHL": { sport: "hockey", slug: "nhl" },
  "MLB": { sport: "baseball", slug: "mlb" },
};

async function findTeamId(
  teamName: string,
  sport: string,
  slug: string,
): Promise<string | null> {
  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/teams?limit=100`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const teams = data?.sports?.[0]?.leagues?.[0]?.teams || [];

    const match = teams.find((t: any) => {
      const team = t.team;
      const name = teamName.toLowerCase();
      return (
        team.displayName?.toLowerCase() === name ||
        team.shortDisplayName?.toLowerCase() === name ||
        team.name?.toLowerCase() === name ||
        name.includes(team.name?.toLowerCase()) ||
        team.displayName?.toLowerCase().includes(name)
      );
    });

    return match?.team?.id || null;
  } catch {
    return null;
  }
}

async function fetchH2H(
  homeTeamName: string,
  awayTeamName: string,
  sport: string,
  slug: string,
): Promise<H2HSummary> {
  const empty: H2HSummary = { matches: [], homeWins: 0, awayWins: 0, draws: 0 };

  const homeId = await findTeamId(homeTeamName, sport, slug);
  if (!homeId) return empty;

  try {
    const url = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${slug}/teams/${homeId}/schedule?season=2025`;
    const res = await fetch(url);
    if (!res.ok) return empty;

    const data = await res.json();
    const events = data?.events || [];
    const awayLower = awayTeamName.toLowerCase();

    const h2hMatches: H2HMatch[] = [];
    let homeWins = 0;
    let awayWins = 0;
    let draws = 0;

    for (const event of events) {
      const comp = event.competitions?.[0];
      if (!comp) continue;
      if (comp.status?.type?.name !== "STATUS_FINAL") continue;

      const competitors = comp.competitors || [];
      const opponent = competitors.find((c: any) => c.team?.id !== homeId);
      if (!opponent) continue;

      const oppName = (opponent.team?.displayName || "").toLowerCase();
      const oppShort = (opponent.team?.shortDisplayName || "").toLowerCase();
      const oppAbbr = (opponent.team?.abbreviation || "").toLowerCase();

      const isOpponent =
        oppName === awayLower ||
        oppShort === awayLower ||
        awayLower.includes(oppName) ||
        oppName.includes(awayLower) ||
        oppAbbr === awayLower;

      if (!isOpponent) continue;

      const homeComp = competitors.find((c: any) => c.homeAway === "home");
      const awayComp = competitors.find((c: any) => c.homeAway === "away");

      if (!homeComp || !awayComp) continue;

      const hScore = Number(homeComp.score) || 0;
      const aScore = Number(awayComp.score) || 0;

      const hName = homeComp.team?.displayName || "";
      const aName = awayComp.team?.displayName || "";

      if (hScore > aScore) {
        if (homeComp.team?.id === homeId) homeWins++;
        else awayWins++;
      } else if (aScore > hScore) {
        if (awayComp.team?.id === homeId) homeWins++;
        else awayWins++;
      } else {
        draws++;
      }

      h2hMatches.push({
        date: event.date || "",
        homeTeam: hName,
        awayTeam: aName,
        homeScore: hScore,
        awayScore: aScore,
        venue: comp.venue?.fullName || "",
      });
    }

    return {
      matches: h2hMatches.slice(0, 5),
      homeWins,
      awayWins,
      draws,
    };
  } catch {
    return empty;
  }
}

export function HeadToHead({
  homeTeamName,
  awayTeamName,
  homeTeamLogo,
  awayTeamLogo,
  leagueName,
}: HeadToHeadProps) {
  const mapping = LEAGUE_ESPN_MAP[leagueName];

  const fetcher = useCallback(async (): Promise<H2HSummary> => {
    if (!mapping) return { matches: [], homeWins: 0, awayWins: 0, draws: 0 };
    return fetchH2H(homeTeamName, awayTeamName, mapping.sport, mapping.slug);
  }, [homeTeamName, awayTeamName, mapping]);

  const { data } = usePolling<H2HSummary>({
    fetcher,
    interval: 600000,
    enabled: !!mapping,
    key: `h2h-${homeTeamName}-${awayTeamName}`,
  });

  if (!data || data.matches.length === 0) return null;

  const total = data.homeWins + data.awayWins + data.draws;

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Head to Head
        </h4>
      </div>

      {/* Summary bar */}
      {total > 0 && (
        <div className="border-b border-surface-border px-4 py-3">
          <div className="mb-2 flex items-center justify-between text-[11px]">
            <div className="flex items-center gap-1.5">
              <TeamLogo url={homeTeamLogo} name={homeTeamName} size={16} />
              <span className="font-bold text-emerald-400">{data.homeWins}</span>
            </div>
            <span className="text-text-muted">{data.draws} draw{data.draws !== 1 ? "s" : ""}</span>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-red-400">{data.awayWins}</span>
              <TeamLogo url={awayTeamLogo} name={awayTeamName} size={16} />
            </div>
          </div>
          {/* Visual bar */}
          <div className="flex h-2 overflow-hidden rounded-full">
            {data.homeWins > 0 && (
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${(data.homeWins / total) * 100}%` }}
              />
            )}
            {data.draws > 0 && (
              <div
                className="bg-amber-500/60 transition-all"
                style={{ width: `${(data.draws / total) * 100}%` }}
              />
            )}
            {data.awayWins > 0 && (
              <div
                className="bg-red-500 transition-all"
                style={{ width: `${(data.awayWins / total) * 100}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Recent matches */}
      {data.matches.map((m, i) => {
        const homeWon = m.homeScore > m.awayScore;
        const awayWon = m.awayScore > m.homeScore;
        const dateStr = m.date
          ? new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : "";

        return (
          <div
            key={i}
            className={`flex items-center gap-2 px-4 py-2.5 text-[11px] ${
              i < data.matches.length - 1 ? "border-b border-surface-border/50" : ""
            }`}
            style={{ animation: `fadeIn 0.3s ease ${i * 0.06}s both` }}
          >
            <span className="min-w-[70px] text-text-muted">{dateStr}</span>
            <span className={`flex-1 text-right ${homeWon ? "font-bold text-text-primary" : "text-text-tertiary"}`}>
              {m.homeTeam}
            </span>
            <span className="min-w-[45px] text-center font-mono font-bold text-text-primary">
              {m.homeScore} - {m.awayScore}
            </span>
            <span className={`flex-1 text-left ${awayWon ? "font-bold text-text-primary" : "text-text-tertiary"}`}>
              {m.awayTeam}
            </span>
          </div>
        );
      })}
    </div>
  );
}