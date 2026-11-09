import type { LeagueData, SleeperLeague, SleeperRoster, SleeperUser } from './sleeper'

export function getDemoLeagueData(): LeagueData {
  const teams = [
    { id: 1, name: 'Mahomes Magic', owner: 'Alex M.', wins: 16, losses: 4, pf: 1342.6, pa: 1120.4 },
    { id: 2, name: 'CeeDee Lamborghinis', owner: 'Sarah K.', wins: 15, losses: 5, pf: 1298.2, pa: 1140.8 },
    { id: 3, name: 'Bijan Mustard', owner: 'Marcus T.', wins: 13, losses: 7, pf: 1245.5, pa: 1180.2 },
    { id: 4, name: 'Breece Hall of Fame', owner: 'Dave R.', wins: 12, losses: 8, pf: 1210.8, pa: 1195.0 },
    { id: 5, name: 'Amor-Phous Sun Gods', owner: 'Elena B.', wins: 11, losses: 9, pf: 1185.4, pa: 1170.6 },
    { id: 6, name: 'Nacua Business', owner: 'Jordan P.', wins: 10, losses: 10, pf: 1160.0, pa: 1185.3 },
    { id: 7, name: 'Gibbs Me That Ring', owner: 'Chris W.', wins: 9, losses: 11, pf: 1152.1, pa: 1190.4 },
    { id: 8, name: 'Kupp of Joe', owner: 'Sam L.', wins: 9, losses: 11, pf: 1110.8, pa: 1220.5 },
    { id: 9, name: 'Kyren In The Club', owner: 'Taylor D.', wins: 8, losses: 12, pf: 1095.4, pa: 1215.0 },
    { id: 10, name: 'Saquon My Barkley', owner: 'Nick S.', wins: 7, losses: 13, pf: 1080.2, pa: 1235.8 },
    { id: 11, name: 'Stroud 9', owner: 'Brian H.', wins: 6, losses: 14, pf: 1040.5, pa: 1280.1 },
    { id: 12, name: 'Tanking For Caleb', owner: 'Josh V.', wins: 4, losses: 16, pf: 960.3, pa: 1320.0 },
  ]

  const users: SleeperUser[] = teams.map((t) => ({
    user_id: `user_${t.id}`,
    display_name: t.owner,
    metadata: { team_name: t.name },
  }))

  const rosters: SleeperRoster[] = teams.map((t) => ({
    roster_id: t.id,
    owner_id: `user_${t.id}`,
    players: [],
    settings: {
      wins: t.wins,
      losses: t.losses,
      ties: 0,
      fpts: Math.floor(t.pf),
      fpts_decimal: Math.round((t.pf % 1) * 100),
    },
  }))

  const league: SleeperLeague = {
    league_id: 'demo-median-league-2026',
    name: 'Apex Dynasty Invitational (Median Match)',
    season: '2026',
    status: 'in_season',
    total_rosters: 12,
    settings: {
      playoff_teams: 6,
      playoff_week_start: 15,
      league_average_match: 1, // MEDIAN MATCH ACTIVE
      leg: 11,
      last_scored_leg: 10,
    },
    scoring_settings: {
      rec: 1,
      bonus_rec_te: 0.5,
      pass_td: 4,
      rush_td: 6,
      rec_td: 6,
    },
    roster_positions: ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN', 'BN', 'BN'],
  }

  // Generate 10 weeks of historical scores and matchups
  const historicalScores: Record<number, number[]> = {}
  const historicalTeamScores: Record<number, number[]> = {}
  for (const t of teams) {
    historicalTeamScores[t.id] = []
  }

  const weeks: Record<number, any> = {}

  for (let w = 1; w <= 10; w += 1) {
    const weekScores: number[] = []
    const weekMatchups: any[] = []

    // Schedule 6 head-to-head pairs
    // Shift pairs each week
    const teamOrder = [...teams].sort((a, b) => ((a.id * w * 7) % 13) - ((b.id * w * 7) % 13))

    for (let pair = 0; pair < 6; pair += 1) {
      const t1 = teamOrder[pair * 2]
      const t2 = teamOrder[pair * 2 + 1]

      // Weekly score based on team's average PF + random fluctuation
      const s1 = Math.round((t1.pf / 10 + (Math.sin(w + t1.id) * 18)) * 10) / 10
      const s2 = Math.round((t2.pf / 10 + (Math.cos(w + t2.id) * 18)) * 10) / 10

      historicalTeamScores[t1.id].push(s1)
      historicalTeamScores[t2.id].push(s2)
      weekScores.push(s1, s2)

      weekMatchups.push({
        roster_id: t1.id,
        matchup_id: pair + 1,
        points: s1,
        players_points: {},
      })
      weekMatchups.push({
        roster_id: t2.id,
        matchup_id: pair + 1,
        points: s2,
        players_points: {},
      })
    }

    historicalScores[w] = weekScores
    weeks[w] = {
      matchups: weekMatchups,
      projections: {},
      byes: [],
      gameStates: {},
      gameProgress: {},
    }
  }

  return {
    league,
    rosters,
    users,
    players: {},
    tradedPicks: [],
    winnersBracket: [],
    currentWeek: 11,
    lastScoredWeek: 10,
    weeks,
    historicalScores,
    historicalMaxPf: {},
    historicalTeamScores,
    historicalPlayerPoints: {},
    lastUpdated: Date.now(),
  }
}
