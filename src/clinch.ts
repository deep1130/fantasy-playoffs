import type { LeagueData, SleeperMatchup, SleeperRoster } from './sleeper'

export type ClinchStatus =
  | 'CLINCHED_BYE'
  | 'CLINCHED_PLAYOFF'
  | 'BYE_FAVORITE'
  | 'IN_CONTROL'
  | 'IN_THE_HUNT'
  | 'ON_THE_BUBBLE'
  | 'WORK_TO_DO'
  | 'ELIMINATED'

export interface WeeklyScoreDetail {
  week: number
  points: number
  opponentRosterId: number | null
  opponentPoints: number | null
  h2hResult: 'W' | 'L' | 'T' | 'BYE'
  medianScore: number
  medianResult: 'W' | 'L' | 'T' | null
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
}

export interface TeamClinchProfile {
  rosterId: number
  name: string
  ownerDisplayName: string
  avatarUrl: string | null
  seed: number

  // Record Breakdown
  totalWins: number
  totalLosses: number
  totalTies: number
  winPercentage: number

  h2hWins: number
  h2hLosses: number
  h2hTies: number

  medianWins: number
  medianLosses: number
  medianTies: number
  medianWinPct: number

  // Scoring
  pointsFor: number
  pointsAgainst: number
  pointsPerGame: number

  // Expected Wins & Schedule Luck
  expectedWins: number
  expectedLosses: number
  scheduleLuck: number
  allPlayPercentage: number

  // Playoff & Clinch Metrics
  status: ClinchStatus
  statusLabel: string
  clinchMeter: number // 0 to 100% progress toward playoff lock

  // BYE CLINCH METRICS (Seed 1 & 2 First-Round Bye)
  hasClinchedBye: boolean
  isEliminatedFromBye: boolean
  byeMagicNumber: number | null // null if locked or eliminated from bye
  byeEliminationNumber: number | null
  byeProbability: number // 0.0 to 1.0
  byeMeter: number // 0 to 100% progress toward bye lock
  gamesBehindBye: number

  // PLAYOFF CLINCH METRICS (Seed 1-6 Postseason Spot)
  hasClinchedPlayoff: boolean
  isEliminatedFromPlayoffs: boolean
  magicNumber: number | null // magic number for playoff spot (Seed K)
  eliminationNumber: number | null // elimination number for playoff spot
  playoffProbability: number // 0.0 to 1.0
  gamesBehindCutoff: number

  maxPossibleWins: number
  minPossibleWins: number

  // Scenarios and Clinch Path
  clinchThisWeekScenarios: string[]
  clinchByeThisWeekScenarios: string[]
  eliminatedThisWeekScenarios: string[]
  magicNumberExplanation: string
  byeExplanation: string
  fastestPlayoffClinchWeek: number | null
  fastestByeClinchWeek: number | null
  fastestPlayoffElimWeek: number | null
  fastestByeElimWeek: number | null
  weekImpactScenarios: string[]
  upcomingOpponents: { week: number; opponentRosterId: number; opponentName: string }[]

  // Weekly breakdown
  weeklyDetails: WeeklyScoreDetail[]
}

export interface LeagueClinchSummary {
  leagueId: string
  leagueName: string
  season: string
  currentWeek: number
  lastScoredWeek: number
  inProgressWeek: number | null
  isUsingLiveWeek: boolean
  weeksAvailable: number[]
  finalizedWeeks: number[]
  regularSeasonEnd: number
  remainingWeeks: number
  totalTeams: number
  playoffSpots: number
  byeSpots: number
  hasMedianMatch: boolean
  gamesPerWeek: number
  remainingGamesPerTeam: number

  // Status counts
  clinchedCount: number
  clinchedByeCount: number
  bubbleCount: number
  eliminatedCount: number

  // Standings
  teams: TeamClinchProfile[]

  // Weekly league median benchmarks
  weeklyMedians: Record<number, number>
}

export interface ClinchOptions {
  includeInProgress?: boolean
}

export function calculateMedian(scores: readonly number[]): number {
  if (scores.length === 0) return 0
  const sorted = [...scores].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

export function getTeamName(data: LeagueData, rosterId: number): string {
  const roster = data.rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return `Team ${rosterId}`
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  return user?.metadata?.team_name?.trim() || user?.display_name?.trim() || `Team ${rosterId}`
}

export function getUserDisplayName(data: LeagueData, rosterId: number): string {
  const roster = data.rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return `Manager ${rosterId}`
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  return user?.display_name?.trim() || `Manager ${rosterId}`
}

export function getAvatarUrl(data: LeagueData, rosterId: number): string | null {
  const roster = data.rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return null
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  if (!user) return null
  const custom = user.metadata?.avatar
  if (custom && custom.trim()) {
    if (custom.startsWith('http://') || custom.startsWith('https://')) return custom.trim()
    return `https://sleepercdn.com/avatars/thumbs/${custom.trim()}`
  }
  if (user.avatar && user.avatar.trim()) {
    if (user.avatar.startsWith('http://') || user.avatar.startsWith('https://')) return user.avatar.trim()
    return `https://sleepercdn.com/avatars/thumbs/${user.avatar.trim()}`
  }
  return null
}

export function analyzeLeagueClinch(
  data: LeagueData,
  options?: ClinchOptions,
): LeagueClinchSummary {
  const totalTeams = data.rosters.length || 12
  // ALWAYS use median if the league has league_average_match enabled in its settings
  const hasMedianMatch = Number(data.league.settings.league_average_match) === 1
  const gamesPerWeek = hasMedianMatch ? 2 : 1
  const playoffSpots = Math.min(totalTeams, Math.max(1, Number(data.league.settings.playoff_teams) || 6))
  const byeSpots = playoffSpots >= 6 ? 2 : playoffSpots >= 4 ? 0 : 0
  const playoffStart = Number(data.league.settings.playoff_week_start) || 15
  const regularSeasonEnd = Math.min(18, Math.max(1, playoffStart - 1))
  const currentWeek = Math.min(18, Math.max(1, data.currentWeek || 1))

  // Determine all available scored weeks
  const availableWeeks = Object.keys(data.weeks)
    .map(Number)
    .filter((w) => w >= 1 && w <= regularSeasonEnd)
    .sort((a, b) => a - b)

  const allScoredWeeks = availableWeeks.filter((w) => {
    const feed = data.weeks[w]
    if (!feed || !feed.matchups || feed.matchups.length === 0) return false
    return feed.matchups.some((m) => (m.points ?? 0) > 0 || (m.custom_points ?? 0) > 0)
  })

  const rawLastScored = Number(data.league.settings.last_scored_leg)
  const lastScoredWeek = Number.isFinite(rawLastScored) && rawLastScored >= 0
    ? Math.min(regularSeasonEnd, rawLastScored)
    : Math.max(0, currentWeek - 1)

  const finalizedWeeks = allScoredWeeks.filter((w) => w <= lastScoredWeek)
  const inProgressWeek = allScoredWeeks.find((w) => w > lastScoredWeek) ?? null

  const includeInProgress = options?.includeInProgress ?? false
  let seasonWeeks: number[]
  let isUsingLiveWeek = false

  if (includeInProgress && inProgressWeek != null) {
    seasonWeeks = allScoredWeeks
    isUsingLiveWeek = true
  } else if (finalizedWeeks.length > 0) {
    seasonWeeks = finalizedWeeks
    isUsingLiveWeek = false
  } else {
    seasonWeeks = allScoredWeeks
    isUsingLiveWeek = inProgressWeek != null
  }

  const effectiveCompletedWeeks = seasonWeeks.length > 0 ? Math.max(...seasonWeeks) : lastScoredWeek
  const remainingWeeks = Math.max(0, regularSeasonEnd - effectiveCompletedWeeks)
  const remainingGamesPerTeam = remainingWeeks * gamesPerWeek

  interface Accumulator {
    roster: SleeperRoster
    name: string
    ownerName: string
    avatarUrl: string | null
    h2hWins: number
    h2hLosses: number
    h2hTies: number
    medianWins: number
    medianLosses: number
    medianTies: number
    pointsFor: number
    pointsAgainst: number
    expectedWins: number
    weeklyDetails: WeeklyScoreDetail[]
  }

  const accumulators = new Map<number, Accumulator>()
  for (const roster of data.rosters) {
    accumulators.set(roster.roster_id, {
      roster,
      name: getTeamName(data, roster.roster_id),
      ownerName: getUserDisplayName(data, roster.roster_id),
      avatarUrl: getAvatarUrl(data, roster.roster_id),
      h2hWins: 0,
      h2hLosses: 0,
      h2hTies: 0,
      medianWins: 0,
      medianLosses: 0,
      medianTies: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      expectedWins: 0,
      weeklyDetails: [],
    })
  }

  const weeklyMedians: Record<number, number> = {}

  // Process all active season weeks (either finalized weeks or including in-progress week)
  for (const week of seasonWeeks) {
    const weekFeed = data.weeks[week]
    const matchups: SleeperMatchup[] = weekFeed?.matchups || []

    const weekScores: { rosterId: number; points: number; matchupId: number | null }[] = []

    for (const roster of data.rosters) {
      const matchup = matchups.find((m) => m.roster_id === roster.roster_id)
      let pts = 0
      if (matchup) {
        if (
          week > data.lastScoredWeek &&
          typeof matchup.projected_points === 'number' &&
          Number.isFinite(matchup.projected_points)
        ) {
          pts = matchup.projected_points
        } else {
          pts =
            typeof matchup.custom_points === 'number' && Number.isFinite(matchup.custom_points)
              ? matchup.custom_points
              : Number(matchup.points) || 0
        }
      }
      weekScores.push({ rosterId: roster.roster_id, points: pts, matchupId: matchup?.matchup_id ?? null })
    }

    // Exact median calculation for this week
    const scoreValues = weekScores.map((s) => s.points)
    const weekMedian = calculateMedian(scoreValues)
    weeklyMedians[week] = weekMedian

    // Matchup pairings
    const matchupPairs = new Map<number, typeof weekScores>()
    for (const item of weekScores) {
      if (item.matchupId != null) {
        const list = matchupPairs.get(item.matchupId) || []
        list.push(item)
        matchupPairs.set(item.matchupId, list)
      }
    }

    // Evaluate each roster in this week
    for (const item of weekScores) {
      const acc = accumulators.get(item.rosterId)!
      const teamScore = item.points
      acc.pointsFor += teamScore

      // 1. Head-to-Head result
      let oppRosterId: number | null = null
      let oppPoints: number | null = null
      let h2hResult: 'W' | 'L' | 'T' | 'BYE' = 'BYE'

      if (item.matchupId != null) {
        const pair = matchupPairs.get(item.matchupId) || []
        const opp = pair.find((p) => p.rosterId !== item.rosterId)
        if (opp) {
          oppRosterId = opp.rosterId
          oppPoints = opp.points
          acc.pointsAgainst += oppPoints

          if (Math.abs(teamScore - oppPoints) < 0.005) {
            h2hResult = 'T'
            acc.h2hTies += 1
          } else if (teamScore > oppPoints) {
            h2hResult = 'W'
            acc.h2hWins += 1
          } else {
            h2hResult = 'L'
            acc.h2hLosses += 1
          }
        }
      }

      // 2. League Median result (top half wins, bottom half loses)
      let medianResult: 'W' | 'L' | 'T' | null = null
      if (weekScores.length >= 2) {
        if (Math.abs(teamScore - weekMedian) < 0.005) {
          medianResult = 'T'
          acc.medianTies += 1
        } else if (teamScore > weekMedian) {
          medianResult = 'W'
          acc.medianWins += 1
        } else {
          medianResult = 'L'
          acc.medianLosses += 1
        }
      }

      // 3. All-Play Expected Wins
      let allPlayBeaten = 0
      let allPlayTies = 0
      const otherScores = scoreValues.filter((_, idx) => idx !== scoreValues.indexOf(teamScore))
      for (const s of otherScores) {
        if (Math.abs(teamScore - s) < 0.005) allPlayTies += 1
        else if (teamScore > s) allPlayBeaten += 1
      }
      const otherCount = Math.max(1, otherScores.length)
      const weeklyAllPlayWins = (allPlayBeaten + allPlayTies * 0.5) / otherCount
      acc.expectedWins += weeklyAllPlayWins

      acc.weeklyDetails.push({
        week,
        points: teamScore,
        opponentRosterId: oppRosterId,
        opponentPoints: oppPoints,
        h2hResult,
        medianScore: weekMedian,
        medianResult,
        allPlayWins: allPlayBeaten,
        allPlayLosses: otherCount - allPlayBeaten - allPlayTies,
        allPlayTies,
      })
    }
  }

  // Official Sleeper points for master accuracy (when using official finalized weeks)
  if (!isUsingLiveWeek) {
    for (const roster of data.rosters) {
      const acc = accumulators.get(roster.roster_id)!
      const sleeperFpts = (roster.settings.fpts ?? 0) + (roster.settings.fpts_decimal ? roster.settings.fpts_decimal / 100 : 0)
      if (sleeperFpts > 0) {
        acc.pointsFor = sleeperFpts
      }
      const sleeperPa = (roster.settings.fpts_against ?? 0) + (roster.settings.fpts_against_decimal ? roster.settings.fpts_against_decimal / 100 : 0)
      if (sleeperPa > 0) {
        acc.pointsAgainst = sleeperPa
      }
    }
  }

  // Compute standings & seeds
  const sortedTeams = [...data.rosters].map((roster) => {
    const acc = accumulators.get(roster.roster_id)!
    const totalWins = hasMedianMatch ? (acc.h2hWins + acc.medianWins) : acc.h2hWins
    const totalLosses = hasMedianMatch ? (acc.h2hLosses + acc.medianLosses) : acc.h2hLosses
    const totalTies = hasMedianMatch ? (acc.h2hTies + acc.medianTies) : acc.h2hTies
    const effectiveWins = totalWins + totalTies * 0.5
    const totalGames = Math.max(1, totalWins + totalLosses + totalTies)
    const winPercentage = effectiveWins / totalGames

    return {
      acc,
      rosterId: roster.roster_id,
      totalWins,
      totalLosses,
      totalTies,
      effectiveWins,
      winPercentage,
      pointsFor: acc.pointsFor,
      pointsAgainst: acc.pointsAgainst,
    }
  }).sort((a, b) => {
    if (b.effectiveWins !== a.effectiveWins) return b.effectiveWins - a.effectiveWins
    return b.pointsFor - a.pointsFor
  })

  // Cutoff & Chaser Teams for Playoffs (Seed K vs Seed K+1)
  const cutoffIndex = playoffSpots - 1
  const cutoffTeam = sortedTeams[cutoffIndex] // Seed 6
  const chaserTeam = sortedTeams[playoffSpots] // Seed 7

  // Cutoff & Chaser Teams for First-Round Bye (Seed 2 vs Seed 3)
  const byeCutoffTeam = byeSpots > 0 ? sortedTeams[byeSpots - 1] : null // Seed 2
  const byeChaserTeam = byeSpots > 0 ? sortedTeams[byeSpots] : null // Seed 3

  const profiles: TeamClinchProfile[] = sortedTeams.map((entry, index) => {
    const seed = index + 1
    const { acc, totalWins, totalLosses, totalTies, effectiveWins, winPercentage, pointsFor, pointsAgainst } = entry
    const maxPossibleWins = effectiveWins + remainingGamesPerTeam
    const minPossibleWins = effectiveWins

    // Expected Wins calculation
    const scaledExpectedWins = acc.expectedWins * gamesPerWeek
    const totalGames = Math.max(1, totalWins + totalLosses + totalTies)
    const expectedLosses = Math.max(0, totalGames - scaledExpectedWins)
    const scheduleLuck = totalWins - scaledExpectedWins
    const allPlayPercentage = effectiveCompletedWeeks > 0 ? acc.expectedWins / effectiveCompletedWeeks : 0.5
    const medianGames = acc.medianWins + acc.medianLosses + acc.medianTies
    const medianWinPct = medianGames > 0 ? acc.medianWins / medianGames : 0.5

    // -------------------------------------------------------------
    // PLAYOFF CLINCH LOGIC (Top 6)
    // -------------------------------------------------------------
    let teamsThatCanSurpass = 0
    for (const other of sortedTeams) {
      if (other.rosterId === entry.rosterId) continue
      const otherMax = other.effectiveWins + remainingGamesPerTeam
      if (otherMax > effectiveWins || (otherMax === effectiveWins && other.pointsFor >= pointsFor)) {
        teamsThatCanSurpass += 1
      }
    }
    const hasClinchedPlayoff = teamsThatCanSurpass < playoffSpots

    const isEliminatedFromPlayoffs = cutoffTeam
      ? (maxPossibleWins < cutoffTeam.effectiveWins || (maxPossibleWins === cutoffTeam.effectiveWins && pointsFor < cutoffTeam.pointsFor))
      : false

    // Magic Number for Playoff (Seed K) - Only for teams inside playoff cutoff
    let magicNumber: number | null = null
    if (hasClinchedPlayoff) {
      magicNumber = 0
    } else if (isEliminatedFromPlayoffs || seed > playoffSpots) {
      magicNumber = null
    } else if (chaserTeam) {
      const chaserMax = chaserTeam.effectiveWins + remainingGamesPerTeam
      magicNumber = Math.max(1, Math.ceil(chaserMax + 1 - effectiveWins))
    }

    // Elimination Number for Playoff (Seed K) - Only for teams outside playoff cutoff
    let eliminationNumber: number | null = null
    if (hasClinchedPlayoff || seed <= playoffSpots) {
      eliminationNumber = null
    } else if (isEliminatedFromPlayoffs) {
      eliminationNumber = 0
    } else if (cutoffTeam) {
      eliminationNumber = Math.max(1, Math.ceil(maxPossibleWins + 1 - cutoffTeam.effectiveWins))
    }

    const gamesBehindCutoff = cutoffTeam ? cutoffTeam.effectiveWins - effectiveWins : 0

    // -------------------------------------------------------------
    // FIRST-ROUND BYE CLINCH LOGIC (Top 2)
    // -------------------------------------------------------------
    let teamsThatCanSurpassForBye = 0
    if (byeSpots > 0) {
      for (const other of sortedTeams) {
        if (other.rosterId === entry.rosterId) continue
        const otherMax = other.effectiveWins + remainingGamesPerTeam
        if (otherMax > effectiveWins || (otherMax === effectiveWins && other.pointsFor >= pointsFor)) {
          teamsThatCanSurpassForBye += 1
        }
      }
    }
    const hasClinchedBye = byeSpots > 0 && teamsThatCanSurpassForBye < byeSpots

    const isEliminatedFromBye = byeSpots > 0 && byeCutoffTeam
      ? (maxPossibleWins < byeCutoffTeam.effectiveWins || (maxPossibleWins === byeCutoffTeam.effectiveWins && pointsFor < byeCutoffTeam.pointsFor))
      : true

    // Magic Number for Bye (Seed 1 & 2 vs Seed 3) - Only for teams in top B
    let byeMagicNumber: number | null = null
    if (hasClinchedBye) {
      byeMagicNumber = 0
    } else if (isEliminatedFromBye || seed > byeSpots) {
      byeMagicNumber = null
    } else if (byeChaserTeam) {
      const byeChaserMax = byeChaserTeam.effectiveWins + remainingGamesPerTeam
      byeMagicNumber = Math.max(1, Math.ceil(byeChaserMax + 1 - effectiveWins))
    }

    // Elimination Number for Bye (Seed 3+ vs Seed 2) - Only for teams outside top B
    let byeEliminationNumber: number | null = null
    if (hasClinchedBye || seed <= byeSpots) {
      byeEliminationNumber = null
    } else if (isEliminatedFromBye) {
      byeEliminationNumber = 0
    } else if (byeCutoffTeam) {
      byeEliminationNumber = Math.max(1, Math.ceil(maxPossibleWins + 1 - byeCutoffTeam.effectiveWins))
    }

    const gamesBehindBye = byeCutoffTeam ? byeCutoffTeam.effectiveWins - effectiveWins : 0

    // Probabilities
    let playoffProbability = 0
    if (hasClinchedPlayoff) {
      playoffProbability = 1.0
    } else if (isEliminatedFromPlayoffs) {
      playoffProbability = 0.0
    } else {
      const pointDifferential = pointsFor - (cutoffTeam?.pointsFor ?? pointsFor)
      const pointScoreFactor = Math.min(2.0, Math.max(-2.0, pointDifferential / 150))
      const netGameLead = effectiveWins - (cutoffTeam?.effectiveWins ?? 0)
      const weeksFactor = Math.max(1, remainingWeeks)
      const z = (netGameLead * (hasMedianMatch ? 0.9 : 1.5) + pointScoreFactor) / Math.sqrt(weeksFactor)
      playoffProbability = Math.min(0.99, Math.max(0.01, 1 / (1 + Math.exp(-z))))
    }

    let byeProbability = 0
    if (byeSpots > 0) {
      if (hasClinchedBye) {
        byeProbability = 1.0
      } else if (isEliminatedFromBye) {
        byeProbability = 0.0
      } else if (byeChaserTeam) {
        const byePointDiff = pointsFor - byeChaserTeam.pointsFor
        const byeLead = effectiveWins - byeChaserTeam.effectiveWins
        const zBye = (byeLead * (hasMedianMatch ? 0.8 : 1.4) + byePointDiff / 140) / Math.sqrt(Math.max(1, remainingWeeks))
        byeProbability = Math.min(0.98, Math.max(0.02, 1 / (1 + Math.exp(-zBye))))
      }
    }

    // -------------------------------------------------------------
    // ACCURATE POSTSEASON STATUS & LABELS
    // -------------------------------------------------------------
    let status: ClinchStatus = 'IN_THE_HUNT'
    let statusLabel = 'In The Hunt'
    let clinchMeter = Math.round(playoffProbability * 100)

    if (hasClinchedBye) {
      status = 'CLINCHED_BYE'
      statusLabel = 'Clinched Bye'
      clinchMeter = 100
    } else if (hasClinchedPlayoff) {
      status = 'CLINCHED_PLAYOFF'
      statusLabel = 'Clinched Playoff'
      clinchMeter = 100
    } else if (isEliminatedFromPlayoffs) {
      status = 'ELIMINATED'
      statusLabel = 'Eliminated'
      clinchMeter = 0
    } else if (seed <= byeSpots) {
      // Seed 1 or 2
      status = 'BYE_FAVORITE'
      statusLabel = seed === 1 ? '1 Seed · Bye Track' : '2 Seed · Bye Track'
    } else if (seed <= playoffSpots) {
      // Seeds 3 to 6
      const gamesAhead = effectiveWins - (cutoffTeam?.effectiveWins ?? 0)
      if (gamesAhead <= 0.5 || seed === playoffSpots) {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (In)'
      } else if (playoffProbability >= 0.70) {
        status = 'IN_CONTROL'
        statusLabel = 'In Control'
      } else {
        status = 'IN_THE_HUNT'
        statusLabel = 'In The Hunt'
      }
    } else {
      // Seeds 7+
      if (gamesBehindCutoff <= 0.5) {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (Hunt)'
      } else if (gamesBehindCutoff <= 2.5 && playoffProbability >= 0.15) {
        status = 'IN_THE_HUNT'
        statusLabel = 'In The Hunt'
      } else {
        status = 'WORK_TO_DO'
        statusLabel = 'Work To Do'
      }
    }

    // Bye progress meter
    let byeMeter = 0
    if (hasClinchedBye) {
      byeMeter = 100
    } else if (isEliminatedFromBye) {
      byeMeter = 0
    } else if (byeMagicNumber !== null) {
      byeMeter = Math.min(95, Math.max(20, 100 - byeMagicNumber * 7))
    } else {
      byeMeter = Math.max(5, Math.min(50, 45 - gamesBehindBye * 10))
    }

    // Extract upcoming scheduled opponents from data.weeks
    const upcomingOpponents: { week: number; opponentRosterId: number; opponentName: string }[] = []
    const upcomingStart = effectiveCompletedWeeks + 1
    for (let w = upcomingStart; w <= regularSeasonEnd; w += 1) {
      const wFeed = data.weeks[w]
      if (!wFeed) continue
      const myMatchup = wFeed.matchups.find((m) => m.roster_id === entry.rosterId)
      if (myMatchup && myMatchup.matchup_id != null) {
        const opp = wFeed.matchups.find(
          (m) => m.matchup_id === myMatchup.matchup_id && m.roster_id !== entry.rosterId,
        )
        if (opp) {
          upcomingOpponents.push({
            week: w,
            opponentRosterId: opp.roster_id,
            opponentName: getTeamName(data, opp.roster_id),
          })
        }
      }
    }

    // -------------------------------------------------------------
    // RICH CLINCH SCENARIOS & EXPLANATIONS
    // -------------------------------------------------------------
    let magicNumberExplanation = ''
    if (hasClinchedPlayoff) {
      magicNumberExplanation = 'Clinched Playoff Spot. Locked in the top 6.'
    } else if (isEliminatedFromPlayoffs) {
      magicNumberExplanation = 'Mathematically eliminated from the playoff bracket.'
    } else if (seed <= playoffSpots && magicNumber !== null) {
      magicNumberExplanation = `Playoff Magic Number: ${magicNumber}. Needs any combination of ${magicNumber} team wins and ${chaserTeam?.acc.name ?? 'Seed 7'} losses across remaining weeks to guarantee a playoff berth.`
    } else {
      const behindText = gamesBehindCutoff === 0 ? 'tied with' : `${gamesBehindCutoff.toFixed(1)} games behind`
      magicNumberExplanation = `Elimination Number: ${eliminationNumber}. Currently ${behindText} ${cutoffTeam?.acc.name ?? 'Seed 6'}. Any combination of ${eliminationNumber} team losses and ${cutoffTeam?.acc.name ?? 'Seed 6'} wins results in mathematical elimination.`
    }

    let byeExplanation = ''
    if (byeSpots > 0) {
      if (hasClinchedBye) {
        byeExplanation = 'Clinched First-Round Bye. Advances straight to Semifinals.'
      } else if (isEliminatedFromBye) {
        byeExplanation = 'Eliminated from First-Round Bye contention.'
      } else if (seed <= byeSpots && byeMagicNumber !== null) {
        byeExplanation = `Bye Magic Number: ${byeMagicNumber}. Needs any combination of ${byeMagicNumber} team wins and ${byeChaserTeam?.acc.name ?? 'Seed 3'} losses to secure a top-2 first-round bye.`
      } else {
        byeExplanation = `Bye Elimination Number: ${byeEliminationNumber}. Trails Seed #2 (${byeCutoffTeam?.acc.name ?? 'Seed 2'}) by ${gamesBehindBye.toFixed(1)} games.`
      }
    }

    const fastestPlayoffClinchWeek =
      seed <= playoffSpots && magicNumber !== null && remainingWeeks > 0
        ? Math.min(regularSeasonEnd, effectiveCompletedWeeks + Math.max(1, Math.ceil(magicNumber / (gamesPerWeek * 2))))
        : null

    const fastestByeClinchWeek =
      seed <= byeSpots && byeMagicNumber !== null && remainingWeeks > 0
        ? Math.min(regularSeasonEnd, effectiveCompletedWeeks + Math.max(1, Math.ceil(byeMagicNumber / (gamesPerWeek * 2))))
        : null

    const fastestPlayoffElimWeek =
      seed > playoffSpots && eliminationNumber !== null && remainingWeeks > 0
        ? Math.min(regularSeasonEnd, effectiveCompletedWeeks + Math.max(1, Math.ceil(eliminationNumber / (gamesPerWeek * 2))))
        : null

    const fastestByeElimWeek =
      seed > byeSpots && byeEliminationNumber !== null && remainingWeeks > 0
        ? Math.min(regularSeasonEnd, effectiveCompletedWeeks + Math.max(1, Math.ceil(byeEliminationNumber / (gamesPerWeek * 2))))
        : null

    const weekImpactScenarios: string[] = []
    if (remainingWeeks > 0 && !hasClinchedPlayoff && !isEliminatedFromPlayoffs) {
      if (seed <= playoffSpots && magicNumber !== null) {
        if (hasMedianMatch) {
          const m2 = Math.max(0, magicNumber - 2)
          const m1 = Math.max(0, magicNumber - 1)
          weekImpactScenarios.push(
            `2-0 Week (Win H2H + Beat Median): Moves to ${totalWins + 2}–${totalLosses}. Drops Playoff M# to ${m2} (or ${Math.max(0, m2 - 2)} if chaser goes 0-2).`,
          )
          weekImpactScenarios.push(
            `1-1 Week (Split H2H / Median): Moves to ${totalWins + 1}–${totalLosses + 1}. Reduces Playoff M# by 1 (down to ${m1}).`,
          )
          weekImpactScenarios.push(
            `0-2 Week (Loss H2H + Below Median): Moves to ${totalWins}–${totalLosses + 2}. Playoff M# holds at ${magicNumber}.`,
          )
        } else {
          weekImpactScenarios.push(
            `Win: Moves to ${totalWins + 1}–${totalLosses}. Drops Playoff M# by 1 (or 2 if chaser loses).`,
          )
          weekImpactScenarios.push(
            `Loss: Moves to ${totalWins}–${totalLosses + 1}. Playoff M# remains at ${magicNumber}.`,
          )
        }
      } else if (eliminationNumber !== null) {
        if (hasMedianMatch) {
          const e2 = Math.max(0, eliminationNumber - 2)
          weekImpactScenarios.push(
            `2-0 Week (Win H2H + Beat Median): Moves to ${totalWins + 2}–${totalLosses}. Preserves Elimination Number at ${eliminationNumber} and gains up to 2 games on cutoff.`,
          )
          weekImpactScenarios.push(
            `1-1 Week (Split H2H / Median): Moves to ${totalWins + 1}–${totalLosses + 1}. Maintains pace with the playoff cutoff.`,
          )
          weekImpactScenarios.push(
            `0-2 Week (Loss H2H + Below Median): Moves to ${totalWins}–${totalLosses + 2}. Reduces Elimination Number to ${e2} (or ${Math.max(0, e2 - 2)} if cutoff goes 2-0).`,
          )
        } else {
          weekImpactScenarios.push(
            `Win: Moves to ${totalWins + 1}–${totalLosses}. Preserves Elimination Number at ${eliminationNumber}.`,
          )
          weekImpactScenarios.push(
            `Loss: Moves to ${totalWins}–${totalLosses + 1}. Reduces Elimination Number to ${Math.max(0, eliminationNumber - 1)}.`,
          )
        }
      }
    }

    // Clinch Scenarios
    const clinchThisWeekScenarios: string[] = []
    const clinchByeThisWeekScenarios: string[] = []
    const eliminatedThisWeekScenarios: string[] = []

    if (!hasClinchedPlayoff && !isEliminatedFromPlayoffs && remainingWeeks > 0) {
      if (magicNumber !== null && magicNumber <= gamesPerWeek * 2) {
        if (hasMedianMatch) {
          clinchThisWeekScenarios.push(`2-0 Week (Win H2H + Beat Median) AND ${chaserTeam?.acc.name ?? 'Seed 7'} loses at least 1 game`)
          if (magicNumber <= 2) {
            clinchThisWeekScenarios.push(`1 Win this week AND ${chaserTeam?.acc.name ?? 'Seed 7'} loses both games`)
          }
        } else {
          clinchThisWeekScenarios.push(`Win vs. Opponent AND Loss by ${chaserTeam?.acc.name ?? 'Seed 7'}`)
        }
      }
    }

    // Bye Clinch Scenario
    if (byeSpots > 0 && !hasClinchedBye && !isEliminatedFromBye && remainingWeeks > 0) {
      if (byeMagicNumber !== null && byeMagicNumber <= gamesPerWeek * 2) {
        if (hasMedianMatch) {
          clinchByeThisWeekScenarios.push(`2-0 Week (Win H2H + Beat Median) AND ${byeChaserTeam?.acc.name ?? 'Seed 3'} loses at least 1 game`)
        } else {
          clinchByeThisWeekScenarios.push(`Win vs. Opponent AND Loss by ${byeChaserTeam?.acc.name ?? 'Seed 3'}`)
        }
      }
    }

    // Elimination Scenario
    if (!hasClinchedPlayoff && !isEliminatedFromPlayoffs && remainingWeeks > 0) {
      if (eliminationNumber !== null && eliminationNumber <= gamesPerWeek * 2) {
        if (hasMedianMatch) {
          eliminatedThisWeekScenarios.push(`0-2 Week (Loss + Below Median) AND ${cutoffTeam?.acc.name ?? 'Seed 6'} wins at least 1 game`)
        } else {
          eliminatedThisWeekScenarios.push(`Loss vs. Opponent AND Win by ${cutoffTeam?.acc.name ?? 'Seed 6'}`)
        }
      }
    }

    return {
      rosterId: entry.rosterId,
      name: acc.name,
      ownerDisplayName: acc.ownerName,
      avatarUrl: acc.avatarUrl,
      seed,
      totalWins,
      totalLosses,
      totalTies,
      winPercentage,
      h2hWins: acc.h2hWins,
      h2hLosses: acc.h2hLosses,
      h2hTies: acc.h2hTies,
      medianWins: acc.medianWins,
      medianLosses: acc.medianLosses,
      medianTies: acc.medianTies,
      medianWinPct,
      pointsFor,
      pointsAgainst,
      pointsPerGame: effectiveCompletedWeeks > 0 ? pointsFor / effectiveCompletedWeeks : 0,
      expectedWins: scaledExpectedWins,
      expectedLosses,
      scheduleLuck,
      allPlayPercentage,
      status,
      statusLabel,
      clinchMeter,

      hasClinchedBye,
      isEliminatedFromBye,
      byeMagicNumber,
      byeEliminationNumber,
      byeProbability,
      byeMeter,
      gamesBehindBye,

      hasClinchedPlayoff,
      isEliminatedFromPlayoffs,
      magicNumber,
      eliminationNumber,
      playoffProbability,
      gamesBehindCutoff,

      maxPossibleWins,
      minPossibleWins,
      clinchThisWeekScenarios,
      clinchByeThisWeekScenarios,
      eliminatedThisWeekScenarios,
      magicNumberExplanation,
      byeExplanation,
      fastestPlayoffClinchWeek,
      fastestByeClinchWeek,
      fastestPlayoffElimWeek,
      fastestByeElimWeek,
      weekImpactScenarios,
      upcomingOpponents,
      weeklyDetails: acc.weeklyDetails,
    }
  })

  const clinchedCount = profiles.filter((p) => p.hasClinchedPlayoff).length
  const clinchedByeCount = profiles.filter((p) => p.hasClinchedBye).length
  const eliminatedCount = profiles.filter((p) => p.isEliminatedFromPlayoffs).length
  const bubbleCount = profiles.filter((p) => !p.hasClinchedPlayoff && !p.isEliminatedFromPlayoffs).length

  return {
    leagueId: data.league.league_id,
    leagueName: data.league.name,
    season: data.league.season,
    currentWeek,
    lastScoredWeek,
    inProgressWeek,
    isUsingLiveWeek,
    weeksAvailable: allScoredWeeks,
    finalizedWeeks,
    regularSeasonEnd,
    remainingWeeks,
    totalTeams,
    playoffSpots,
    byeSpots,
    hasMedianMatch,
    gamesPerWeek,
    remainingGamesPerTeam,
    clinchedCount,
    clinchedByeCount,
    bubbleCount,
    eliminatedCount,
    teams: profiles,
    weeklyMedians,
  }
}
