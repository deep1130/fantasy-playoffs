import type { LeagueData, SleeperLeague, SleeperMatchup, SleeperRoster, SleeperUser, WeekMatchupFeed } from './sleeper'

export function getDemoLeagueData(): LeagueData {
  const teams = [
    { id: 1, name: 'Deep', owner: 'deep93', h2hW: 7, h2hL: 1, medW: 7, medL: 1, pf: 1255.5, pa: 980.2 },
    { id: 2, name: 'I am Grootball', owner: 'Cheesehead440', h2hW: 6, h2hL: 2, medW: 5, medL: 3, pf: 1193.9, pa: 991.1 },
    { id: 3, name: 'Human Torchdown', owner: 'neusebi', h2hW: 5, h2hL: 3, medW: 5, medL: 3, pf: 1097.0, pa: 1040.5 },
    { id: 4, name: 'I am inevitable', owner: 'Redmitch11', h2hW: 5, h2hL: 3, medW: 5, medL: 3, pf: 1072.6, pa: 1020.4 },
    { id: 5, name: 'We Are Venom', owner: 'MoneyOne7', h2hW: 5, h2hL: 3, medW: 4, medL: 4, pf: 1107.2, pa: 1080.3 },
    { id: 6, name: 'Guardians of the Gridiron', owner: 'BendTheKnee4488', h2hW: 3, h2hL: 5, medW: 5, medL: 3, pf: 1154.1, pa: 1120.0 },
    { id: 7, name: 'Tippy Toe Joe', owner: 'Cardsrun', h2hW: 5, h2hL: 3, medW: 3, medL: 5, pf: 965.8, pa: 1045.2 },
    { id: 8, name: 'Thor: Love and Pitts', owner: 'JohnUrch', h2hW: 3, h2hL: 5, medW: 4, medL: 4, pf: 979.8, pa: 1030.0 },
    { id: 9, name: 'Silver Surfer', owner: 'Jim3rd', h2hW: 2, h2hL: 6, medW: 4, medL: 4, pf: 1033.1, pa: 1110.4 },
    { id: 10, name: 'Grimm’s Griddy Gang', owner: 'Rozzy89', h2hW: 3, h2hL: 5, medW: 3, medL: 5, pf: 960.4, pa: 1095.6 },
    { id: 11, name: 'Red Zone Reeds', owner: 'Tshockwave', h2hW: 2, h2hL: 6, medW: 2, medL: 6, pf: 966.0, pa: 1150.2 },
    { id: 12, name: 'Chimichanga champs', owner: 'turbo39', h2hW: 2, h2hL: 6, medW: 1, medL: 7, pf: 858.1, pa: 1240.0 },
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
      wins: t.h2hW + t.medW,
      losses: t.h2hL + t.medL,
      ties: 0,
      fpts: Math.floor(t.pf),
      fpts_decimal: Math.round((t.pf % 1) * 100),
      fpts_against: Math.floor(t.pa),
      fpts_against_decimal: Math.round((t.pa % 1) * 100),
    },
  }))

  const league: SleeperLeague = {
    league_id: 'demo-median-league',
    name: 'Remember The Tight Ends (Demo)',
    season: '2026',
    status: 'in_season',
    total_rosters: 12,
    settings: {
      playoff_teams: 6,
      playoff_week_start: 15,
      league_average_match: 1,
      leg: 9,
      last_scored_leg: 8,
    },
    scoring_settings: {
      rec: 1,
      bonus_rec_te: 0.5,
      pass_td: 4,
      rush_td: 6,
      rec_td: 6,
    },
  }

  const weeks: Record<number, WeekMatchupFeed> = {}

  for (let w = 1; w <= 8; w += 1) {
    const matchups: SleeperMatchup[] = []
    // Schedule 6 head-to-head pairs
    const teamOrder = [...teams].sort((a, b) => ((a.id * w * 7) % 13) - ((b.id * w * 7) % 13))

    for (let pair = 0; pair < 6; pair += 1) {
      const t1 = teamOrder[pair * 2]
      const t2 = teamOrder[pair * 2 + 1]

      const s1 = Math.round((t1.pf / 8 + (Math.sin(w * 3 + t1.id) * 14)) * 10) / 10
      const s2 = Math.round((t2.pf / 8 + (Math.cos(w * 3 + t2.id) * 14)) * 10) / 10

      matchups.push({
        roster_id: t1.id,
        matchup_id: pair + 1,
        points: s1,
      })
      matchups.push({
        roster_id: t2.id,
        matchup_id: pair + 1,
        points: s2,
      })
    }

    weeks[w] = { week: w, matchups }
  }

  return {
    league,
    rosters,
    users,
    nflState: { week: 9, season: '2026', season_type: 'regular' },
    currentWeek: 9,
    lastScoredWeek: 8,
    playoffWeekStart: 15,
    regularSeasonWeeks: 14,
    hasMedianMatch: true,
    totalTeams: 12,
    weeks,
    lastUpdated: Date.now(),
  }
}
