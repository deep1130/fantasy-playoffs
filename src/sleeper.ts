export interface SleeperLeague {
  league_id: string
  name: string
  season: string
  status: string
  total_rosters: number
  settings: Record<string, number | string | null>
  scoring_settings: Record<string, number>
  roster_positions?: string[]
  avatar?: string | null
}

export interface SleeperRoster {
  roster_id: number
  owner_id: string | null
  players: string[] | null
  starters?: string[] | null
  settings: {
    wins?: number
    losses?: number
    ties?: number
    fpts?: number
    fpts_decimal?: number
    fpts_against?: number
    fpts_against_decimal?: number
    ppts?: number
    ppts_decimal?: number
  }
  metadata?: {
    record?: string
    streak?: string
  }
}

export interface SleeperUser {
  user_id: string
  display_name: string
  avatar?: string | null
  metadata?: {
    team_name?: string
    avatar?: string
  }
}

export interface SleeperMatchup {
  roster_id: number
  matchup_id: number | null
  points: number
  custom_points?: number | null
  starters?: string[]
  starters_points?: number[]
  players?: string[]
  players_points?: Record<string, number>
}

export interface NflState {
  week: number
  season: string
  season_type: string
  league_season?: string
  display_week?: number
}

export interface WeekMatchupFeed {
  week: number
  matchups: SleeperMatchup[]
}

export interface LeagueData {
  league: SleeperLeague
  rosters: SleeperRoster[]
  users: SleeperUser[]
  nflState: NflState
  currentWeek: number
  lastScoredWeek: number
  playoffWeekStart: number
  regularSeasonWeeks: number
  hasMedianMatch: boolean
  totalTeams: number
  weeks: Record<number, WeekMatchupFeed>
  lastUpdated: number
}

const SLEEPER_API = 'https://api.sleeper.app/v1'

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Sleeper league not found. Please verify the League ID.`)
    }
    throw new Error(`Request failed (${response.status}): ${url}`)
  }
  return response.json() as Promise<T>
}

export async function loadLeagueData(leagueId: string): Promise<LeagueData> {
  const cleanId = leagueId.trim()
  if (!cleanId) throw new Error('Please enter a Sleeper League ID.')

  const [league, rosters, users, nflState] = await Promise.all([
    getJson<SleeperLeague>(`${SLEEPER_API}/league/${cleanId}`),
    getJson<SleeperRoster[]>(`${SLEEPER_API}/league/${cleanId}/rosters`),
    getJson<SleeperUser[]>(`${SLEEPER_API}/league/${cleanId}/users`),
    getJson<NflState>(`${SLEEPER_API}/state/nfl`),
  ])

  if (!league || !league.league_id) {
    throw new Error('Invalid league payload returned from Sleeper.')
  }

  const currentWeek = Math.min(18, Math.max(1, nflState.week ?? (Number(league.settings.leg) || 1)))
  const rawLastScored = Number(league.settings.last_scored_leg)
  const lastScoredWeek = Number.isFinite(rawLastScored) && rawLastScored >= 0
    ? Math.min(18, rawLastScored)
    : Math.max(0, currentWeek - 1)

  const playoffWeekStart = Number(league.settings.playoff_week_start) || 15
  const regularSeasonWeeks = Math.max(1, playoffWeekStart - 1)
  const hasMedianMatch = Number(league.settings.league_average_match) === 1
  const totalTeams = rosters.length || Number(league.total_rosters) || 12

  // Fetch matchup data for all weeks up to max(currentWeek, lastScoredWeek, regularSeasonWeeks)
  // Fetching up to currentWeek gets all completed and current matchups!
  const targetEndWeek = Math.min(regularSeasonWeeks, Math.max(currentWeek, lastScoredWeek, 1))
  const weekNumbers = Array.from({ length: targetEndWeek }, (_, i) => i + 1)

  const weekResults = await Promise.all(
    weekNumbers.map(async (week) => {
      const matchups = await getJson<SleeperMatchup[]>(
        `${SLEEPER_API}/league/${cleanId}/matchups/${week}`,
      ).catch(() => [])
      return { week, matchups }
    }),
  )

  const weeks: Record<number, WeekMatchupFeed> = {}
  for (const feed of weekResults) {
    weeks[feed.week] = feed
  }

  return {
    league,
    rosters,
    users,
    nflState,
    currentWeek,
    lastScoredWeek,
    playoffWeekStart,
    regularSeasonWeeks,
    hasMedianMatch,
    totalTeams,
    weeks,
    lastUpdated: Date.now(),
  }
}
