/** Map league short_name to ESPN/CDN logo URLs. */
const LEAGUE_LOGOS: Record<string, string> = {
  // Soccer — Top leagues
  "Premier League": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  "La Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  "Bundesliga": "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  "Serie A": "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  "Ligue 1": "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png",
  "Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "MLS": "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png",
  // Soccer — New leagues
  "Europa League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2310.png",
  "Conference League": "https://a.espncdn.com/i/leaguelogos/soccer/500/20001.png",
  "Championship": "https://a.espncdn.com/i/leaguelogos/soccer/500/24.png",
  "FA Cup": "https://a.espncdn.com/i/leaguelogos/soccer/500/34.png",
  "EFL Cup": "https://a.espncdn.com/i/leaguelogos/soccer/500/35.png",
  "Eredivisie": "https://a.espncdn.com/i/leaguelogos/soccer/500/11.png",
  "Liga Portugal": "https://a.espncdn.com/i/leaguelogos/soccer/500/14.png",
  "Turkish Super Lig": "https://a.espncdn.com/i/leaguelogos/soccer/500/18.png",
  "Scottish Premiership": "https://a.espncdn.com/i/leaguelogos/soccer/500/29.png",
  "Saudi Pro League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2369.png",
  // Basketball
  "NBA": "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
  "NCAAM": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAAW": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Mens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Womens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "WNBA": "https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png",
  // Hockey & Baseball
  "NHL": "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  "MLB": "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
};

export function getLeagueLogo(name: string): string | null {
  return LEAGUE_LOGOS[name] || null;
}