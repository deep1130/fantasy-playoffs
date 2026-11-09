import type { LeagueData, SleeperRoster } from './sleeper'

export type ClinchStatus =
  | 'CLINCHED_BYE'
  | 'CLINCHED_PLAYOFF'
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
  avatarUrl?: string
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

  // Scoring
  pointsFor: number
  pointsAgainst: number
  pointsPerGame: number

  // Expected Wins & Schedule Luck
  expectedWins: number
  expectedLosses: number
  scheduleLuck: number // actual wins - expected wins (normalized to total games or per-game)
  allPlayPercentage: number

  // Playoff & Clinch Metrics
  status: ClinchStatus
  statusLabel: string
  clinchMeter: number // 0 to 100%
  playoffProbability: number // 0.0 to 1.0 (Monte Carlo / closed form)
  byeProbability: number // 0.0 to 1.0

  magicNumber: number | null // null if already clinched or eliminated
  eliminationNumber: number | null // null if already clinched or eliminated
  gamesBehindCutoff: number // games behind seed K (or ahead if negative)
  maxPossibleWins: number
  minPossibleWins: number

  // Scenarios for current / upcoming week
  clinchThisWeekScenarios: string[]
  eliminatedThisWeekScenarios: string[]

  // Weekly breakdown
  weeklyDetails: WeeklyScoreDetail[]
}

export interface LeagueClinchSummary {
  leagueId: string
  leagueName: string
  season: string
  currentWeek: number
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
  bubbleCount: number
  eliminatedCount: number

  // Teams sorted by current standings / seed
  teams: TeamClinchProfile[]

  // Weekly league median historical benchmarks
  weeklyMedians: Record<number, number>
}

/**
 * Calculates median score for a list of numbers.
 */
export function calculateMedian(scores: readonly number[]): number {
  if (scores.length === 0) return 0
  const sorted = [...scores].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2
  }
  return sorted[mid]
}

/**
 * Resolves a team display name.
 */
export function getTeamName(data: LeagueData, rosterId: number): string {
  const roster = data.rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return `Team ${rosterId}`
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  return user?.metadata?.team_name || user?.display_name || `Team ${rosterId}`
}

export function getUserDisplayName(data: LeagueData, rosterId: number): string {
  const roster = data.rosters.find((r) => r.roster_id === rosterId)
  if (!roster) return `Manager ${rosterId}`
  const user = data.users.find((u) => u.user_id === roster.owner_id)
  return user?.display_name || `Manager ${rosterId}`
}

/**
 * Analyzes historical matchups, median scoring, expected wins,
 * and computes exact clinch numbers and probabilities for the entire league.
 */
export function analyzeLeagueClinch(data: LeagueData): LeagueClinchSummary {
  const totalTeams = data.rosters.length || 12
  const hasMedianMatch = Number(data.league.settings.league_average_match) === 1
  const gamesPerWeek = hasMedianMatch ? 2 : 1
  const playoffSpots = Math.min(totalTeams, Math.max(1, Number(data.league.settings.playoff_teams) || 6))
  const byeSpots = playoffSpots >= 6 ? 2 : playoffSpots >= 4 ? 0 : 0
  const playoffStart = Number(data.league.settings.playoff_week_start) || 15
  const regularSeasonEnd = Math.min(18, Math.max(1, playoffStart - 1))
  const currentWeek = Math.min(18, Math.max(1, data.currentWeek || 1))
  const lastScored = Math.min(regularSeasonEnd, Math.max(0, data.lastScoredWeek || 0))
  const remainingWeeks = Math.max(0, regularSeasonEnd - lastScored)
  const remainingGamesPerTeam = remainingWeeks * gamesPerWeek

  // 1. Calculate weekly medians for all completed weeks
  const weeklyMedians: Record<number, number> = {}
  for (let week = 1; week <= lastScored; week += 1) {
    const scoresInWeek = data.historicalScores[week] || []
    weeklyMedians[week] = calculateMedian(scoresInWeek)
  }

  // 2. Build weekly details, H2H records, and Median records for each team
  interface Accumulator {
    roster: SleeperRoster
    name: string
    ownerName: string
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

  // Iterate over completed weeks and rebuild detailed game logs
  for (let week = 1; week <= lastScored; week += 1) {
    const scoresInWeek = data.historicalScores[week] || []
    const weekMedian = weeklyMedians[week] ?? calculateMedian(scoresInWeek)
    const weekFeed = data.weeks[week]
    const matchups = weekFeed?.matchups || []

    // Matchup map: matchup_id -> list of rosters
    const matchupPairs = new Map<number, typeof matchups>()
    for (const m of matchups) {
      if (m.matchup_id != null) {
        const list = matchupPairs.get(m.matchup_id) || []
        list.push(m)
        matchupPairs.set(m.matchup_id, list)
      }
    }

    // Evaluate each roster in this week
    for (const roster of data.rosters) {
      const acc = accumulators.get(roster.roster_id)!
      const teamWeeklyScore = (data.historicalTeamScores[roster.roster_id] || [])[week - 1]
      const teamScore = teamWeeklyScore ?? (roster.settings.fpts ? roster.settings.fpts / lastScored : 0)

      acc.pointsFor += teamScore

      // Find opponent
      let oppRosterId: number | null = null
      let oppPoints: number | null = null
      let h2hResult: 'W' | 'L' | 'T' | 'BYE' = 'BYE'

      const myMatchup = matchups.find((m) => m.roster_id === roster.roster_id)
      if (myMatchup && myMatchup.matchup_id != null) {
        const pair = matchupPairs.get(myMatchup.matchup_id) || []
        const opp = pair.find((m) => m.roster_id !== roster.roster_id)
        if (opp) {
          oppRosterId = opp.roster_id
          oppPoints = opp.custom_points ?? opp.points ?? 0
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

      // Median Game Result
      let medianResult: 'W' | 'L' | 'T' | null = null
      if (hasMedianMatch && scoresInWeek.length >= 2) {
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

      // All-Play Calculation for this week
      let allPlayBeaten = 0
      let allPlayTies = 0
      const otherScores = scoresInWeek.filter((_, idx) => idx !== scoresInWeek.indexOf(teamScore))
      for (const s of otherScores) {
        if (Math.abs(teamScore - s) < 0.005) {
          allPlayTies += 1
        } else if (teamScore > s) {
          allPlayBeaten += 1
        }
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

  // Fallback to Sleeper's roster.settings if matchups weren't fully loaded
  for (const roster of data.rosters) {
    const acc = accumulators.get(roster.roster_id)!
    const sleeperWins = roster.settings.wins ?? 0
    const sleeperLosses = roster.settings.losses ?? 0
    const sleeperTies = roster.settings.ties ?? 0
    const sleeperFpts = (roster.settings.fpts ?? 0) + (roster.settings.fpts_decimal ? roster.settings.fpts_decimal / 100 : 0)

    // If Sleeper has official PF, use it as master
    if (sleeperFpts > 0) {
      acc.pointsFor = sleeperFpts
    }

    // In Sleeper, if median is enabled, sleeperWins includes median wins
    if (hasMedianMatch) {
      const calculatedTotal = acc.h2hWins + acc.medianWins
      if (sleeperWins > 0 && calculatedTotal === 0) {
        // Approximate split if historic matchups were missing
        acc.h2hWins = Math.round(sleeperWins / 2)
        acc.medianWins = sleeperWins - acc.h2hWins
        acc.h2hLosses = Math.round(sleeperLosses / 2)
        acc.medianLosses = sleeperLosses - acc.h2hLosses
      }
    } else {
      if (sleeperWins > 0 && acc.h2hWins === 0) {
        acc.h2hWins = sleeperWins
        acc.h2hLosses = sleeperLosses
        acc.h2hTies = sleeperTies
      }
    }
  }

  // 3. Compute Standings & Seeds
  // Sleeper rank order: Total Wins (counting ties as 0.5), then Points For (PF)
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

  // 4. Calculate Clinch Math (Magic & Tragic numbers)
  const cutoffIndex = playoffSpots - 1 // 0-indexed seed K
  const cutoffTeam = sortedTeams[cutoffIndex] // Seed K (last playoff spot)
  const chaserTeam = sortedTeams[playoffSpots] // Seed K+1 (first team out)

  const profiles: TeamClinchProfile[] = sortedTeams.map((entry, index) => {
    const seed = index + 1
    const { acc, totalWins, totalLosses, totalTies, effectiveWins, winPercentage, pointsFor, pointsAgainst } = entry
    const maxPossibleWins = effectiveWins + remainingGamesPerTeam
    const minPossibleWins = effectiveWins

    // Expected Wins calculation
    // Scale expected wins by gamesPerWeek so that luck is on the same scale as actual wins
    const scaledExpectedWins = acc.expectedWins * gamesPerWeek
    const totalGames = Math.max(1, totalWins + totalLosses + totalTies)
    const expectedLosses = Math.max(0, totalGames - scaledExpectedWins)
    const scheduleLuck = totalWins - scaledExpectedWins
    const allPlayPercentage = lastScored > 0 ? acc.expectedWins / lastScored : 0.5

    // Mathematical Clinch Logic
    // Can other teams surpass this team?
    // How many teams can achieve strictly more than this team's current wins?
    let teamsThatCanSurpass = 0
    for (const other of sortedTeams) {
      if (other.rosterId === entry.rosterId) continue
      const otherMax = other.effectiveWins + remainingGamesPerTeam
      // If other's max exceeds our current, or equals and has more PF
      if (otherMax > effectiveWins || (otherMax === effectiveWins && other.pointsFor >= pointsFor)) {
        teamsThatCanSurpass += 1
      }
    }
    const hasMathematicallyClinchedPlayoff = teamsThatCanSurpass < playoffSpots

    // Bye clinch check
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
    const hasMathematicallyClinchedBye = byeSpots > 0 && teamsThatCanSurpassForBye < byeSpots

    // Elimination check
    // If our max possible wins cannot catch the current cutoff team's wins (plus tiebreaker)
    const cannotCatchCutoff = cutoffTeam
      ? (maxPossibleWins < cutoffTeam.effectiveWins || (maxPossibleWins === cutoffTeam.effectiveWins && pointsFor < cutoffTeam.pointsFor))
      : false

    // Magic Number (M): Team Wins + Chaser Losses needed to lock playoff spot
    let magicNumber: number | null = null
    if (hasMathematicallyClinchedPlayoff) {
      magicNumber = 0
    } else if (cannotCatchCutoff) {
      magicNumber = null
    } else if (chaserTeam) {
      const chaserMax = chaserTeam.effectiveWins + remainingGamesPerTeam
      // Target is chaserMax + 1 win (or + 0.5 with tiebreaker)
      magicNumber = Math.max(1, Math.ceil(chaserMax + 1 - effectiveWins))
    }

    // Elimination Number (E): Team Losses + Cutoff Wins to officially eliminate
    let eliminationNumber: number | null = null
    if (hasMathematicallyClinchedPlayoff) {
      eliminationNumber = null
    } else if (cannotCatchCutoff) {
      eliminationNumber = 0
    } else if (cutoffTeam) {
      eliminationNumber = Math.max(1, Math.ceil(maxPossibleWins + 1 - cutoffTeam.effectiveWins))
    }

    // Games behind / ahead of playoff cutoff line
    const gamesBehindCutoff = cutoffTeam ? cutoffTeam.effectiveWins - effectiveWins : 0

    // Assign Clinch Status & Clinch Meter
    let status: ClinchStatus = 'IN_THE_HUNT'
    let statusLabel = 'In The Hunt'
    let clinchMeter = 50

    if (hasMathematicallyClinchedBye) {
      status = 'CLINCHED_BYE'
      statusLabel = 'Clinched Bye'
      clinchMeter = 100
    } else if (hasMathematicallyClinchedPlayoff) {
      status = 'CLINCHED_PLAYOFF'
      statusLabel = 'Clinched Playoff'
      clinchMeter = 100
    } else if (cannotCatchCutoff) {
      status = 'ELIMINATED'
      statusLabel = 'Eliminated'
      clinchMeter = 0
    } else if (seed <= playoffSpots) {
      // Inside playoff spots but not locked yet
      if (magicNumber !== null && magicNumber <= gamesPerWeek * 2) {
        status = 'IN_THE_HUNT'
        statusLabel = 'Near Lock'
        clinchMeter = Math.min(95, Math.max(75, 100 - magicNumber * 10))
      } else {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (In)'
        clinchMeter = Math.min(74, Math.max(55, 50 + (playoffSpots - seed + 1) * 5))
      }
    } else {
      // Outside playoff spots
      if (gamesBehindCutoff <= gamesPerWeek) {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (Hunt)'
        clinchMeter = Math.max(30, 48 - gamesBehindCutoff * 8)
      } else {
        status = 'WORK_TO_DO'
        statusLabel = 'Work To Do'
        clinchMeter = Math.max(5, 28 - gamesBehindCutoff * 5)
      }
    }

    // Estimated Playoff Probability (based on current standing, PF, and remaining weeks)
    let playoffProbability = 0
    if (hasMathematicallyClinchedPlayoff) {
      playoffProbability = 1.0
    } else if (cannotCatchCutoff) {
      playoffProbability = 0.0
    } else {
      // Logistic sigmoid curve based on games ahead/behind and scoring strength
      const pointDifferential = pointsFor - (cutoffTeam?.pointsFor ?? pointsFor)
      const pointScoreFactor = Math.min(2.0, Math.max(-2.0, pointDifferential / 150))
      const netGameLead = (cutoffTeam?.effectiveWins ?? 0) - effectiveWins
      const weeksFactor = Math.max(1, remainingWeeks)
      const z = (-netGameLead * (hasMedianMatch ? 1.0 : 1.6) + pointScoreFactor) / Math.sqrt(weeksFactor)
      // Logistic sigmoid: 1 / (1 + e^-z)
      playoffProbability = Math.min(0.99, Math.max(0.01, 1 / (1 + Math.exp(-z))))
    }

    const byeProbability = byeSpots > 0
      ? (hasMathematicallyClinchedBye ? 1.0 : seed <= byeSpots ? Math.min(0.95, playoffProbability * 0.75) : Math.max(0, playoffProbability * 0.2))
      : 0

    // Scenarios for current week
    const clinchThisWeekScenarios: string[] = []
    const eliminatedThisWeekScenarios: string[] = []

    if (!hasMathematicallyClinchedPlayoff && !cannotCatchCutoff && remainingWeeks > 0) {
      if (magicNumber !== null && magicNumber <= gamesPerWeek * 2) {
        if (hasMedianMatch) {
          clinchThisWeekScenarios.push(`2-0 Week (H2H Win + Median Win) AND ${chaserTeam?.acc.name ?? 'Seed 7'} loses at least 1 game`)
          if (magicNumber <= 2) {
            clinchThisWeekScenarios.push(`1 Win this week AND ${chaserTeam?.acc.name ?? 'Seed 7'} loses both games`)
          }
        } else {
          clinchThisWeekScenarios.push(`Win vs. Opponent AND Loss by ${chaserTeam?.acc.name ?? 'Seed 7'}`)
        }
      }
    }

    if (!hasMathematicallyClinchedPlayoff && !cannotCatchCutoff && remainingWeeks > 0) {
      if (eliminationNumber !== null && eliminationNumber <= gamesPerWeek * 2) {
        if (hasMedianMatch) {
          eliminatedThisWeekScenarios.push(`0-2 Week (Loss + Median Loss) AND ${cutoffTeam?.acc.name ?? 'Seed 6'} wins at least 1 game`)
        } else {
          eliminatedThisWeekScenarios.push(`Loss vs. Opponent AND Win by ${cutoffTeam?.acc.name ?? 'Seed 6'}`)
        }
      }
    }

    return {
      rosterId: entry.rosterId,
      name: acc.name,
      ownerDisplayName: acc.ownerName,
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
      pointsFor,
      pointsAgainst,
      pointsPerGame: lastScored > 0 ? pointsFor / lastScored : 0,
      expectedWins: scaledExpectedWins,
      expectedLosses,
      scheduleLuck,
      allPlayPercentage,
      status,
      statusLabel,
      clinchMeter,
      playoffProbability,
      byeProbability,
      magicNumber,
      eliminationNumber,
      gamesBehindCutoff,
      maxPossibleWins,
      minPossibleWins,
      clinchThisWeekScenarios,
      eliminatedThisWeekScenarios,
      weeklyDetails: acc.weeklyDetails,
    }
  })

  const clinchedCount = profiles.filter((p) => p.status === 'CLINCHED_PLAYOFF' || p.status === 'CLINCHED_BYE').length
  const eliminatedCount = profiles.filter((p) => p.status === 'ELIMINATED').length
  const bubbleCount = profiles.filter((p) => p.status === 'ON_THE_BUBBLE' || p.status === 'IN_THE_HUNT').length

  return {
    leagueId: data.league.league_id,
    leagueName: data.league.name,
    season: data.league.season,
    currentWeek,
    regularSeasonEnd,
    remainingWeeks,
    totalTeams,
    playoffSpots,
    byeSpots,
    hasMedianMatch,
    gamesPerWeek,
    remainingGamesPerTeam,
    clinchedCount,
    bubbleCount,
    eliminatedCount,
    teams: profiles,
    weeklyMedians,
  }
}
