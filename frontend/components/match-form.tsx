"use client";

import { useCallback } from "react";
import { usePolling } from "@/hooks/use-polling";
import { fetchTeamForm, LEAGUE_ESPN_SLUGS, type TeamForm } from "@/lib/form-guide";
import { FormBadge } from "./form-badge";

interface MatchFormProps {
  homeTeamName: string;
  awayTeamName: string;
  leagueName: string;
}

interface FormData {
  home: TeamForm;
  away: TeamForm;
}

export function MatchForm({ homeTeamName, awayTeamName, leagueName }: MatchFormProps) {
  const mapping = LEAGUE_ESPN_SLUGS[leagueName];

  const fetcher = useCallback(async (): Promise<FormData> => {
    if (!mapping) return { home: { teamName: homeTeamName, results: [] }, away: { teamName: awayTeamName, results: [] } };

    // ESPN team schedule needs team ID — we search for it
    const [home, away] = await Promise.all([
      fetchTeamFormByName(homeTeamName, mapping.sport, mapping.slug),
      fetchTeamFormByName(awayTeamName, mapping.sport, mapping.slug),
    ]);

    return { home, away };
  }, [homeTeamName, awayTeamName, mapping, leagueName]);

  const { data } = usePolling<FormData>({
    fetcher,
    interval: 600000, // 10 min — form doesn't change often
    enabled: !!mapping,
    key: `form-${homeTeamName}-${awayTeamName}`,
  });

  if (!data || (data.home.results.length === 0 && data.away.results.length === 0)) {
    return null;
  }

  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-surface-border bg-surface-card">
      <div className="border-b border-surface-border px-4 py-2.5">
        <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-text-tertiary">
          Form Guide — Last 5
        </h4>
      </div>
      {data.home.results.length > 0 && (
        <div className="flex items-center justify-between border-b border-surface-border/50 px-4 py-2.5">
          <span className="text-[12px] font-medium text-text-secondary">{homeTeamName}</span>
          <FormBadge results={data.home.results} size="md" />
        </div>
      )}
      {data.away.results.length > 0 && (
        <div className="flex items-center justify-between px-4 py-2.5">
          <span className="text-[12px] font-medium text-text-secondary">{awayTeamName}</span>
          <FormBadge results={data.away.results} size="md" />
        </div>
      )}
    </div>
  );
}

/**
 * Search ESPN for a team by name, then fetch their schedule.
 */
async function fetchTeamFormByName(
  teamName: string,
  sport: string,
  leagueSlug: string,
): Promise<TeamForm> {
  try {
    // Search for team in ESPN
    const searchUrl = `/api/espn/site/${sport}/${leagueSlug}/teams?limit=100`;
    const searchRes = await fetch(searchUrl);
    if (!searchRes.ok) return { teamName, results: [] };

    const searchData = await searchRes.json();
    const teams = searchData?.sports?.[0]?.leagues?.[0]?.teams || [];

    const match = teams.find((t: any) => {
      const team = t.team;
      return (
        team.displayName?.toLowerCase() === teamName.toLowerCase() ||
        team.shortDisplayName?.toLowerCase() === teamName.toLowerCase() ||
        team.abbreviation?.toLowerCase() === teamName.toLowerCase() ||
        team.name?.toLowerCase() === teamName.toLowerCase() ||
        teamName.toLowerCase().includes(team.name?.toLowerCase()) ||
        team.displayName?.toLowerCase().includes(teamName.toLowerCase())
      );
    });

    if (!match) return { teamName, results: [] };

    const teamId = match.team.id;
    return fetchTeamForm(teamId, teamName, sport, leagueSlug);
  } catch {
    return { teamName, results: [] };
  }
}