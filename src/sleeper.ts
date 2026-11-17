import {
  getPlayerIndex,
  normalizeTeam,
  scoreStatLine,
  type FutureWeekProjectionFeed,
  type SleeperPlayer,
} from './rosterProjections'

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
  taxi?: string[] | null
  reserve?: string[] | null
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
  projected_points?: number
  custom_points?: number | null
  starters?: string[]
  starters_points?: number[]
  players?: string[]
  players_points?: Record<string, number>
}

interface SleeperProjectionItem {
  player_id: string
  team?: string | null
  stats?: Record<string, number>
}

interface EspnScoreboard {
  week?: {
    teamsOnBye?: Array<{ abbreviation?: string }>
  }
  events?: Array<{
    competitions?: Array<{
      competitors?: Array<{ team?: { abbreviation?: string } }>
      status?: { period?: number; displayClock?: string; type?: { state?: 'pre' | 'in' | 'post' } }
    }>
  }>
}

function parseClockSeconds(displayClock?: string): number {
  if (!displayClock) return 900
  const m = displayClock.trim().match(/^(\d+):(\d{2})$/)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  return 900
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

export interface UserLeagueSummary {
  league_id: string
  name: string
  season: string
  total_rosters: number
  status: string
  isDynasty: boolean
  hasMedian: boolean
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
  players?: Record<string, SleeperPlayer>
  futureWeekProjections?: Record<number, FutureWeekProjectionFeed>
  lastUpdated: number
}

const SLEEPER_API = 'https://api.sleeper.app/v1'

async function getJson<T>(url: string, signal?: AbortSignal, notFoundMessage?: string): Promise<T> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    if (response.status === 404 && notFoundMessage) {
      throw new Error(notFoundMessage)
    }
    throw new Error(`Request failed (${response.status}): ${url}`)
  }
  return response.json() as Promise<T>
}

export async function fetchUserLeagues(usernameOrId: string, signal?: AbortSignal): Promise<UserLeagueSummary[]> {
  const cleaned = usernameOrId.trim().replace(/^@+/, '').trim()
  if (!cleaned) return []

  const user = await getJson<{ user_id?: string; display_name?: string } | null>(
    `${SLEEPER_API}/user/${encodeURIComponent(cleaned)}`,
    signal,
    `Sleeper user "${cleaned}" not found.`,
  )
  if (!user?.user_id) {
    throw new Error(`Sleeper user "${cleaned}" not found.`)
  }

  const nflState = await getJson<NflState>(`${SLEEPER_API}/state/nfl`, signal)
  const season = nflState.league_season || nflState.season || String(new Date().getFullYear())
  const leagues = await getJson<SleeperLeague[]>(
    `${SLEEPER_API}/user/${user.user_id}/leagues/nfl/${season}`,
    signal,
  )

  return (leagues ?? [])
    .filter((league) => league.status === 'in_season' || league.status === 'complete')
    .map((league) => ({
      league_id: league.league_id,
      name: league.name,
      season: league.season || season,
      total_rosters: league.total_rosters,
      status: league.status,
      isDynasty: Number(league.settings?.type) === 2,
      hasMedian: Number(league.settings?.league_average_match) === 1,
    }))
    .sort(
      (a, b) =>
        Number(b.status === 'in_season') - Number(a.status === 'in_season') ||
        Number(b.isDynasty) - Number(a.isDynasty) ||
        a.name.localeCompare(b.name),
    )
}

export async function loadLeagueData(leagueId: string, signal?: AbortSignal): Promise<LeagueData> {
  const cleanId = leagueId.trim()
  if (!cleanId) throw new Error('Please enter a Sleeper League ID or @username.')

  const [league, rosters, users, nflState] = await Promise.all([
    getJson<SleeperLeague>(`${SLEEPER_API}/league/${cleanId}`, signal, 'Sleeper league not found. Please verify the League ID.'),
    getJson<SleeperRoster[]>(`${SLEEPER_API}/league/${cleanId}/rosters`, signal),
    getJson<SleeperUser[]>(`${SLEEPER_API}/league/${cleanId}/users`, signal),
    getJson<NflState>(`${SLEEPER_API}/state/nfl`, signal),
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

  // Fetch matchup data for all weeks up to regularSeasonWeeks (to support complete What-If simulation)
  const targetEndWeek = Math.min(18, Math.max(regularSeasonWeeks, currentWeek, lastScoredWeek, 1))
  const weekNumbers = Array.from({ length: targetEndWeek }, (_, i) => i + 1)

  const catchNonAbort = <T,>(fallback: T) => (err: unknown): T => {
    if (signal?.aborted) throw err
    return fallback
  }

  const weekResults = await Promise.all(
    weekNumbers.map(async (week) => {
      const matchups = await getJson<SleeperMatchup[]>(
        `${SLEEPER_API}/league/${cleanId}/matchups/${week}`,
        signal,
      ).catch(catchNonAbort<SleeperMatchup[]>([]))
      return { week, matchups }
    }),
  )

  const weeks: Record<number, WeekMatchupFeed> = {}
  for (const feed of weekResults) {
    weeks[feed.week] = feed
  }

  // Enrich any in-progress regular season week with live projected final points
  if (currentWeek > lastScoredWeek && weeks[currentWeek]?.matchups?.length) {
    try {
      const season = league.season
      const scoring = league.scoring_settings || {}
      const [projItems, weekStats, scoreboard] = await Promise.all([
        getJson<SleeperProjectionItem[]>(
          `https://api.sleeper.com/projections/nfl/${season}/${currentWeek}?season_type=regular`,
          signal,
        ).catch(catchNonAbort<SleeperProjectionItem[]>([])),
        getJson<Record<string, Record<string, number>>>(
          `${SLEEPER_API}/stats/nfl/regular/${season}/${currentWeek}?season_type=regular`,
          signal,
        ).catch(catchNonAbort<Record<string, Record<string, number>>>({})),
        getJson<EspnScoreboard>(
          `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${currentWeek}&year=${season}`,
          signal,
        ).catch(catchNonAbort<EspnScoreboard | null>(null)),
      ])

      const teamProgress = new Map<string, { state: 'pre' | 'in' | 'post'; progress: number }>()
      for (const ev of scoreboard?.events || []) {
        const comp = ev.competitions?.[0]
        if (!comp) continue
        const state = comp.status?.type?.state || 'pre'
        const period = Number(comp.status?.period) || 1
        const clockSecs = parseClockSeconds(comp.status?.displayClock)
        let progress = 0
        if (state === 'post') {
          progress = 1
        } else if (state === 'in') {
          const elapsedInPeriod = Math.max(0, Math.min(900, 900 - clockSecs))
          const totalElapsed = Math.min(3600, (Math.min(4, period) - 1) * 900 + elapsedInPeriod)
          progress = Math.max(0, Math.min(1, totalElapsed / 3600))
        }
        for (const c of comp.competitors || []) {
          const abbr = normalizeTeam(c.team?.abbreviation)
          if (abbr) teamProgress.set(abbr, { state, progress })
        }
      }

      const projByPlayer = new Map<string, { team?: string; projPts: number }>()
      for (const item of projItems) {
        if (!item?.player_id) continue
        projByPlayer.set(item.player_id, {
          team: item.team || undefined,
          projPts: scoreStatLine(item.stats, scoring),
        })
      }

      for (const m of weeks[currentWeek].matchups) {
        const actualTotal =
          typeof m.custom_points === 'number' && Number.isFinite(m.custom_points)
            ? m.custom_points
            : Number(m.points) || 0
        const starters = m.starters || []
        let remainingProj = 0

        for (let idx = 0; idx < starters.length; idx++) {
          const pid = starters[idx]
          if (!pid || pid === '0') continue
          const projInfo = projByPlayer.get(pid)
          const pregameProj = projInfo?.projPts ?? 0
          if (pregameProj <= 0) continue

          const st = weekStats[pid]
          const hasPlayed =
            st != null &&
            ((st.gp ?? 0) > 0 ||
              (st.gms_active ?? 0) > 0 ||
              (st.tm_off_snp ?? 0) > 0 ||
              (st.tm_def_snp ?? 0) > 0 ||
              (st.tm_st_snp ?? 0) > 0)
          const starterActual =
            m.players_points?.[pid] ?? m.starters_points?.[idx] ?? 0
          const gameInfo = projInfo?.team ? teamProgress.get(projInfo.team) : undefined

          if (gameInfo?.state === 'post') {
            continue
          } else if (gameInfo?.state === 'in') {
            remainingProj += pregameProj * (1 - gameInfo.progress)
          } else if (gameInfo?.state === 'pre') {
            remainingProj += pregameProj
          } else if (!hasPlayed && starterActual === 0) {
            remainingProj += pregameProj
          }
        }

        m.projected_points = Math.round((actualTotal + remainingProj) * 100) / 100
      }
    } catch {
      // Fallback to raw points if live projection fetch fails
    }
  }

  // Fetch player index + future-week Sleeper projections & ESPN bye teams for roster-based simulation
  const futureWeekProjections: Record<number, FutureWeekProjectionFeed> = {}
  let players: Record<string, SleeperPlayer> | undefined
  const projectionStartWeek = Math.max(1, lastScoredWeek + 1)
  if (projectionStartWeek <= regularSeasonWeeks) {
    const futureWeeks = Array.from(
      { length: regularSeasonWeeks - projectionStartWeek + 1 },
      (_, idx) => projectionStartWeek + idx,
    )
    const [playerMap, ...weekFeeds] = await Promise.all([
      getPlayerIndex(signal).catch(catchNonAbort<Record<string, SleeperPlayer> | undefined>(undefined)),
      ...futureWeeks.map(async (week) => {
        const [proj, sb] = await Promise.all([
          getJson<Record<string, Record<string, number>>>(
            `${SLEEPER_API}/projections/nfl/regular/${league.season}/${week}?season_type=regular`,
            signal,
          ).catch(catchNonAbort<Record<string, Record<string, number>>>({})),
          getJson<EspnScoreboard>(
            `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?seasontype=2&week=${week}&year=${league.season}`,
            signal,
          ).catch(catchNonAbort<EspnScoreboard | null>(null)),
        ])
        const byes = (sb?.week?.teamsOnBye ?? [])
          .map((t) => normalizeTeam(t.abbreviation))
          .filter((abbr): abbr is string => Boolean(abbr))
        return { week, projections: proj ?? {}, byes }
      }),
    ])
    players = playerMap
    for (const feed of weekFeeds) {
      futureWeekProjections[feed.week] = feed
    }
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
    players,
    futureWeekProjections,
    lastUpdated: Date.now(),
  }
}
