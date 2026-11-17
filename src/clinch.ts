import type { LeagueData, SleeperMatchup, SleeperRoster } from './sleeper'
import { simulateSeasonOdds, type SimScheduleWeek } from './simulation'

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
  const nextPow2 = 2 ** Math.ceil(Math.log2(playoffSpots))
  const byeSpots = playoffSpots >= 5 && nextPow2 > playoffSpots ? nextPow2 - playoffSpots : 0
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
    for (let itemIndex = 0; itemIndex < weekScores.length; itemIndex += 1) {
      const item = weekScores[itemIndex]
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
      const otherScores = scoreValues.filter((_, idx) => idx !== itemIndex)
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

  // Build remaining head-to-head schedule matrix so contenders playing each other are factored into clinch/elimination math
  const pairKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
  const remainingPairGames = new Map<string, number>()
  const remainingScheduleWeeks: SimScheduleWeek[] = []
  const upcomingStartWeek = effectiveCompletedWeeks + 1
  for (let w = upcomingStartWeek; w <= regularSeasonEnd; w += 1) {
    const wFeed = data.weeks[w]
    const weekPairs: [number, number][] = []
    if (wFeed?.matchups?.length) {
      const byMatchup = new Map<number, number[]>()
      for (const m of wFeed.matchups) {
        if (m.matchup_id != null) {
          const list = byMatchup.get(m.matchup_id) || []
          list.push(m.roster_id)
          byMatchup.set(m.matchup_id, list)
        }
      }
      for (const pair of byMatchup.values()) {
        if (pair.length === 2 && pair[0] !== pair[1]) {
          const key = pairKey(pair[0], pair[1])
          remainingPairGames.set(key, (remainingPairGames.get(key) ?? 0) + 1)
          weekPairs.push([pair[0], pair[1]])
        }
      }
    }
    remainingScheduleWeeks.push({ week: w, pairs: weekPairs })
  }

  // Schedule-aware Monte Carlo simulation for Playoff & Bye probabilities
  const simOdds = simulateSeasonOdds({
    seedKey: `${data.league.league_id}:${effectiveCompletedWeeks}:${isUsingLiveWeek ? 1 : 0}:${regularSeasonEnd}`,
    teams: sortedTeams.map((t) => ({
      rosterId: t.rosterId,
      effectiveWins: t.effectiveWins,
      pointsFor: t.pointsFor,
      weeklyScores: t.acc.weeklyDetails.map((d) => d.points),
    })),
    schedule: remainingScheduleWeeks,
    hasMedianMatch,
    playoffSpots,
    byeSpots,
  })

  const getPairH2hGames = (a: number, b: number): number => {
    if (a === b) return 0
    return remainingPairGames.get(pairKey(a, b)) ?? 0
  }

  const maxMedianWinnersPerWeek = Math.floor(totalTeams / 2)
  const maxMedianLosersPerWeek = Math.ceil(totalTeams / 2)

  // Exact Max-Flow / Hall condition check: can `requiredCount` other teams SIMULTANEOUSLY reach `targetWins`?
  function canKTeamsSurpassTarget(
    teamId: number,
    targetWins: number,
    teamPointsFor: number,
    useTiebreaker: boolean,
    requiredCount: number,
  ): boolean {
    if (requiredCount <= 0) return true
    let alreadyAboveCount = 0
    const candidates: { rosterId: number; need: number; maxRem: number }[] = []

    for (const other of sortedTeams) {
      if (other.rosterId === teamId) continue
      const tiesAtTargetWin = !useTiebreaker || other.pointsFor >= teamPointsFor
      const minFinalWinsNeeded = tiesAtTargetWin
        ? targetWins
        : Math.floor(targetWins) + 1
      const need = Math.max(0, Math.ceil(minFinalWinsNeeded - other.effectiveWins))

      if (need === 0) {
        alreadyAboveCount += 1
      } else if (need <= remainingGamesPerTeam) {
        candidates.push({
          rosterId: other.rosterId,
          need,
          maxRem: remainingGamesPerTeam,
        })
      }
    }

    const neededFromCandidates = requiredCount - alreadyAboveCount
    if (neededFromCandidates <= 0) return true
    if (candidates.length < neededFromCandidates) return false

    candidates.sort((a, b) => a.need - b.need)
    const active = candidates.slice(0, 14)
    const m = active.length
    if (m < neededFromCandidates) return false

    const totalMasks = 1 << m
    const feasible = new Uint8Array(totalMasks)
    const sumNeed = new Int16Array(totalMasks)
    const sumMaxRem = new Int16Array(totalMasks)
    const internalH2h = new Int16Array(totalMasks)
    const popcounts = new Uint8Array(totalMasks)
    feasible[0] = 1

    for (let mask = 1; mask < totalMasks; mask += 1) {
      const lsb = mask & -mask
      const bitIdx = Math.clz32(lsb) ^ 31
      const prevMask = mask ^ lsb
      const count = popcounts[prevMask] + 1
      popcounts[mask] = count
      sumNeed[mask] = sumNeed[prevMask] + active[bitIdx].need
      sumMaxRem[mask] = sumMaxRem[prevMask] + active[bitIdx].maxRem

      let addedH2h = 0
      for (let j = 0; j < m; j += 1) {
        if (prevMask & (1 << j)) {
          addedH2h += getPairH2hGames(active[bitIdx].rosterId, active[j].rosterId)
        }
      }
      internalH2h[mask] = internalH2h[prevMask] + addedH2h

      const medianOverflow = hasMedianMatch
        ? remainingWeeks * Math.max(0, count - maxMedianWinnersPerWeek)
        : 0
      const maxWinsAvailable = sumMaxRem[mask] - internalH2h[mask] - medianOverflow

      if (sumNeed[mask] <= maxWinsAvailable) {
        let allSubmasksOk = true
        for (let j = 0; j < m; j += 1) {
          if ((mask & (1 << j)) && !feasible[mask ^ (1 << j)]) {
            allSubmasksOk = false
            break
          }
        }
        if (allSubmasksOk) {
          feasible[mask] = 1
          if (count >= neededFromCandidates) return true
        }
      }
    }

    return false
  }

  // Exact dual Max-Flow / Hall check: when `teamId` wins out to `teamMaxWins`, can at least `totalTeams - spotCount` other teams stay below `teamId`?
  function canTeamFinishTopK(
    teamId: number,
    teamMaxWins: number,
    teamPointsFor: number,
    useTiebreaker: boolean,
    spotCount: number,
  ): boolean {
    const requiredSafeTeams = totalTeams - spotCount
    if (requiredSafeTeams <= 0) return true

    let alwaysBelowCount = 0
    const candidates: { rosterId: number; slack: number }[] = []

    for (const other of sortedTeams) {
      if (other.rosterId === teamId) continue
      const gamesVsTeam = getPairH2hGames(teamId, other.rosterId)
      const maxRemExcludingTeam = Math.max(0, remainingGamesPerTeam - gamesVsTeam)

      const otherWinsTie = useTiebreaker && other.pointsFor > teamPointsFor
      const slack = otherWinsTie
        ? Math.ceil(teamMaxWins - other.effectiveWins) - 1
        : Math.floor(teamMaxWins - other.effectiveWins)

      if (slack < 0) {
        continue
      }
      if (slack >= maxRemExcludingTeam) {
        alwaysBelowCount += 1
      } else {
        candidates.push({
          rosterId: other.rosterId,
          slack,
        })
      }
    }

    const neededFromCandidates = requiredSafeTeams - alwaysBelowCount
    if (neededFromCandidates <= 0) return true
    if (candidates.length < neededFromCandidates) return false

    candidates.sort((a, b) => b.slack - a.slack)
    const active = candidates.slice(0, 14)
    const m = active.length
    if (m < neededFromCandidates) return false

    const totalMasks = 1 << m
    const feasible = new Uint8Array(totalMasks)
    const sumSlack = new Int16Array(totalMasks)
    const internalH2h = new Int16Array(totalMasks)
    const popcounts = new Uint8Array(totalMasks)
    feasible[0] = 1

    for (let mask = 1; mask < totalMasks; mask += 1) {
      const lsb = mask & -mask
      const bitIdx = Math.clz32(lsb) ^ 31
      const prevMask = mask ^ lsb
      const count = popcounts[prevMask] + 1
      popcounts[mask] = count
      sumSlack[mask] = sumSlack[prevMask] + active[bitIdx].slack

      let addedH2h = 0
      for (let j = 0; j < m; j += 1) {
        if (prevMask & (1 << j)) {
          addedH2h += getPairH2hGames(active[bitIdx].rosterId, active[j].rosterId)
        }
      }
      internalH2h[mask] = internalH2h[prevMask] + addedH2h

      const guaranteedMedianWins = hasMedianMatch
        ? remainingWeeks * Math.max(0, count - maxMedianLosersPerWeek)
        : 0
      const minGuaranteedWins = internalH2h[mask] + guaranteedMedianWins

      if (minGuaranteedWins <= sumSlack[mask]) {
        let allSubmasksOk = true
        for (let j = 0; j < m; j += 1) {
          if ((mask & (1 << j)) && !feasible[mask ^ (1 << j)]) {
            allSubmasksOk = false
            break
          }
        }
        if (allSubmasksOk) {
          feasible[mask] = 1
          if (count >= neededFromCandidates) return true
        }
      }
    }

    return false
  }

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
    // PLAYOFF CLINCH LOGIC (Schedule-Aware Top K, PF unlocked while weeks remain)
    // -------------------------------------------------------------
    const pfLocked = remainingWeeks === 0

    const hasClinchedPlayoff = !canKTeamsSurpassTarget(
      entry.rosterId,
      effectiveWins,
      pointsFor,
      pfLocked,
      playoffSpots,
    )

    const isEliminatedFromPlayoffs = !canTeamFinishTopK(
      entry.rosterId,
      maxPossibleWins,
      pointsFor,
      pfLocked,
      playoffSpots,
    )

    // Schedule-aware Magic Number for Playoff (Seed K) - accounts for contenders playing each other
    let magicNumber: number | null = null
    let playoffCannibalizedLosses = 0
    if (hasClinchedPlayoff) {
      magicNumber = 0
    } else if (isEliminatedFromPlayoffs || seed > playoffSpots) {
      magicNumber = null
    } else if (chaserTeam) {
      const chaserMax = Math.ceil(chaserTeam.effectiveWins + remainingGamesPerTeam)
      const naiveMagic = Math.max(1, Math.floor(chaserMax - effectiveWins) + 1)
      let maxSimultaneousThreatWins = Math.floor(effectiveWins)
      for (let w = chaserMax; w >= Math.floor(effectiveWins); w -= 1) {
        if (canKTeamsSurpassTarget(entry.rosterId, w, Infinity, false, playoffSpots)) {
          maxSimultaneousThreatWins = w
          break
        }
      }
      magicNumber = Math.max(1, Math.floor(maxSimultaneousThreatWins - effectiveWins) + 1)
      playoffCannibalizedLosses = Math.max(0, naiveMagic - magicNumber)
    }

    // Schedule-aware Elimination Number for Playoff (Seed K) - accounts for cutoff rivals playing each other
    let eliminationNumber: number | null = null
    let playoffGuaranteedCutoffWins = 0
    if (hasClinchedPlayoff || seed <= playoffSpots) {
      eliminationNumber = null
    } else if (isEliminatedFromPlayoffs) {
      eliminationNumber = 0
    } else if (cutoffTeam) {
      const baseCutoffWins = Math.floor(cutoffTeam.effectiveWins)
      const naiveElim = Math.max(1, Math.floor(maxPossibleWins - cutoffTeam.effectiveWins) + 1)
      let effectiveCutoffFloor = cutoffTeam.effectiveWins
      for (let w = baseCutoffWins; w <= Math.ceil(maxPossibleWins); w += 1) {
        if (canTeamFinishTopK(entry.rosterId, w, Infinity, false, playoffSpots)) {
          effectiveCutoffFloor = Math.max(cutoffTeam.effectiveWins, w)
          break
        }
      }
      eliminationNumber = Math.max(1, Math.floor(maxPossibleWins - effectiveCutoffFloor) + 1)
      playoffGuaranteedCutoffWins = Math.max(0, naiveElim - eliminationNumber)
    }

    const gamesBehindCutoff = cutoffTeam ? cutoffTeam.effectiveWins - effectiveWins : 0

    // -------------------------------------------------------------
    // FIRST-ROUND BYE CLINCH LOGIC (Schedule-Aware Top B, PF unlocked while weeks remain)
    // -------------------------------------------------------------
    const hasClinchedBye =
      byeSpots > 0 &&
      !canKTeamsSurpassTarget(entry.rosterId, effectiveWins, pointsFor, pfLocked, byeSpots)

    const isEliminatedFromBye =
      byeSpots === 0 ||
      !canTeamFinishTopK(entry.rosterId, maxPossibleWins, pointsFor, pfLocked, byeSpots)

    // Schedule-aware Magic Number for Bye (Seed 1 & 2 vs Seed 3+) - accounts for bye contenders playing each other
    let byeMagicNumber: number | null = null
    let byeCannibalizedLosses = 0
    if (hasClinchedBye) {
      byeMagicNumber = 0
    } else if (isEliminatedFromBye || seed > byeSpots) {
      byeMagicNumber = null
    } else if (byeChaserTeam) {
      const byeChaserMax = Math.ceil(byeChaserTeam.effectiveWins + remainingGamesPerTeam)
      const naiveByeMagic = Math.max(1, Math.floor(byeChaserMax - effectiveWins) + 1)
      let maxSimultaneousByeThreatWins = Math.floor(effectiveWins)
      for (let w = byeChaserMax; w >= Math.floor(effectiveWins); w -= 1) {
        if (canKTeamsSurpassTarget(entry.rosterId, w, Infinity, false, byeSpots)) {
          maxSimultaneousByeThreatWins = w
          break
        }
      }
      byeMagicNumber = Math.max(1, Math.floor(maxSimultaneousByeThreatWins - effectiveWins) + 1)
      byeCannibalizedLosses = Math.max(0, naiveByeMagic - byeMagicNumber)
    }

    // Schedule-aware Elimination Number for Bye (Seed 3+ vs Seed 2) - accounts for top contenders playing each other
    let byeEliminationNumber: number | null = null
    let byeGuaranteedCutoffWins = 0
    if (hasClinchedBye || seed <= byeSpots) {
      byeEliminationNumber = null
    } else if (isEliminatedFromBye) {
      byeEliminationNumber = 0
    } else if (byeCutoffTeam) {
      const baseByeFloor = Math.floor(byeCutoffTeam.effectiveWins)
      const naiveByeElim = Math.max(1, Math.floor(maxPossibleWins - byeCutoffTeam.effectiveWins) + 1)
      let effectiveByeFloor = byeCutoffTeam.effectiveWins
      for (let w = baseByeFloor; w <= Math.ceil(maxPossibleWins); w += 1) {
        if (canTeamFinishTopK(entry.rosterId, w, Infinity, false, byeSpots)) {
          effectiveByeFloor = Math.max(byeCutoffTeam.effectiveWins, w)
          break
        }
      }
      byeEliminationNumber = Math.max(1, Math.floor(maxPossibleWins - effectiveByeFloor) + 1)
      byeGuaranteedCutoffWins = Math.max(0, naiveByeElim - byeEliminationNumber)
    }

    const gamesBehindBye = byeCutoffTeam ? byeCutoffTeam.effectiveWins - effectiveWins : 0

    // Probabilities from Monte Carlo simulation, bounded by exact mathematical clinch/elimination state
    let playoffProbability = 0
    if (hasClinchedPlayoff) {
      playoffProbability = 1.0
    } else if (isEliminatedFromPlayoffs) {
      playoffProbability = 0.0
    } else {
      const raw = simOdds.playoffProbabilities.get(entry.rosterId) ?? 0.5
      playoffProbability = Math.min(0.999, Math.max(0.001, raw))
    }

    let byeProbability = 0
    if (byeSpots > 0) {
      if (hasClinchedBye) {
        byeProbability = 1.0
      } else if (isEliminatedFromBye) {
        byeProbability = 0.0
      } else {
        const raw = simOdds.byeProbabilities.get(entry.rosterId) ?? 0.25
        byeProbability = Math.min(0.999, Math.max(0.001, raw))
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
      magicNumberExplanation = `Clinched Playoff Spot. Locked in the top ${playoffSpots}.`
    } else if (isEliminatedFromPlayoffs) {
      magicNumberExplanation = 'Mathematically eliminated from the playoff bracket.'
    } else if (seed <= playoffSpots && magicNumber !== null) {
      const schedNote =
        playoffCannibalizedLosses > 0
          ? ` (already reduced by ${playoffCannibalizedLosses} guaranteed loss${playoffCannibalizedLosses > 1 ? 'es' : ''} from contenders playing each other)`
          : ''
      magicNumberExplanation = `Playoff Magic Number: ${magicNumber}${schedNote}. Needs any combination of ${magicNumber} team wins and ${chaserTeam?.acc.name ?? 'Seed 7'} losses across remaining weeks to guarantee a playoff berth.`
    } else {
      const behindText = gamesBehindCutoff === 0 ? 'tied with' : `${gamesBehindCutoff.toFixed(1)} games behind`
      const schedNote =
        playoffGuaranteedCutoffWins > 0
          ? ` (tightened by ${playoffGuaranteedCutoffWins} game${playoffGuaranteedCutoffWins > 1 ? 's' : ''} because cutoff rivals play each other)`
          : ''
      magicNumberExplanation = `Elimination Number: ${eliminationNumber}${schedNote}. Currently ${behindText} ${cutoffTeam?.acc.name ?? 'Seed 6'}. Any combination of ${eliminationNumber} team losses and ${cutoffTeam?.acc.name ?? 'Seed 6'} wins results in mathematical elimination.`
    }

    let byeExplanation = ''
    if (byeSpots > 0) {
      if (hasClinchedBye) {
        byeExplanation = 'Clinched First-Round Bye. Advances straight to Semifinals.'
      } else if (isEliminatedFromBye) {
        byeExplanation = 'Eliminated from First-Round Bye contention.'
      } else if (seed <= byeSpots && byeMagicNumber !== null) {
        const schedNote =
          byeCannibalizedLosses > 0
            ? ` (already reduced by ${byeCannibalizedLosses} guaranteed loss${byeCannibalizedLosses > 1 ? 'es' : ''} from bye contenders playing each other)`
            : ''
        byeExplanation = `Bye Magic Number: ${byeMagicNumber}${schedNote}. Needs any combination of ${byeMagicNumber} team wins and ${byeChaserTeam?.acc.name ?? 'Seed 3'} losses to secure a top-2 first-round bye.`
      } else {
        const schedNote =
          byeGuaranteedCutoffWins > 0
            ? ` (tightened by ${byeGuaranteedCutoffWins} game${byeGuaranteedCutoffWins > 1 ? 's' : ''} because bye contenders play each other)`
            : ''
        byeExplanation = `Bye Elimination Number: ${byeEliminationNumber}${schedNote}. Trails Seed #2 (${byeCutoffTeam?.acc.name ?? 'Seed 2'}) by ${gamesBehindBye.toFixed(1)} games.`
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
