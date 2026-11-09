import type { LeagueData, SleeperMatchup, SleeperRoster } from './sleeper'

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

  // Scenarios for upcoming week
  clinchThisWeekScenarios: string[]
  clinchByeThisWeekScenarios: string[]
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
  clinchedByeCount: number
  bubbleCount: number
  eliminatedCount: number

  // Standings
  teams: TeamClinchProfile[]

  // Weekly league median benchmarks
  weeklyMedians: Record<number, number>
}

export interface ClinchOptions {
  enableMedian?: boolean
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
  const avatarId = user?.metadata?.avatar || user?.avatar
  if (!avatarId) return null
  return `https://sleepercdn.com/avatars/thumbs/${avatarId}`
}

export function analyzeLeagueClinch(
  data: LeagueData,
  options?: ClinchOptions,
): LeagueClinchSummary {
  const totalTeams = data.rosters.length || 12
  const leagueMedianSetting = Number(data.league.settings.league_average_match) === 1
  const hasMedianMatch = options?.enableMedian ?? leagueMedianSetting
  const gamesPerWeek = hasMedianMatch ? 2 : 1
  const playoffSpots = Math.min(totalTeams, Math.max(1, Number(data.league.settings.playoff_teams) || 6))
  const byeSpots = playoffSpots >= 6 ? 2 : playoffSpots >= 4 ? 0 : 0
  const playoffStart = Number(data.league.settings.playoff_week_start) || 15
  const regularSeasonEnd = Math.min(18, Math.max(1, playoffStart - 1))
  const currentWeek = Math.min(18, Math.max(1, data.currentWeek || 1))
  const lastScored = Math.min(regularSeasonEnd, Math.max(0, data.lastScoredWeek || 0))
  const remainingWeeks = Math.max(0, regularSeasonEnd - lastScored)
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

  // Process all completed weeks (1 through lastScored)
  for (let week = 1; week <= lastScored; week += 1) {
    const weekFeed = data.weeks[week]
    const matchups: SleeperMatchup[] = weekFeed?.matchups || []

    const weekScores: { rosterId: number; points: number; matchupId: number | null }[] = []

    for (const roster of data.rosters) {
      const matchup = matchups.find((m) => m.roster_id === roster.roster_id)
      let pts = 0
      if (matchup) {
        pts = typeof matchup.custom_points === 'number' && Number.isFinite(matchup.custom_points)
          ? matchup.custom_points
          : Number(matchup.points) || 0
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

  // Official Sleeper points for master accuracy
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
    const allPlayPercentage = lastScored > 0 ? acc.expectedWins / lastScored : 0.5
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

    // Magic Number for Playoff (Seed K)
    let magicNumber: number | null = null
    if (hasClinchedPlayoff) {
      magicNumber = 0
    } else if (isEliminatedFromPlayoffs) {
      magicNumber = null
    } else if (chaserTeam) {
      const chaserMax = chaserTeam.effectiveWins + remainingGamesPerTeam
      magicNumber = Math.max(1, Math.ceil(chaserMax + 1 - effectiveWins))
    }

    // Elimination Number for Playoff (Seed K)
    let eliminationNumber: number | null = null
    if (hasClinchedPlayoff) {
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

    // Magic Number for Bye (Seed 1 & 2 vs Seed 3)
    let byeMagicNumber: number | null = null
    if (hasClinchedBye) {
      byeMagicNumber = 0
    } else if (isEliminatedFromBye) {
      byeMagicNumber = null
    } else if (seed <= byeSpots && byeChaserTeam) {
      const byeChaserMax = byeChaserTeam.effectiveWins + remainingGamesPerTeam
      byeMagicNumber = Math.max(1, Math.ceil(byeChaserMax + 1 - effectiveWins))
    }

    // Elimination Number for Bye (Seed 3+ vs Seed 2)
    let byeEliminationNumber: number | null = null
    if (hasClinchedBye) {
      byeEliminationNumber = null
    } else if (isEliminatedFromBye) {
      byeEliminationNumber = 0
    } else if (byeCutoffTeam) {
      byeEliminationNumber = Math.max(1, Math.ceil(maxPossibleWins + 1 - byeCutoffTeam.effectiveWins))
    }

    const gamesBehindBye = byeCutoffTeam ? byeCutoffTeam.effectiveWins - effectiveWins : 0

    // -------------------------------------------------------------
    // STATUS & CLINCH METERS
    // -------------------------------------------------------------
    let status: ClinchStatus = 'IN_THE_HUNT'
    let statusLabel = 'In The Hunt'
    let clinchMeter = 50

    if (hasClinchedBye) {
      status = 'CLINCHED_BYE'
      statusLabel = 'Clinched Bye 🏆'
      clinchMeter = 100
    } else if (hasClinchedPlayoff) {
      status = 'CLINCHED_PLAYOFF'
      statusLabel = 'Clinched Playoff 🔒'
      clinchMeter = 100
    } else if (isEliminatedFromPlayoffs) {
      status = 'ELIMINATED'
      statusLabel = 'Eliminated'
      clinchMeter = 0
    } else if (seed <= playoffSpots) {
      if (magicNumber !== null && magicNumber <= gamesPerWeek * 2) {
        status = 'IN_THE_HUNT'
        statusLabel = 'Near Lock ⚡'
        clinchMeter = Math.min(95, Math.max(75, 100 - magicNumber * 6))
      } else {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (In)'
        clinchMeter = Math.min(74, Math.max(55, 50 + (playoffSpots - seed + 1) * 4))
      }
    } else {
      if (gamesBehindCutoff <= gamesPerWeek) {
        status = 'ON_THE_BUBBLE'
        statusLabel = 'On Bubble (Hunt)'
        clinchMeter = Math.max(30, 48 - gamesBehindCutoff * 6)
      } else {
        status = 'WORK_TO_DO'
        statusLabel = 'Work To Do'
        clinchMeter = Math.max(5, 26 - gamesBehindCutoff * 4)
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

    // Probabilities
    let playoffProbability = 0
    if (hasClinchedPlayoff) {
      playoffProbability = 1.0
    } else if (isEliminatedFromPlayoffs) {
      playoffProbability = 0.0
    } else {
      const pointDifferential = pointsFor - (cutoffTeam?.pointsFor ?? pointsFor)
      const pointScoreFactor = Math.min(2.0, Math.max(-2.0, pointDifferential / 150))
      const netGameLead = (cutoffTeam?.effectiveWins ?? 0) - effectiveWins
      const weeksFactor = Math.max(1, remainingWeeks)
      const z = (-netGameLead * (hasMedianMatch ? 0.9 : 1.5) + pointScoreFactor) / Math.sqrt(weeksFactor)
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
      pointsPerGame: lastScored > 0 ? pointsFor / lastScored : 0,
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
