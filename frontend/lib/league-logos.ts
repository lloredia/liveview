/** Map league name / short_name to ESPN/CDN logo URLs (static fallback). */
const LEAGUE_LOGOS: Record<string, string> = {
  // Soccer — Top leagues
  "Premier League": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  "La Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  "Bundesliga": "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  "Serie A": "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  "Ligue 1": "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png",
  "Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "MLS": "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png",
  // Soccer — Additional leagues
  "Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  "Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/20296.png",
  "Championship": "https://a.espncdn.com/i/leaguelogos/soccer/500/24.png",
  "FA Cup": "https://a.espncdn.com/i/leaguelogos/soccer/500/40.png",
  "EFL Cup": "https://a.espncdn.com/i/leaguelogos/soccer/500/41.png",
  "Eredivisie": "https://a.espncdn.com/i/leaguelogos/soccer/500/11.png",
  "Liga Portugal": "https://a.espncdn.com/i/leaguelogos/soccer/500/14.png",
  "Turkish Super Lig": "https://a.espncdn.com/i/leaguelogos/soccer/500/18.png",
  "Scottish Premiership": "https://a.espncdn.com/i/leaguelogos/soccer/500/45.png",
  "Saudi Pro League": "https://a.espncdn.com/combiner/i?img=/i/leaguelogos/soccer/500/4710.png",
  "Liga MX": "https://a.espncdn.com/i/leaguelogos/soccer/500/22.png",
  "Brasileirao": "https://a.espncdn.com/i/leaguelogos/soccer/500/85.png",
  "Argentine Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/1.png",
  "Belgian Pro League": "https://a.espncdn.com/i/leaguelogos/soccer/500/144.png",
  "Swiss Super League": "https://a.espncdn.com/i/leaguelogos/soccer/500/26.png",
  "Austrian Bundesliga": "https://a.espncdn.com/i/leaguelogos/soccer/500/55.png",
  "Danish Superliga": "https://a.espncdn.com/i/leaguelogos/soccer/500/59.png",
  "Copa Libertadores": "https://a.espncdn.com/i/leaguelogos/soccer/500/13.png",
  "Copa Sudamericana": "https://a.espncdn.com/i/leaguelogos/soccer/500/14.png",
  // Basketball
  "NBA": "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  "WNBA": "https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png",
  "NCAAM": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAAW": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Mens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Womens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  // Hockey
  "NHL": "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  // Baseball
  "MLB": "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
  // Football (American)
  "NFL": "https://a.espncdn.com/i/teamlogos/leagues/500/nfl.png",
  "NCAAF": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football.png",
  "NCAA Football": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-football.png",
};

/**
 * Resolve a league logo URL. Prefers the API-provided URL, falls back to the
 * static map keyed by league name or short_name.
 */
export function getLeagueLogo(name: string, apiLogoUrl?: string | null): string | null {
  if (apiLogoUrl) return apiLogoUrl;
  return LEAGUE_LOGOS[name] || null;
}
