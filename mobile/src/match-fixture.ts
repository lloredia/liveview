import type {
  LeaderLine,
  LastPlay,
  MatchDetailResponse,
  PeriodScore,
  Team,
  WinProbability,
} from "./api";

/**
 * Opt-in canonical PHI vs BOS demo fixture.
 *
 * Set `EXPO_PUBLIC_USE_FIXTURE_GAME=1` (then reload Metro) to render the
 * fixture demo regardless of which `gameId` was routed to. With the flag
 * unset — including default in dev — the screen renders purely from real
 * backend data and the empty-state rules in the screen take over.
 *
 * When enabled, fully replaces both team objects, scores, period scores,
 * possession, attendance, broadcast, win probability, leaders, and last
 * play. The match's `id` field is preserved so favorites/tracking still
 * target a real team row.
 */
export function isFixtureEnabled(): boolean {
  return process.env.EXPO_PUBLIC_USE_FIXTURE_GAME === "1";
}

export function applyDevFixture(detail: MatchDetailResponse): MatchDetailResponse {
  if (!isFixtureEnabled()) return detail;

  const homeTeam: Team = {
    id: detail.match.home_team.id, // preserve id so favorites/tracking still target a real team
    name: "Boston Celtics",
    short_name: "BOS",
    logo_url: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
    record: "52-30",
    standing: "2nd East",
    color_primary: "#007A33",
  };

  const awayTeam: Team = {
    id: detail.match.away_team.id,
    name: "Philadelphia 76ers",
    short_name: "PHI",
    logo_url: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png",
    record: "24-58",
    standing: "15th East",
    color_primary: "#ED174C",
  };

  // Period scores — column "home" matches BOS row, column "away" matches PHI row.
  const periodScores: PeriodScore[] = [
    { period: "1Q", home: 18, away: 12 },
    { period: "2Q", home: 7, away: 4 },
  ];

  const winProbability: WinProbability = {
    home: 78,
    away: 22,
    delta_last_play: 4,
  };

  const homeLeader: LeaderLine = {
    initials: "JT",
    name: "J. Tatum",
    position: "Forward",
    jersey: "0",
    pts: 11,
    reb: 3,
    ast: 1,
  };

  const awayLeader: LeaderLine = {
    initials: "TM",
    name: "T. Maxey",
    position: "Guard",
    jersey: "0",
    pts: 8,
    reb: 2,
    ast: 3,
  };

  const lastPlay: LastPlay = {
    team: "home", // J. Tatum is on BOS = home
    text: "J. Tatum makes 3-pt jumper",
    seconds_ago: 32,
    points: 3,
    distance_ft: 25,
  };

  return {
    ...detail,
    match: {
      ...detail.match,
      home_team: homeTeam,
      away_team: awayTeam,
      score: { ...detail.match.score, home: 25, away: 16 },
      possession: "home",
      attendance: 18247,
      broadcast: "NBA TV",
      venue: "Xfinity Mobile Arena",
      period: "Q2",
      clock: "2:15",
      phase: "live",
    },
    state: {
      score_home: 25,
      score_away: 16,
      clock: "2:15",
      period: "Q2",
      period_scores: periodScores,
      version: detail.state?.version ?? 1,
    },
    win_probability: winProbability,
    leaders: { home: homeLeader, away: awayLeader },
    last_play: lastPlay,
  };
}
