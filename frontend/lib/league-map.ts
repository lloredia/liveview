export interface LeagueEspnInfo {
  sport: string;
  slug: string;
}

export const LEAGUE_ESPN: Record<string, LeagueEspnInfo> = {
  // Soccer — domestic leagues
  "Premier League": { sport: "soccer", slug: "eng.1" },
  "English Premier League": { sport: "soccer", slug: "eng.1" },
  Championship: { sport: "soccer", slug: "eng.2" },
  "English Championship": { sport: "soccer", slug: "eng.2" },
  "La Liga": { sport: "soccer", slug: "esp.1" },
  Bundesliga: { sport: "soccer", slug: "ger.1" },
  "Serie A": { sport: "soccer", slug: "ita.1" },
  "Ligue 1": { sport: "soccer", slug: "fra.1" },
  MLS: { sport: "soccer", slug: "usa.1" },
  "Major League Soccer": { sport: "soccer", slug: "usa.1" },
  Eredivisie: { sport: "soccer", slug: "ned.1" },
  "Liga Portugal": { sport: "soccer", slug: "por.1" },
  "Turkish Super Lig": { sport: "soccer", slug: "tur.1" },
  "Scottish Premiership": { sport: "soccer", slug: "sco.1" },
  "Saudi Pro League": { sport: "soccer", slug: "sau.1" },
  "FA Cup": { sport: "soccer", slug: "eng.fa" },
  "EFL Cup": { sport: "soccer", slug: "eng.league_cup" },

  // Soccer — European competitions
  "Champions League": { sport: "soccer", slug: "uefa.champions" },
  "UEFA Champions League": { sport: "soccer", slug: "uefa.champions" },
  "Europa League": { sport: "soccer", slug: "uefa.europa" },
  "UEFA Europa League": { sport: "soccer", slug: "uefa.europa" },
  "Conference League": { sport: "soccer", slug: "uefa.europa.conf" },
  "UEFA Europa Conference League": { sport: "soccer", slug: "uefa.europa.conf" },

  // Other sports
  NBA: { sport: "basketball", slug: "nba" },
  WNBA: { sport: "basketball", slug: "wnba" },
  NCAAM: { sport: "basketball", slug: "mens-college-basketball" },
  NCAAW: { sport: "basketball", slug: "womens-college-basketball" },
  NHL: { sport: "hockey", slug: "nhl" },
  MLB: { sport: "baseball", slug: "mlb" },
  NFL: { sport: "football", slug: "nfl" },
};

export function getEspnForLeague(leagueName: string): LeagueEspnInfo | null {
  if (!leagueName) return null;
  if (LEAGUE_ESPN[leagueName]) return LEAGUE_ESPN[leagueName];
  const lower = leagueName.toLowerCase();
  for (const key of Object.keys(LEAGUE_ESPN)) {
    if (key.toLowerCase() === lower) return LEAGUE_ESPN[key];
  }
  return null;
}
