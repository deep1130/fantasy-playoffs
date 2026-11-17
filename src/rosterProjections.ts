export interface SleeperPlayer {
  player_id: string
  full_name?: string
  first_name?: string
  last_name?: string
  team?: string | null
  position?: string
  fantasy_positions?: string[]
  injury_status?: string | null
  status?: string | null
}

export interface FutureWeekProjectionFeed {
  week: number
  projections: Record<string, Record<string, number>>
  byes: string[]
}

const SLEEPER_API = 'https://api.sleeper.app/v1'
const PLAYER_CACHE_KEY = 'fantasy-playoffs-player-index-v1'
const PLAYER_CACHE_MAX_AGE = 24 * 60 * 60 * 1000

const ESPN_TO_SLEEPER_TEAM: Record<string, string> = {
  WSH: 'WAS',
  JAC: 'JAX',
  LA: 'LAR',
}

const NON_STARTER_SLOTS = new Set(['BN', 'IR', 'TAXI', 'RESERVE'])

const FLEX_ELIGIBILITY: Record<string, readonly string[]> = {
  FLEX: ['RB', 'WR', 'TE'],
  REC_FLEX: ['WR', 'TE'],
  WRRB_FLEX: ['RB', 'WR'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
  IDP_FLEX: ['DL', 'LB', 'DB'],
}

export function normalizeTeam(abbr?: string | null): string | undefined {
  if (!abbr) return undefined
  return ESPN_TO_SLEEPER_TEAM[abbr] ?? abbr
}

export function scoreStatLine(
  stats: Record<string, number> | undefined,
  scoring: Record<string, number>,
): number {
  if (!stats) return 0
  let total = 0
  let matched = false
  for (const [k, v] of Object.entries(stats)) {
    if (typeof v === 'number' && Number.isFinite(v) && typeof scoring[k] === 'number') {
      total += v * scoring[k]
      matched = true
    }
  }
  if (matched) return Math.max(0, total)
  return Math.max(0, Number(stats.pts_ppr ?? stats.pts_half_ppr ?? stats.pts_std) || 0)
}

function compactPlayerIndex(raw: Record<string, SleeperPlayer>): Record<string, SleeperPlayer> {
  const compact: Record<string, SleeperPlayer> = {}
  for (const [id, p] of Object.entries(raw)) {
    if (!p) continue
    const entry: SleeperPlayer = { player_id: id }
    if (p.full_name) {
      entry.full_name = p.full_name
    } else {
      if (p.first_name) entry.first_name = p.first_name
      if (p.last_name) entry.last_name = p.last_name
    }
    if (p.team) entry.team = p.team
    if (p.position) entry.position = p.position
    if (p.fantasy_positions?.length) entry.fantasy_positions = p.fantasy_positions
    if (p.injury_status) entry.injury_status = p.injury_status
    if (p.status) entry.status = p.status
    compact[id] = entry
  }
  return compact
}

export async function getPlayerIndex(signal?: AbortSignal): Promise<Record<string, SleeperPlayer>> {
  try {
    if (typeof window !== 'undefined') {
      const stored = window.localStorage.getItem(PLAYER_CACHE_KEY)
      if (stored) {
        const cached = JSON.parse(stored) as { savedAt: number; players: Record<string, SleeperPlayer> }
        if (Date.now() - cached.savedAt < PLAYER_CACHE_MAX_AGE && cached.players) {
          return cached.players
        }
      }
    }
  } catch {
    // Ignore invalid cache entries
  }

  const response = await fetch(`${SLEEPER_API}/players/nfl?active=true`, { signal })
  if (!response.ok) {
    throw new Error(`Player index request failed (${response.status})`)
  }
  const rawPlayers = (await response.json()) as Record<string, SleeperPlayer>
  const players = compactPlayerIndex(rawPlayers)
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        PLAYER_CACHE_KEY,
        JSON.stringify({ savedAt: Date.now(), players }),
      )
    }
  } catch {
    // Ignore storage quota errors
  }
  return players
}

function playerFitsSlot(player: SleeperPlayer | undefined, slot: string): boolean {
  const positions = player?.fantasy_positions?.length
    ? player.fantasy_positions
    : player?.position
      ? [player.position]
      : []
  if (positions.includes(slot)) return true
  const allowed = FLEX_ELIGIBILITY[slot]
  return allowed ? allowed.some((pos) => positions.includes(pos)) : false
}

export function selectOptimalLineup(
  candidates: readonly { player: SleeperPlayer | undefined; points: number }[],
  slots: readonly string[],
): number {
  const numSlots = slots.length
  if (!numSlots || !candidates.length) return 0

  const sorted = [...candidates]
    .filter((item) => item.points > 0)
    .sort((a, b) => b.points - a.points)

  if (!sorted.length) return 0

  const matchSlot = new Int32Array(numSlots).fill(-1)
  const visited = new Uint8Array(numSlots)
  const candSlots: number[][] = []

  function tryAugment(candIdx: number): boolean {
    let eligible = candSlots[candIdx]
    if (!eligible) {
      eligible = []
      const player = sorted[candIdx].player
      for (let s = 0; s < numSlots; s += 1) {
        if (playerFitsSlot(player, slots[s])) eligible.push(s)
      }
      candSlots[candIdx] = eligible
    }
    for (let i = 0; i < eligible.length; i += 1) {
      const s = eligible[i]
      if (matchSlot[s] === -1) {
        matchSlot[s] = candIdx
        return true
      }
    }
    for (let i = 0; i < eligible.length; i += 1) {
      const s = eligible[i]
      if (visited[s]) continue
      visited[s] = 1
      if (tryAugment(matchSlot[s])) {
        matchSlot[s] = candIdx
        return true
      }
    }
    return false
  }

  let matchedCount = 0
  let total = 0
  for (let candIdx = 0; candIdx < sorted.length && matchedCount < numSlots; candIdx += 1) {
    visited.fill(0)
    if (tryAugment(candIdx)) {
      matchedCount += 1
      total += sorted[candIdx].points
    }
  }
  return total
}

type InjuryTier = 'healthy' | 'probable' | 'questionable' | 'doubtful' | 'out' | 'ir'

function classifyInjury(player?: SleeperPlayer): InjuryTier {
  const inj = (player?.injury_status ?? '').trim().toLowerCase()
  const status = (player?.status ?? '').trim().toLowerCase()
  if (/\bir\b|injured reserve|pup|\bnfi\b/.test(inj)) return 'ir'
  if (/\bout\b|\bsus\b|suspended|\bcov\b|\bdnr\b|\bna\b/.test(inj)) return 'out'
  if (inj.includes('doubtful')) return 'doubtful'
  if (inj.includes('questionable')) return 'questionable'
  if (inj.includes('probable')) return 'probable'
  if (status === 'inactive' && inj) return 'out'
  return 'healthy'
}

function injuryFactorForWeek(tier: InjuryTier, weeksOut: number): number {
  switch (tier) {
    case 'ir':
      return 0
    case 'out':
      return weeksOut === 0 ? 0 : weeksOut === 1 ? 0.35 : 0.75
    case 'doubtful':
      return weeksOut === 0 ? 0.2 : 0.85
    case 'questionable':
      return weeksOut === 0 ? 0.78 : 0.95
    case 'probable':
      return 0.97
    default:
      return 1
  }
}

export function projectRosterWeeks(params: {
  rosterPositions?: string[]
  scoringSettings: Record<string, number>
  rosters: readonly {
    roster_id: number
    players: string[] | null
    taxi?: string[] | null
    reserve?: string[] | null
  }[]
  players?: Record<string, SleeperPlayer>
  futureWeeks?: Record<number, FutureWeekProjectionFeed>
  weeks: readonly number[]
}): Map<number, (number | undefined)[]> {
  const result = new Map<number, (number | undefined)[]>()
  const { rosterPositions, scoringSettings, rosters, players, futureWeeks, weeks } = params
  if (!players || !futureWeeks || !rosterPositions?.length || !weeks.length) {
    return result
  }

  const starterSlots = rosterPositions.filter((slot) => !NON_STARTER_SLOTS.has(slot))
  if (!starterSlots.length) return result

  for (const roster of rosters) {
    const taxiSet = new Set(roster.taxi ?? [])
    const reserveSet = new Set(roster.reserve ?? [])
    const activeIds = (roster.players ?? []).filter((pid) => pid && !taxiSet.has(pid))
    const weeklyTotals: (number | undefined)[] = weeks.map((week, idx) => {
      const feed = futureWeeks[week]
      if (!feed) return undefined
      const byeSet = new Set(feed.byes)
      const candidates = activeIds.map((pid) => {
        const player = players[pid]
        const team = normalizeTeam(player?.team)
        if (team && byeSet.has(team)) {
          return { player, points: 0 }
        }
        const rawProj = scoreStatLine(feed.projections[pid], scoringSettings)
        if (rawProj <= 0) return { player, points: 0 }
        const tier = reserveSet.has(pid) ? 'ir' : classifyInjury(player)
        return {
          player,
          points: rawProj * injuryFactorForWeek(tier, idx),
        }
      })
      const total = selectOptimalLineup(candidates, starterSlots)
      return total > 0 ? total : undefined
    })
    result.set(roster.roster_id, weeklyTotals)
  }

  return result
}
