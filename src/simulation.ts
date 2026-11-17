export interface SimTeamInput {
  rosterId: number
  effectiveWins: number
  pointsFor: number
  weeklyScores: number[]
}

export interface SimScheduleWeek {
  week: number
  pairs: [number, number][]
}

export interface SimOddsResult {
  playoffProbabilities: Map<number, number>
  byeProbabilities: Map<number, number>
}

function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function createPrng(seed: number): () => number {
  let state = seed || 1
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function createNormalSampler(rand: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) {
      const val = spare
      spare = null
      return val
    }
    let u = 0
    let v = 0
    while (u <= 1e-7) u = rand()
    v = rand()
    const mag = Math.sqrt(-2.0 * Math.log(u))
    spare = mag * Math.sin(2.0 * Math.PI * v)
    return mag * Math.cos(2.0 * Math.PI * v)
  }
}

function computeMedian(values: Float64Array, scratch: number[]): number {
  const n = values.length
  if (n === 0) return 0
  for (let i = 0; i < n; i += 1) scratch[i] = values[i]
  scratch.sort((a, b) => a - b)
  const mid = Math.floor(n / 2)
  return n % 2 === 0 ? (scratch[mid - 1] + scratch[mid]) * 0.5 : scratch[mid]
}

/**
 * Runs a deterministic schedule-aware Monte Carlo simulation across all remaining
 * regular-season weeks using each team's historical scoring mean/variance, actual
 * remaining H2H matchups, weekly league median scoring, and PF tiebreakers.
 */
export function simulateSeasonOdds(params: {
  seedKey: string
  teams: SimTeamInput[]
  schedule: SimScheduleWeek[]
  hasMedianMatch: boolean
  playoffSpots: number
  byeSpots: number
  iterations?: number
}): SimOddsResult {
  const {
    seedKey,
    teams,
    schedule,
    hasMedianMatch,
    playoffSpots,
    byeSpots,
    iterations = 5000,
  } = params

  const n = teams.length
  const playoffProbabilities = new Map<number, number>()
  const byeProbabilities = new Map<number, number>()
  if (n === 0) return { playoffProbabilities, byeProbabilities }

  const indexByRoster = new Map<number, number>()
  for (let i = 0; i < n; i += 1) {
    indexByRoster.set(teams[i].rosterId, i)
  }

  // Compute league-wide average score for empirical Bayes shrinkage early in the season
  let leagueScoreSum = 0
  let leagueScoreCount = 0
  for (const t of teams) {
    for (const s of t.weeklyScores) {
      leagueScoreSum += s
      leagueScoreCount += 1
    }
  }
  const leagueMean = leagueScoreCount > 0 ? leagueScoreSum / leagueScoreCount : 115
  const priorVar = 22 * 22

  const means = new Float64Array(n)
  const stdDevs = new Float64Array(n)
  for (let i = 0; i < n; i += 1) {
    const scores = teams[i].weeklyScores
    const count = scores.length
    if (count === 0) {
      means[i] = leagueMean
      stdDevs[i] = 22
      continue
    }
    let sum = 0
    for (let k = 0; k < count; k += 1) sum += scores[k]
    const rawMean = sum / count
    // Shrink small-sample mean slightly toward league mean
    means[i] = (rawMean * count + leagueMean * 1.5) / (count + 1.5)

    let sqDiff = 0
    for (let k = 0; k < count; k += 1) {
      const d = scores[k] - rawMean
      sqDiff += d * d
    }
    const shrunkVar = (sqDiff + 3 * priorVar) / (count + 2)
    stdDevs[i] = Math.min(45, Math.max(10, Math.sqrt(shrunkVar)))
  }

  // Pre-resolve schedule pairs to team indices for tight simulation loop
  const resolvedWeeks: [number, number][][] = schedule.map((w) => {
    const pairs: [number, number][] = []
    for (const [aId, bId] of w.pairs) {
      const ai = indexByRoster.get(aId)
      const bi = indexByRoster.get(bId)
      if (ai !== undefined && bi !== undefined && ai !== bi) {
        pairs.push([ai, bi])
      }
    }
    return pairs
  })

  const rand = createPrng(hashSeed(seedKey))
  const sampleNormal = createNormalSampler(rand)

  const playoffHits = new Int32Array(n)
  const byeHits = new Int32Array(n)
  const simWins = new Float64Array(n)
  const simPf = new Float64Array(n)
  const weekScores = new Float64Array(n)
  const medianScratch = new Array<number>(n)
  const order = Array.from({ length: n }, (_, i) => i)
  const fallbackPool = Array.from({ length: n }, (_, i) => i)

  for (let iter = 0; iter < iterations; iter += 1) {
    for (let i = 0; i < n; i += 1) {
      simWins[i] = teams[i].effectiveWins
      simPf[i] = teams[i].pointsFor
    }

    for (let w = 0; w < resolvedWeeks.length; w += 1) {
      for (let i = 0; i < n; i += 1) {
        const s = Math.max(0, means[i] + stdDevs[i] * sampleNormal())
        weekScores[i] = s
        simPf[i] += s
      }

      const pairs = resolvedWeeks[w]
      if (pairs.length > 0) {
        for (let p = 0; p < pairs.length; p += 1) {
          const a = pairs[p][0]
          const b = pairs[p][1]
          const diff = weekScores[a] - weekScores[b]
          if (Math.abs(diff) < 0.005) {
            simWins[a] += 0.5
            simWins[b] += 0.5
          } else if (diff > 0) {
            simWins[a] += 1
          } else {
            simWins[b] += 1
          }
        }
      } else {
        // Fallback random pairing if a future week has no scheduled matchups populated
        for (let i = n - 1; i > 0; i -= 1) {
          const j = Math.floor(rand() * (i + 1))
          const tmp = fallbackPool[i]
          fallbackPool[i] = fallbackPool[j]
          fallbackPool[j] = tmp
        }
        for (let i = 0; i + 1 < n; i += 2) {
          const a = fallbackPool[i]
          const b = fallbackPool[i + 1]
          if (weekScores[a] > weekScores[b]) simWins[a] += 1
          else if (weekScores[b] > weekScores[a]) simWins[b] += 1
          else {
            simWins[a] += 0.5
            simWins[b] += 0.5
          }
        }
      }

      if (hasMedianMatch && n >= 2) {
        const median = computeMedian(weekScores, medianScratch)
        for (let i = 0; i < n; i += 1) {
          const diff = weekScores[i] - median
          if (Math.abs(diff) < 0.005) simWins[i] += 0.5
          else if (diff > 0) simWins[i] += 1
        }
      }
    }

    order.sort((a, b) => {
      if (simWins[b] !== simWins[a]) return simWins[b] - simWins[a]
      return simPf[b] - simPf[a]
    })

    for (let rank = 0; rank < playoffSpots && rank < n; rank += 1) {
      playoffHits[order[rank]] += 1
    }
    for (let rank = 0; rank < byeSpots && rank < n; rank += 1) {
      byeHits[order[rank]] += 1
    }
  }

  for (let i = 0; i < n; i += 1) {
    playoffProbabilities.set(teams[i].rosterId, playoffHits[i] / iterations)
    byeProbabilities.set(teams[i].rosterId, byeSpots > 0 ? byeHits[i] / iterations : 0)
  }

  return { playoffProbabilities, byeProbabilities }
}
