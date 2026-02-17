"use client";

import { useEffect, useState } from "react";
import { TeamLogo } from "./team-logo";

interface StatsDashboardProps {
  leagueName: string;
  leagueShortName: string;
}

interface LeaderEntry {
  rank: number;
  name: string;
  team: string;
  teamLogo: string;
  value: string;
  highlight?: boolean;
}

interface TeamFormEntry {
  rank: number;
  name: string;
  logo: string;
  form: string[];
  points: number;
  gf: number;
  ga: number;
  gd: number;
}

interface LeagueStats {
  leaders: LeaderEntry[];
  teamForm: TeamFormEntry[];
  avgGoals: number;
  totalGoals: number;
  totalMatches: number;
  homeWinPct: number;
  awayWinPct: number;
  drawPct: number;
}

const LEAGUE_ESPN: Record<string, { sport: string; slug: string }> = {
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NFL: { sport: "football", slug: "nfl" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
};

function formBadge(result: string): string {
  if (result === "W") return "bg-accent-green/20 text-accent-green";
  if (result === "L") return "bg-accent-red/20 text-accent-red";
  return "bg-accent-amber/20 text-accent-amber";
}

export function StatsDashboard({ leagueName, leagueShortName }: StatsDashboardProps) {
  const [stats, setStats] = useState<LeagueStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeView, setActiveView] = useState<"leaders" | "form" | "overview">("leaders");

  useEffect(() => {
    const info = LEAGUE_ESPN[leagueName] || LEAGUE_ESPN[leagueShortName];
    if (!info) return;

    setLoading(true);
    setStats(null);

    (async () => {
      try {
        const { sport, slug } = info;
        const prefix =
          sport === "soccer" ? "soccer/" + slug : sport + "/" + slug;

        // Fetch scoreboard for match stats
        const sbUrl =
          "https://site.api.espn.com/apis/site/v2/sports/" +
          prefix +
          "/scoreboard";
        const sbRes = await fetch(sbUrl);
        const sbData = sbRes.ok ? await sbRes.json() : { events: [] };
        const events: any[] = sbData.events || [];

        // Calculate overview stats from events
        let totalGoals = 0;
        let totalMatches = 0;
        let homeWins = 0;
        let awayWins = 0;
        let draws = 0;

        for (const evt of events) {
          const comp = evt.competitions?.[0];
          if (!comp) continue;
          const status = comp.status?.type?.completed;
          if (!status) continue;

          totalMatches++;
          const competitors = comp.competitors || [];
          const home = competitors.find((c: any) => c.homeAway === "home");
          const away = competitors.find((c: any) => c.homeAway === "away");

          if (home && away) {
            const hs = parseInt(home.score || "0", 10);
            const as_ = parseInt(away.score || "0", 10);
            totalGoals += hs + as_;

            if (hs > as_) homeWins++;
            else if (as_ > hs) awayWins++;
            else draws++;
          }
        }

        const avgGoals = totalMatches > 0 ? totalGoals / totalMatches : 0;
        const homeWinPct =
          totalMatches > 0 ? (homeWins / totalMatches) * 100 : 0;
        const awayWinPct =
          totalMatches > 0 ? (awayWins / totalMatches) * 100 : 0;
        const drawPct =
          totalMatches > 0 ? (draws / totalMatches) * 100 : 0;

        // Fetch standings for form data
        const standUrl =
          "https://site.api.espn.com/apis/v2/sports/" +
          prefix +
          "/standings";
        const standRes = await fetch(standUrl);
        const standData = standRes.ok ? await standRes.json() : null;

        const teamForm: TeamFormEntry[] = [];
        if (standData?.children) {
          for (const group of standData.children) {
            const entries = group.standings?.entries || [];
            for (const entry of entries) {
              const team = entry.team || {};
              const entryStats = entry.stats || [];

              const getStat = (abbr: string): number => {
                const s = entryStats.find(
                  (st: any) => st.abbreviation === abbr || st.name === abbr
                );
                return s ? parseFloat(s.value || "0") : 0;
              };

              // Extract form/streak
              const formStr =
                entryStats.find(
                  (s: any) => s.name === "streak" || s.abbreviation === "STRK"
                )?.displayValue || "";

              // Build W/L form from record
              const wins = getStat("W") || getStat("wins");
              const losses = getStat("L") || getStat("losses");
              const pts = getStat("PTS") || getStat("points") || wins * 3;
              const gf =
                getStat("GF") ||
                getStat("pointsFor") ||
                getStat("F") ||
                0;
              const ga =
                getStat("GA") ||
                getStat("pointsAgainst") ||
                getStat("A") ||
                0;

              // Try to get recent form
              const recentForm: string[] = [];
              if (formStr) {
                for (const ch of formStr.slice(0, 5)) {
                  if (ch === "W" || ch === "w") recentForm.push("W");
                  else if (ch === "L" || ch === "l") recentForm.push("L");
                  else if (ch === "D" || ch === "d" || ch === "T" || ch === "t")
                    recentForm.push("D");
                }
              }

              teamForm.push({
                rank: teamForm.length + 1,
                name: team.displayName || team.name || "",
                logo: team.logos?.[0]?.href || "",
                form: recentForm,
                points: pts,
                gf: gf,
                ga: ga,
                gd: gf - ga,
              });
            }
          }
        }

        // Sort by points descending
        teamForm.sort((a, b) => b.points - a.points);
        teamForm.forEach((t, i) => (t.rank = i + 1));

        // Fetch leaders
        const leaders: LeaderEntry[] = [];

        // Try athlete leaders endpoint
        const isSoccer = sport === "soccer";
        if (!isSoccer) {
          // For US sports, get leaders from scoreboard data
          if (sbData.leagues?.[0]?.leaders) {
            for (const cat of sbData.leagues[0].leaders) {
              const catLeaders = cat.leaders || [];
              for (let i = 0; i < Math.min(catLeaders.length, 5); i++) {
                const l = catLeaders[i];
                const athlete = l.athlete || {};
                leaders.push({
                  rank: i + 1,
                  name: athlete.displayName || athlete.fullName || "Unknown",
                  team: athlete.team?.abbreviation || "",
                  teamLogo: athlete.team?.logos?.[0]?.href || "",
                  value: l.displayValue || l.value || "",
                  highlight: i === 0,
                });
              }
              if (leaders.length >= 10) break;
            }
          }
        } else {
          // For soccer, try season leaders
          const leadUrl =
            "https://site.api.espn.com/apis/site/v2/sports/soccer/" +
            slug +
            "/leaders";
          try {
            const leadRes = await fetch(leadUrl);
            if (leadRes.ok) {
              const leadData = await leadRes.json();
              const cats = leadData.leaders || leadData.categories || [];
              for (const cat of cats) {
                const entries = cat.leaders || cat.entries || [];
                for (let i = 0; i < Math.min(entries.length, 10); i++) {
                  const e = entries[i];
                  const ath = e.athlete || e.player || {};
                  leaders.push({
                    rank: i + 1,
                    name: ath.displayName || ath.fullName || "Unknown",
                    team: ath.team?.abbreviation || ath.teamName || "",
                    teamLogo: ath.team?.logos?.[0]?.href || "",
                    value: e.displayValue || String(e.value || ""),
                    highlight: i === 0,
                  });
                }
                break; // Just top scorers
              }
            }
          } catch {
            // Leaders optional
          }
        }

        setStats({
          leaders,
          teamForm: teamForm.slice(0, 20),
          avgGoals,
          totalGoals,
          totalMatches,
          homeWinPct,
          awayWinPct,
          drawPct,
        });
      } catch {
        // Stats are optional
      }
      setLoading(false);
    })();
  }, [leagueName, leagueShortName]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-surface-border border-t-accent-green" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="rounded-xl border border-surface-border bg-surface-card py-8 text-center">
        <div className="mb-2 text-2xl">📊</div>
        <div className="text-[13px] text-text-tertiary">
          Stats not available for this league
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      {/* Overview cards */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Total Matches" value={String(stats.totalMatches)} icon="🏟" />
        <StatCard label="Total Goals" value={String(stats.totalGoals)} icon="⚽" />
        <StatCard
          label="Goals/Match"
          value={stats.avgGoals.toFixed(1)}
          icon="📈"
        />
        <StatCard
          label="Home Win %"
          value={stats.homeWinPct.toFixed(0) + "%"}
          icon="🏠"
        />
      </div>

      {/* Win distribution bar */}
      {stats.totalMatches > 0 && (
        <div className="mb-6 overflow-hidden rounded-xl border border-surface-border bg-surface-card p-4">
          <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Result Distribution
          </div>
          <div className="flex h-6 overflow-hidden rounded-full">
            <div
              className="flex items-center justify-center bg-accent-green/80 text-[9px] font-bold text-white transition-all"
              style={{ width: stats.homeWinPct + "%" }}
              title={"Home wins: " + stats.homeWinPct.toFixed(1) + "%"}
            >
              {stats.homeWinPct > 10 ? "H " + stats.homeWinPct.toFixed(0) + "%" : ""}
            </div>
            <div
              className="flex items-center justify-center bg-accent-amber/80 text-[9px] font-bold text-white transition-all"
              style={{ width: stats.drawPct + "%" }}
              title={"Draws: " + stats.drawPct.toFixed(1) + "%"}
            >
              {stats.drawPct > 10 ? "D " + stats.drawPct.toFixed(0) + "%" : ""}
            </div>
            <div
              className="flex items-center justify-center bg-accent-blue/80 text-[9px] font-bold text-white transition-all"
              style={{ width: stats.awayWinPct + "%" }}
              title={"Away wins: " + stats.awayWinPct.toFixed(1) + "%"}
            >
              {stats.awayWinPct > 10 ? "A " + stats.awayWinPct.toFixed(0) + "%" : ""}
            </div>
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-text-muted">
            <span>🟢 Home</span>
            <span>🟡 Draw</span>
            <span>🔵 Away</span>
          </div>
        </div>
      )}

      {/* Sub-tabs */}
      <div className="mb-4 flex gap-1 rounded-xl border border-surface-border bg-surface-card p-1">
        {(["leaders", "form", "overview"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={
              "flex-1 rounded-lg py-2 text-[12px] font-semibold uppercase tracking-wider transition-all " +
              (activeView === v
                ? "bg-surface-hover text-text-primary shadow-sm"
                : "text-text-tertiary hover:text-text-secondary")
            }
          >
            {v === "leaders"
              ? "🏆 Leaders"
              : v === "form"
                ? "📋 Form"
                : "📊 Overview"}
          </button>
        ))}
      </div>

      {/* Leaders */}
      {activeView === "leaders" && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          {stats.leaders.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-muted">
              Leader data not available for this league
            </div>
          ) : (
            stats.leaders.map((l, i) => (
              <div
                key={l.name + i}
                className={
                  "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover/30 " +
                  (i < stats.leaders.length - 1
                    ? "border-b border-surface-border"
                    : "") +
                  (l.highlight ? " bg-accent-amber/[0.03]" : "")
                }
              >
                <span
                  className={
                    "min-w-[24px] text-center font-mono text-[12px] font-bold " +
                    (l.rank <= 3 ? "text-accent-amber" : "text-text-dim")
                  }
                >
                  {l.rank}
                </span>
                {l.teamLogo && (
                  <TeamLogo url={l.teamLogo} name={l.team} size={20} />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-semibold text-text-primary">
                    {l.name}
                  </div>
                  <div className="text-[10px] text-text-muted">{l.team}</div>
                </div>
                <span className="font-mono text-sm font-bold text-accent-green">
                  {l.value}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {/* Form table */}
      {activeView === "form" && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card">
          {stats.teamForm.length === 0 ? (
            <div className="py-8 text-center text-[12px] text-text-muted">
              Form data not available
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-surface-border text-[10px] font-bold uppercase tracking-wider text-text-dim">
                    <th className="px-3 py-2.5 text-left">#</th>
                    <th className="px-3 py-2.5 text-left">Team</th>
                    <th className="px-3 py-2.5 text-center">Pts</th>
                    <th className="px-3 py-2.5 text-center">GF</th>
                    <th className="px-3 py-2.5 text-center">GA</th>
                    <th className="px-3 py-2.5 text-center">GD</th>
                    <th className="px-3 py-2.5 text-center">Form</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.teamForm.map((t, i) => (
                    <tr
                      key={t.name}
                      className={
                        "transition-colors hover:bg-surface-hover/30 " +
                        (i < stats.teamForm.length - 1
                          ? "border-b border-surface-border"
                          : "")
                      }
                    >
                      <td className="px-3 py-2.5 font-mono font-bold text-text-dim">
                        {t.rank}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <TeamLogo url={t.logo} name={t.name} size={18} />
                          <span className="truncate font-medium text-text-primary">
                            {t.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-text-primary">
                        {t.points}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-text-secondary">
                        {t.gf}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-text-secondary">
                        {t.ga}
                      </td>
                      <td
                        className={
                          "px-3 py-2.5 text-center font-mono font-bold " +
                          (t.gd > 0
                            ? "text-accent-green"
                            : t.gd < 0
                              ? "text-accent-red"
                              : "text-text-muted")
                        }
                      >
                        {t.gd > 0 ? "+" : ""}
                        {t.gd}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-center gap-0.5">
                          {t.form.length > 0
                            ? t.form.map((f, fi) => (
                                <span
                                  key={fi}
                                  className={
                                    "flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold " +
                                    formBadge(f)
                                  }
                                >
                                  {f}
                                </span>
                              ))
                            : <span className="text-text-dim">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Overview — goals per matchday chart */}
      {activeView === "overview" && (
        <div className="overflow-hidden rounded-xl border border-surface-border bg-surface-card p-4">
          <div className="mb-4 text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Season Summary
          </div>

          <div className="grid grid-cols-2 gap-4">
            <MiniStat label="Avg Goals/Match" value={stats.avgGoals.toFixed(2)} />
            <MiniStat label="Total Goals" value={String(stats.totalGoals)} />
            <MiniStat label="Matches Played" value={String(stats.totalMatches)} />
            <MiniStat
              label="Most Common Result"
              value={
                stats.homeWinPct >= stats.awayWinPct && stats.homeWinPct >= stats.drawPct
                  ? "Home Win"
                  : stats.awayWinPct >= stats.drawPct
                    ? "Away Win"
                    : "Draw"
              }
            />
          </div>

          {stats.teamForm.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-text-dim">
                Top Scoring Teams
              </div>
              {stats.teamForm
                .sort((a, b) => b.gf - a.gf)
                .slice(0, 5)
                .map((t, i) => (
                  <div
                    key={t.name}
                    className="mb-2 flex items-center gap-2"
                  >
                    <TeamLogo url={t.logo} name={t.name} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-text-secondary">
                      {t.name}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className="h-2 rounded-full bg-accent-green/60"
                        style={{
                          width:
                            Math.max(
                              (t.gf /
                                Math.max(
                                  ...stats.teamForm.map((x) => x.gf),
                                  1
                                )) *
                                100,
                              8
                            ) + "px",
                        }}
                      />
                      <span className="font-mono text-[11px] font-bold text-accent-green">
                        {t.gf}
                      </span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-surface-border bg-surface-card p-3.5 text-center transition-colors hover:bg-surface-hover/30">
      <div className="mb-1 text-lg">{icon}</div>
      <div className="font-mono text-xl font-black text-text-primary">
        {value}
      </div>
      <div className="mt-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-hover/30 p-3">
      <div className="font-mono text-lg font-bold text-text-primary">
        {value}
      </div>
      <div className="text-[10px] text-text-muted">{label}</div>
    </div>
  );
}
