/** Map league short_name to ESPN/CDN logo URLs. */
const LEAGUE_LOGOS: Record<string, string> = {
  "Premier League": "https://a.espncdn.com/i/leaguelogos/soccer/500/23.png",
  "La Liga": "https://a.espncdn.com/i/leaguelogos/soccer/500/15.png",
  "Bundesliga": "https://a.espncdn.com/i/leaguelogos/soccer/500/10.png",
  "Serie A": "https://a.espncdn.com/i/leaguelogos/soccer/500/12.png",
  "Ligue 1": "https://a.espncdn.com/i/leaguelogos/soccer/500/9.png",
  "Champions League": "https://a.espncdn.com/i/leaguelogos/soccer/500/2.png",
  "MLS": "https://a.espncdn.com/i/leaguelogos/soccer/500/19.png",
  "NBA": "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png",
 "NCAAM": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAAW": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Mens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "NCAA Womens Basketball": "https://a.espncdn.com/redesign/assets/img/icons/ESPN-icon-basketball.png",
  "WNBA": "https://a.espncdn.com/i/teamlogos/leagues/500/wnba.png",
  "NHL": "https://a.espncdn.com/i/teamlogos/leagues/500/nhl.png",
  "MLB": "https://a.espncdn.com/i/teamlogos/leagues/500/mlb.png",
};

export function getLeagueLogo(name: string): string | null {
  return LEAGUE_LOGOS[name] || null;
}