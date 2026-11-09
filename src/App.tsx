import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Crown,
  Flame,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Target,
  Trophy,
  Zap,
} from 'lucide-react'
import {
  analyzeLeagueClinch,
  type LeagueClinchSummary,
  type TeamClinchProfile,
} from './clinch'
import { getDemoLeagueData } from './demoData'
import { loadLeagueData, type LeagueData } from './sleeper'
import './App.css'

type MainTab = 'clinch' | 'whatif'

const formatDec = (val: number, decimals = 1) =>
  val.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })

const formatPct = (chance: number) => {
  if (chance >= 0.99) return '>99%'
  if (chance <= 0.01 && chance > 0) return '<1%'
  if (chance === 0) return '0%'
  return `${Math.round(chance * 100)}%`
}

function getInitialLeagueId(): string {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search)
    const fromQuery = params.get('league') || params.get('leagueId')
    if (fromQuery && fromQuery.trim()) return fromQuery.trim()
    const fromHash = window.location.hash.replace(/^#\/?/, '').trim()
    if (fromHash && /^\d+$/.test(fromHash)) return fromHash
    const saved = localStorage.getItem('last_playoffs_league_id')
    if (saved && saved.trim() && !saved.startsWith('demo')) return saved.trim()
  }
  return ''
}

function getInitialTab(): MainTab {
  if (typeof window !== 'undefined') {
    const fromQuery = new URLSearchParams(window.location.search).get('tab')
    if (fromQuery === 'whatif') {
      return 'whatif'
    }
  }
  return 'clinch'
}

export function App() {
  const initialId = useMemo(getInitialLeagueId, [])
  const initialTab = useMemo(getInitialTab, [])
  const [leagueId, setLeagueId] = useState(initialId)
  const [data, setData] = useState<LeagueData | null>(null)
  const [busy, setBusy] = useState(Boolean(initialId))
  const [error, setError] = useState('')
  const [tab, setTab] = useState<MainTab>(initialTab)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [includeLiveWeek, setIncludeLiveWeek] = useState<boolean>(false)
  const [selectedTeamRosterId, setSelectedTeamRosterId] = useState<number | null>(null)

  // What-If Machine State
  const [simSelectedWeek, setSimSelectedWeek] = useState<number>(9)
  const [simMatchupWinners, setSimMatchupWinners] = useState<Record<number, Record<number, number>>>({})
  const [simMedianWinners, setSimMedianWinners] = useState<Record<number, Record<number, boolean>>>({})

  async function refresh(targetId?: string) {
    const activeId = (targetId ?? leagueId).trim()
    if (!activeId) {
      setData(null)
      setBusy(false)
      setError('')
      return
    }

    setBusy(true)
    setError('')
    try {
      if (activeId === 'demo' || activeId === 'demo-median-league') {
        const demo = getDemoLeagueData()
        setData(demo)
        setLastUpdated(Date.now())
        return
      }
      const nextData = await loadLeagueData(activeId)
      setData(nextData)
      setLastUpdated(Date.now())
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.set('league', activeId)
        window.history.replaceState({}, '', url.toString())
        localStorage.setItem('last_playoffs_league_id', activeId)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load league data from Sleeper.')
    } finally {
      setBusy(false)
    }
  }

  function handleLoadDemo() {
    setLeagueId('demo')
    const demo = getDemoLeagueData()
    setData(demo)
    setLastUpdated(Date.now())
    setError('')
  }

  useEffect(() => {
    const id = getInitialLeagueId()
    if (id) {
      refresh(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const clinchSummary: LeagueClinchSummary | null = useMemo(() => {
    if (!data) return null
    try {
      return analyzeLeagueClinch(data, { includeInProgress: includeLiveWeek })
    } catch (err) {
      console.error('Error analyzing playoff clinches:', err)
      return null
    }
  }, [data, includeLiveWeek])

  // Set default simSelectedWeek when data loads
  const currentWeek = clinchSummary?.currentWeek
  useEffect(() => {
    if (currentWeek) {
      setSimSelectedWeek(currentWeek)
    }
  }, [currentWeek])

  const selectedTeamProfile = useMemo(() => {
    if (!clinchSummary || selectedTeamRosterId === null) return null
    return clinchSummary.teams.find((t) => t.rosterId === selectedTeamRosterId) ?? null
  }, [clinchSummary, selectedTeamRosterId])

  const filteredTeams = useMemo(() => {
    return clinchSummary?.teams ?? []
  }, [clinchSummary])

  // What-If Pick Handlers
  function handlePickWinner(week: number, matchupId: number, winnerRosterId: number) {
    setSimMatchupWinners((prev) => {
      const weekPicks = { ...(prev[week] || {}) }
      if (weekPicks[matchupId] === winnerRosterId) {
        delete weekPicks[matchupId]
      } else {
        weekPicks[matchupId] = winnerRosterId
      }
      return { ...prev, [week]: weekPicks }
    })
  }

  function handleToggleMedian(week: number, rosterId: number) {
    if (!clinchSummary) return
    const maxMedian = Math.floor(clinchSummary.totalTeams / 2)
    setSimMedianWinners((prev) => {
      const weekMedians = { ...(prev[week] || {}) }
      if (weekMedians[rosterId]) {
        delete weekMedians[rosterId]
      } else {
        const currentCount = Object.keys(weekMedians).length
        if (currentCount >= maxMedian) {
          return prev
        }
        weekMedians[rosterId] = true
      }
      return { ...prev, [week]: weekMedians }
    })
  }

  function handleResetSim() {
    setSimMatchupWinners({})
    setSimMedianWinners({})
  }

  function handleAutoPickChalk() {
    if (!clinchSummary || !data) return
    const nextWinners: Record<number, Record<number, number>> = {}
    const nextMedians: Record<number, Record<number, boolean>> = {}
    const maxMedian = Math.floor(clinchSummary.totalTeams / 2)

    for (let w = clinchSummary.currentWeek; w <= clinchSummary.regularSeasonEnd; w += 1) {
      const feed = data.weeks[w]
      if (!feed) continue
      const weekWinners: Record<number, number> = {}
      const weekMedians: Record<number, boolean> = {}

      const pairs = new Map<number, typeof feed.matchups>()
      for (const m of feed.matchups) {
        if (m.matchup_id != null) {
          const list = pairs.get(m.matchup_id) || []
          list.push(m)
          pairs.set(m.matchup_id, list)
        }
      }

      for (const [matchupId, pair] of pairs.entries()) {
        if (pair.length < 2) continue
        const t1 = clinchSummary.teams.find((t) => t.rosterId === pair[0].roster_id)
        const t2 = clinchSummary.teams.find((t) => t.rosterId === pair[1].roster_id)
        if (!t1 || !t2) continue
        const winner = t1.seed < t2.seed ? t1 : t2
        weekWinners[matchupId] = winner.rosterId
      }

      if (clinchSummary.hasMedianMatch) {
        for (const t of clinchSummary.teams) {
          if (t.seed <= maxMedian) {
            weekMedians[t.rosterId] = true
          }
        }
      }

      nextWinners[w] = weekWinners
      nextMedians[w] = weekMedians
    }

    setSimPicksState({
      matchupWinners: nextWinners,
      medianBeaters: nextMedians,
    })
  }

  function setSimPicksState(picks: {
    matchupWinners: Record<number, Record<number, number>>
    medianBeaters: Record<number, Record<number, boolean>>
  }) {
    setSimMatchupWinners(picks.matchupWinners)
    setSimMedianWinners(picks.medianBeaters)
  }

  // Count picks made
  const totalSimPicksMade = useMemo(() => {
    let count = 0
    for (const weekMatchups of Object.values(simMatchupWinners)) {
      count += Object.keys(weekMatchups).length
    }
    for (const weekMedians of Object.values(simMedianWinners)) {
      count += Object.keys(weekMedians).length
    }
    return count
  }, [simMatchupWinners, simMedianWinners])

  // Compute simulated standings
  const simulatedTeams = useMemo(() => {
    if (!clinchSummary || !data) return []

    const teamStats = new Map<
      number,
      {
        totalWins: number
        totalLosses: number
        h2hWins: number
        h2hLosses: number
        medianWins: number
        medianLosses: number
        simWinsAdded: number
        simLossesAdded: number
      }
    >()

    for (const t of clinchSummary.teams) {
      teamStats.set(t.rosterId, {
        totalWins: t.totalWins,
        totalLosses: t.totalLosses,
        h2hWins: t.h2hWins,
        h2hLosses: t.h2hLosses,
        medianWins: t.medianWins,
        medianLosses: t.medianLosses,
        simWinsAdded: 0,
        simLossesAdded: 0,
      })
    }

    for (const [weekStr, weekMatchups] of Object.entries(simMatchupWinners)) {
      const week = Number(weekStr)
      const feed = data.weeks[week]
      if (!feed) continue

      for (const [matchupIdStr, winnerId] of Object.entries(weekMatchups)) {
        const matchupId = Number(matchupIdStr)
        const pair = feed.matchups.filter((m) => m.matchup_id === matchupId)
        if (pair.length < 2) continue
        const loser = pair.find((m) => m.roster_id !== winnerId)
        if (!loser) continue

        const wStat = teamStats.get(winnerId)
        if (wStat) {
          wStat.totalWins += 1
          wStat.h2hWins += 1
          wStat.simWinsAdded += 1
        }
        const lStat = teamStats.get(loser.roster_id)
        if (lStat) {
          lStat.totalLosses += 1
          lStat.h2hLosses += 1
          lStat.simLossesAdded += 1
        }
      }
    }

    if (clinchSummary.hasMedianMatch) {
      const maxMedian = Math.floor(clinchSummary.totalTeams / 2)
      for (const [, weekMedians] of Object.entries(simMedianWinners)) {
        const isWeekFull = Object.keys(weekMedians).length >= maxMedian
        for (const t of clinchSummary.teams) {
          const stat = teamStats.get(t.rosterId)
          if (!stat) continue
          if (weekMedians[t.rosterId]) {
            stat.totalWins += 1
            stat.medianWins += 1
            stat.simWinsAdded += 1
          } else if (isWeekFull) {
            stat.totalLosses += 1
            stat.medianLosses += 1
            stat.simLossesAdded += 1
          }
        }
      }
    }

    const result = clinchSummary.teams.map((original) => {
      const stats = teamStats.get(original.rosterId) ?? {
        totalWins: original.totalWins,
        totalLosses: original.totalLosses,
        h2hWins: original.h2hWins,
        h2hLosses: original.h2hLosses,
        medianWins: original.medianWins,
        medianLosses: original.medianLosses,
        simWinsAdded: 0,
        simLossesAdded: 0,
      }
      return {
        ...original,
        simTotalWins: stats.totalWins,
        simTotalLosses: stats.totalLosses,
        simH2hWins: stats.h2hWins,
        simH2hLosses: stats.h2hLosses,
        simMedianWins: stats.medianWins,
        simMedianLosses: stats.medianLosses,
        simWinsAdded: stats.simWinsAdded,
        simLossesAdded: stats.simLossesAdded,
        originalSeed: original.seed,
      }
    })

    result.sort((a, b) => b.simTotalWins - a.simTotalWins || b.pointsFor - a.pointsFor)

    return result.map((t, idx) => ({
      ...t,
      simSeed: idx + 1,
      seedDelta: t.originalSeed - (idx + 1),
    }))
  }, [clinchSummary, data, simMatchupWinners, simMedianWinners])

  const totalTeams = clinchSummary?.totalTeams ?? 0
  const playoffSpots = clinchSummary?.playoffSpots ?? 6
  const byeSpots = clinchSummary?.byeSpots ?? 2
  const hasMedian = clinchSummary?.hasMedianMatch ?? false

  const seed1 = clinchSummary?.teams[0]
  const seed2 = clinchSummary?.teams[1]
  const seed3 = clinchSummary?.teams[2]
  const seed6 = clinchSummary?.teams[playoffSpots - 1]
  const seed7 = clinchSummary?.teams[playoffSpots]

  function renderStatusPill(team: TeamClinchProfile) {
    if (team.hasClinchedBye) {
      return (
        <span className="status-pill status-clinched-bye" title="Clinched top-2 first round bye">
          <Crown size={11} /> Clinched Bye
        </span>
      )
    }
    if (team.hasClinchedPlayoff) {
      return (
        <span className="status-pill status-clinched-playoff" title="Clinched top-6 playoff spot">
          <Check size={11} /> Clinched Playoff
        </span>
      )
    }
    if (team.isEliminatedFromPlayoffs) {
      return (
        <span className="status-pill status-eliminated" title="Mathematically eliminated from playoffs">
          Eliminated
        </span>
      )
    }
    if (team.status === 'BYE_FAVORITE') {
      return (
        <span className="status-pill status-in-control" title="Holding a top-2 first round bye seed">
          <Crown size={11} /> {team.statusLabel}
        </span>
      )
    }
    if (team.status === 'IN_CONTROL') {
      return (
        <span className="status-pill status-in-control" title="Strong playoff position">
          <ShieldCheck size={11} /> In Control
        </span>
      )
    }
    if (team.status === 'IN_THE_HUNT') {
      return (
        <span className="status-pill status-in-the-hunt" title="Solid playoff contention">
          <Target size={11} /> In The Hunt
        </span>
      )
    }
    if (team.status === 'ON_THE_BUBBLE') {
      return (
        <span className="status-pill status-on-the-bubble" title="Hovering near the playoff cutoff line">
          <Clock3 size={11} /> {team.statusLabel}
        </span>
      )
    }
    return (
      <span className="status-pill status-work-to-do" title="Needs outside help to make playoffs">
        Work To Do
      </span>
    )
  }

  function renderMobileTeamCard(team: TeamClinchProfile) {
    const isBye = team.seed <= byeSpots
    const isPlayoff = team.seed <= playoffSpots

    const playoffPrimary = team.hasClinchedPlayoff
      ? 'Clinched'
      : team.isEliminatedFromPlayoffs
      ? 'Eliminated'
      : team.magicNumber !== null
      ? `Magic #${team.magicNumber}`
      : team.eliminationNumber !== null
      ? `Elim #${team.eliminationNumber}`
      : '—'

    const playoffSub = team.hasClinchedPlayoff
      ? 'Top 6 Locked'
      : team.isEliminatedFromPlayoffs
      ? `Max ${team.maxPossibleWins}W`
      : team.fastestPlayoffClinchWeek
      ? `Lock: Wk ${team.fastestPlayoffClinchWeek}`
      : team.fastestPlayoffElimWeek
      ? `Elim: Wk ${team.fastestPlayoffElimWeek}`
      : `Max ${team.maxPossibleWins}W`

    const byePrimary = team.hasClinchedBye
      ? 'Clinched'
      : team.isEliminatedFromBye
      ? 'Out'
      : team.byeMagicNumber !== null
      ? `Magic #${team.byeMagicNumber}`
      : team.byeEliminationNumber !== null
      ? `Elim #${team.byeEliminationNumber}`
      : '—'

    const byeSub = team.hasClinchedBye
      ? 'Top 2 Locked'
      : team.isEliminatedFromBye
      ? 'Out of Top 2'
      : team.fastestByeClinchWeek
      ? `Lock: Wk ${team.fastestByeClinchWeek}`
      : team.fastestByeElimWeek
      ? `Elim: Wk ${team.fastestByeElimWeek}`
      : `${formatPct(team.byeProbability)} Bye`

    return (
      <div
        key={team.rosterId}
        className={`m-standings-card ${isBye ? 'bye-card' : isPlayoff ? 'playoff-card' : 'lottery-card'}`}
        onClick={() => setSelectedTeamRosterId(team.rosterId)}
        title="Tap to view clinch path and scenarios"
      >
        <div className="m-card-header">
          <div className="m-card-identity">
            <span className="m-card-rank">#{team.seed}</span>
            {team.avatarUrl ? (
              <img
                src={team.avatarUrl}
                alt={team.name}
                className="team-avatar"
                loading="lazy"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : (
              <div className="team-avatar-fallback">
                {team.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div className="team-meta">
              <span className="team-title">{team.name}</span>
              <span className="team-sub">{team.ownerDisplayName}</span>
            </div>
          </div>
          {renderStatusPill(team)}
        </div>

        {hasMedian && (
          <div className="m-card-records-strip">
            <div className="m-record-chip">
              <span className="m-chip-lbl">Head to Head:</span>
              <span className="m-chip-val">{team.h2hWins}–{team.h2hLosses}</span>
            </div>
            <div className="m-record-chip">
              <span className="m-chip-lbl">Median:</span>
              <span className="m-chip-val">{team.medianWins}–{team.medianLosses}</span>
            </div>
          </div>
        )}

        <div className="m-card-metrics-grid">
          <div className="m-metric-cell highlight">
            <span className="m-metric-label">ACTUAL W–L</span>
            <strong className="m-metric-val accent">
              {team.totalWins}–{team.totalLosses}
            </strong>
            <span className="m-metric-sub">
              {Math.round(team.winPercentage * 100)}% win rate
            </span>
          </div>

          <div className="m-metric-cell">
            <span className="m-metric-label">PLAYOFF CLINCH</span>
            <strong className="m-metric-val">{playoffPrimary}</strong>
            <span className="m-metric-sub">{playoffSub}</span>
          </div>

          <div className="m-metric-cell">
            <span className="m-metric-label">BYE RACE (TOP 2)</span>
            <strong className="m-metric-val">{byePrimary}</strong>
            <span className="m-metric-sub">{byeSub}</span>
          </div>

          <div className="m-metric-cell">
            <span className="m-metric-label">PLAYOFF ODDS</span>
            <strong className="m-metric-val">{formatPct(team.playoffProbability)}</strong>
            <span className="m-metric-sub">{formatPct(team.byeProbability)} Bye</span>
          </div>

          <div className="m-metric-cell">
            <span className="m-metric-label">WIN RANGE</span>
            <strong className="m-metric-val">
              {team.minPossibleWins}–{team.maxPossibleWins} W
            </strong>
            <span className="m-metric-sub">Floor – Ceiling</span>
          </div>

          <div className="m-metric-cell">
            <span className="m-metric-label">POINTS FOR</span>
            <strong className="m-metric-val">{formatDec(team.pointsFor, 1)}</strong>
            <span className="m-metric-sub">Tiebreaker</span>
          </div>
        </div>

        <div className="m-card-action-footer">
          <span>Tap for Clinch Scenarios, Weekly Matrix &amp; Schedule</span>
          <span className="m-card-action-cta">View Path →</span>
        </div>
      </div>
    )
  }

  function renderMobileSimTeamCard(team: (typeof simulatedTeams)[number], idx: number) {
    const isBye = idx < byeSpots
    const isPlayoff = idx < playoffSpots
    return (
      <div
        key={team.rosterId}
        className={`m-standings-card ${isBye ? 'bye-card' : isPlayoff ? 'playoff-card' : 'lottery-card'}`}
      >
        <div className="m-card-header">
          <div className="m-card-identity">
            <span className="m-card-rank">#{idx + 1}</span>
            <div className="team-meta">
              <span className="team-title">{team.name}</span>
              <span className="team-sub">Originally Seed #{team.originalSeed}</span>
            </div>
          </div>
          <div>
            {isBye ? (
              <span className="status-pill status-clinched-bye">
                <Crown size={11} /> Round 1 Bye (Seed #{idx + 1})
              </span>
            ) : isPlayoff ? (
              <span className="status-pill status-clinched-playoff">
                <Check size={11} /> Playoff Seed #{idx + 1}
              </span>
            ) : (
              <span className="status-pill status-eliminated">Out of Field</span>
            )}
          </div>
        </div>

        <div className="m-card-metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
          <div className="m-metric-cell highlight">
            <span className="m-metric-label">SIM W–L</span>
            <strong className="m-metric-val accent">
              {team.simTotalWins}–{team.simTotalLosses}
            </strong>
            <span className="m-metric-sub">+{team.simWinsAdded}W from picks</span>
          </div>
          <div className="m-metric-cell">
            <span className="m-metric-label">SEED SHIFT</span>
            <strong className="m-metric-val">
              {team.seedDelta > 0 ? `+${team.seedDelta}` : team.seedDelta < 0 ? `${team.seedDelta}` : 'Even'}
            </strong>
            <span className="m-metric-sub">From Seed #{team.originalSeed}</span>
          </div>
          <div className="m-metric-cell">
            <span className="m-metric-label">POINTS FOR</span>
            <strong className="m-metric-val">{formatDec(team.pointsFor, 1)}</strong>
            <span className="m-metric-sub">Tiebreaker</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <main className="app-shell">
      {/* Top Bar (matching fantasy-expected-wins style) */}
      <header className="topbar">
        <a href="#top" className="brand" title="Fantasy Playoffs">
          <span className="brand-mark" style={{ background: '#38bdf8', color: '#0a0b0d' }}>
            <Trophy size={16} strokeWidth={2.5} />
          </span>
          <span>FANTASY<span className="brand-light">PLAYOFFS</span></span>
        </a>
        <div className="topbar-right">
          <span className="season-label">
            {clinchSummary ? `${clinchSummary.season} · ${hasMedian ? 'H2H + MEDIAN (2W/WK)' : 'H2H ONLY'}` : 'SLEEPER FANTASY'}
          </span>
          <span className="live-dot" />
          <span className="live-label">LIVE DATA</span>
        </div>
      </header>

      {/* Intro & League Input (matching fantasy-expected-wins style) */}
      <section className="intro" id="top">
        <div>
          <p className="eyebrow">
            PLAYOFF CLINCH &amp; BYE INTELLIGENCE <span>·</span> {clinchSummary ? clinchSummary.leagueName.toUpperCase() : 'SLEEPER ANALYTICS'}
          </p>
          <h1>
            The Playoff Race <em>&amp; Bye Hunt</em>
          </h1>
          <p className="intro-copy">
            Exact magic numbers to lock a First-Round Bye (Top 2) and Playoff Spot (Top 6), with full calculation support for weekly league scoring median.
          </p>
        </div>

        <div className="league-control">
          <label htmlFor="league-id">SLEEPER LEAGUE ID</label>
          <div className="league-input-row">
            <input
              id="league-id"
              type="text"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') refresh()
              }}
              placeholder="e.g. 1329251955255574528"
              aria-label="Sleeper League ID"
              disabled={busy}
            />
            <button
              type="button"
              className={`share-button ${copied ? 'copied' : ''}`}
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.href)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }
              }}
              title="Copy shareable link"
              disabled={busy || !leagueId.trim()}
            >
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
            <button
              type="button"
              className="refresh-button"
              onClick={() => refresh()}
              disabled={busy || !leagueId.trim()}
            >
              <RefreshCw size={13} className={busy ? 'spin' : ''} />
              <span>{busy ? 'Loading…' : 'Refresh'}</span>
            </button>
          </div>
          <div className="refresh-meta">
            <Clock3 size={11} />
            <span>
              {lastUpdated
                ? `UPDATED ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
                : 'ENTER LEAGUE ID AND CLICK REFRESH'}
            </span>
          </div>
        </div>
      </section>

      {/* Error alert */}
      {error && (
        <div className="error-banner">
          <CircleAlert size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 4 Summary Cards (matching fantasy-expected-wins style) */}
      <section className="summary-strip">
        <div className="summary-item">
          <span className="summary-label">
            <Trophy size={11} className="label-icon" /> LEAGUE &amp; FORMAT
          </span>
          <strong>{clinchSummary ? clinchSummary.leagueName : '--'}</strong>
          <span className="summary-note">
            {clinchSummary
              ? `${clinchSummary.totalTeams} Teams · ${hasMedian ? '2 Wins/Wk (H2H + Median)' : '1 Win/Wk (H2H Only)'}`
              : 'Enter Sleeper League ID above'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <Clock3 size={11} className="label-icon" /> SEASON PROGRESS
          </span>
          <strong>
            {clinchSummary
              ? clinchSummary.isUsingLiveWeek
                ? `WEEK ${clinchSummary.inProgressWeek} OF ${clinchSummary.regularSeasonEnd} (LIVE)`
                : `WEEK ${clinchSummary.lastScoredWeek} OF ${clinchSummary.regularSeasonEnd}`
              : '--'}
          </strong>
          <span className="summary-note">
            {clinchSummary
              ? `${clinchSummary.remainingWeeks} weeks remaining · ${clinchSummary.remainingGamesPerTeam} max wins left`
              : 'Regular season schedule'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <Crown size={11} className="label-icon" style={{ color: '#f59e0b' }} /> FIRST-ROUND BYE (TOP 2)
          </span>
          <strong>
            {seed1 ? (
              <span className="lucky-val">
                #1 {seed1.name}
                <span className="kpi-luck-badge positive">
                  {seed1.totalWins}–{seed1.totalLosses}
                </span>
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed2 && seed3
              ? `#2 ${seed2.name} (${seed2.totalWins}–${seed2.totalLosses}) leads #3 ${seed3.name} (${seed3.totalWins}–${seed3.totalLosses})`
              : 'Seeds 1 & 2 earn bye to semifinals'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <ShieldAlert size={11} className="label-icon" style={{ color: '#fbbf24' }} /> PLAYOFF BUBBLE (SEED 6 vs 7)
          </span>
          <strong>
            {seed6 ? (
              <span className="unlucky-val">
                #6 {seed6.name}
                <span className="kpi-luck-badge positive">
                  {seed6.totalWins}–{seed6.totalLosses}
                </span>
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed6 && seed7
              ? seed6.totalWins === seed7.totalWins
                ? `Tied with #7 ${seed7.name} (${seed7.totalWins}–${seed7.totalLosses}) · +${formatDec(seed6.pointsFor - seed7.pointsFor, 1)} PF`
                : `Leads #7 ${seed7.name} (${seed7.totalWins}–${seed7.totalLosses}) · Magic #${seed6.magicNumber}`
              : 'Cutoff between playoffs and lottery'}
          </span>
        </div>
      </section>

      {/* Live in-progress week banner & toggle (matches fantasy-expected-wins) */}
      {clinchSummary && clinchSummary.inProgressWeek != null && (
        <div className="live-week-banner">
          <div className="live-week-info">
            <span className="live-dot" />
            <div className="live-week-text">
              <strong>Week {clinchSummary.inProgressWeek} Games In Progress</strong>
              <span>
                {clinchSummary.isUsingLiveWeek
                  ? `Standings currently include live projected scores from Week ${clinchSummary.inProgressWeek} (games not final).`
                  : `Standings show official finalized results through Week ${clinchSummary.lastScoredWeek} (games not final).`}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={`live-toggle-button ${clinchSummary.isUsingLiveWeek ? 'active' : ''}`}
            onClick={() => setIncludeLiveWeek(!includeLiveWeek)}
          >
            <Flame size={13} />
            <span>{clinchSummary.isUsingLiveWeek ? 'Switch to Official Finalized' : `Include Live Week ${clinchSummary.inProgressWeek} Scores`}</span>
          </button>
        </div>
      )}

      {/* Main Board Section */}
      <section className="main-board-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              POSTSEASON INTELLIGENCE <span>·</span> {clinchSummary ? `${totalTeams} TEAMS` : 'PLAYOFF RACE'}
            </p>
            <h2>
              {tab === 'clinch' && 'Playoff Standings & Clinch Math'}
              {tab === 'whatif' && 'Interactive What-If Playoff Machine'}
            </h2>
          </div>

          <div className="board-tools">
            <div className="view-tabs" role="tablist">
              <button
                type="button"
                className={tab === 'clinch' ? 'selected' : ''}
                onClick={() => setTab('clinch')}
              >
                <Trophy size={12} />
                <span>Standings</span>
              </button>
              <button
                type="button"
                className={tab === 'whatif' ? 'selected' : ''}
                onClick={() => setTab('whatif')}
              >
                <Flame size={12} />
                <span>What-If Machine</span>
              </button>
            </div>
          </div>
        </div>

        {/* VIEW 1: STANDINGS & CLINCH MATH */}
        {tab === 'clinch' && (
          <>
            <div className="board-legend-bar">
              <div className="legend-items">
                <span className="legend-item">
                  <strong>Magic # (M#)</strong> = Any combination of your wins + #7 seed losses needed to lock a Top-6 Playoff spot (or #3 seed losses for a Top-2 Bye).
                </span>
                <span className="legend-sep">·</span>
                <span className="legend-item">
                  <strong>Elim # (E#)</strong> = Combined losses + #6 seed wins that eliminate a team.
                </span>
              </div>
              <span className="legend-click-hint">
                Click any team for Clinch Scenarios &amp; Schedule →
              </span>
            </div>

            <div className="desktop-table-view">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th className="th-rank">#</th>
                      <th>FRANCHISE</th>
                      <th>ACTUAL W–L</th>
                      <th>STATUS</th>
                      <th title="Magic Number (M#) for top 6 to clinch, or Elimination Number (E#) for seeds 7+">PLAYOFF CLINCH</th>
                      <th title="Magic Number (M#) for top 2 to clinch a first-round bye, or Elimination Number (E#) for seeds 3+">BYE RACE (TOP 2)</th>
                      <th title="Mathematical win floor and ceiling across remaining weeks">WIN RANGE</th>
                      <th title="Playoff and First-Round Bye probabilities">POSTSEASON ODDS</th>
                      <th title="Total Starter Points For (Primary Tiebreaker)">POINTS FOR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {busy && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', font: '600 12px var(--mono)' }}>
                            <RefreshCw size={14} className="spin" />
                            <span>Loading Sleeper league playoff data...</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!busy && filteredTeams.length === 0 && (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--muted)', font: '12px var(--mono)' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '12px' }}>
                            <span>Enter a Sleeper League ID above to decode playoff clinches.</span>
                            <button type="button" className="view-path-btn" onClick={handleLoadDemo}>
                              Try Demo League →
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                    {!busy && filteredTeams.map((team) => {
                      const isByeRow = team.seed <= byeSpots
                      const isPlayoffRow = team.seed <= playoffSpots
                      const showByeDivider = team.seed === byeSpots
                      const showPlayoffDivider = team.seed === playoffSpots

                      const playoffPrimary = team.hasClinchedPlayoff
                        ? 'Clinched'
                        : team.isEliminatedFromPlayoffs
                        ? 'Eliminated'
                        : team.magicNumber !== null
                        ? `Magic #${team.magicNumber}`
                        : team.eliminationNumber !== null
                        ? `Elim #${team.eliminationNumber}`
                        : '—'

                      const playoffSub = team.hasClinchedPlayoff
                        ? 'Top 6 Locked'
                        : team.isEliminatedFromPlayoffs
                        ? `Max ${team.maxPossibleWins}W`
                        : team.fastestPlayoffClinchWeek
                        ? `Earliest Lock: Wk ${team.fastestPlayoffClinchWeek}`
                        : team.fastestPlayoffElimWeek
                        ? `Earliest Elim: Wk ${team.fastestPlayoffElimWeek}`
                        : '—'

                      const byePrimary = team.hasClinchedBye
                        ? 'Clinched'
                        : team.isEliminatedFromBye
                        ? 'Out'
                        : team.byeMagicNumber !== null
                        ? `Magic #${team.byeMagicNumber}`
                        : team.byeEliminationNumber !== null
                        ? `Elim #${team.byeEliminationNumber}`
                        : '—'

                      const byeSub = team.hasClinchedBye
                        ? 'Top 2 Locked'
                        : team.isEliminatedFromBye
                        ? 'Cannot reach Top 2'
                        : team.fastestByeClinchWeek
                        ? `Earliest Lock: Wk ${team.fastestByeClinchWeek}`
                        : team.fastestByeElimWeek
                        ? `Earliest Elim: Wk ${team.fastestByeElimWeek}`
                        : '—'

                      return (
                        <Fragment key={team.rosterId}>
                          <tr
                            className={`standings-row ${isByeRow ? 'bye-row' : isPlayoffRow ? 'playoff-row' : 'lottery-row'}`}
                            onClick={() => setSelectedTeamRosterId(team.rosterId)}
                            style={{ cursor: 'pointer' }}
                            title={`Click to view scenario details and remaining schedule for ${team.name}`}
                          >
                            <td className="td-rank">{team.seed}</td>

                            <td>
                              <div className="team-cell">
                                {team.avatarUrl ? (
                                  <img
                                    src={team.avatarUrl}
                                    alt={team.name}
                                    className="team-avatar"
                                    loading="lazy"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none'
                                    }}
                                  />
                                ) : (
                                  <div className="team-avatar-fallback">
                                    {team.name.charAt(0).toUpperCase()}
                                  </div>
                                )}
                                <div className="team-meta">
                                  <span className="team-title" title={team.name}>
                                    {team.name}
                                  </span>
                                  <span className="team-sub">
                                    {team.ownerDisplayName} <span className="row-click-cue">· View Path →</span>
                                  </span>
                                </div>
                              </div>
                            </td>

                            <td>
                              <div className="stat-primary">
                                <strong>{team.totalWins} – {team.totalLosses}</strong>
                                <span className="stat-sub">
                                  {hasMedian
                                    ? `${team.h2hWins}-${team.h2hLosses} H2H · ${team.medianWins}-${team.medianLosses} Median`
                                    : `${Math.round(team.winPercentage * 100)}% Win Rate`}
                                </span>
                              </div>
                            </td>

                            <td>
                              {renderStatusPill(team)}
                            </td>

                            {/* Playoff Clinch */}
                            <td>
                              <div className="stat-primary">
                                <strong>{playoffPrimary}</strong>
                                <span className="stat-sub">{playoffSub}</span>
                              </div>
                            </td>

                            {/* Bye Race */}
                            <td>
                              <div className="stat-primary">
                                <strong>{byePrimary}</strong>
                                <span className="stat-sub">{byeSub}</span>
                              </div>
                            </td>

                            {/* Win Range */}
                            <td>
                              <div className="stat-primary">
                                <strong>{team.minPossibleWins} – {team.maxPossibleWins} W</strong>
                                <span className="stat-sub">{Math.round(team.winPercentage * 100)}% Win Rate</span>
                              </div>
                            </td>

                            {/* Postseason Odds */}
                            <td>
                              <div className="stat-primary">
                                <strong>{formatPct(team.playoffProbability)} Playoff</strong>
                                <span className="stat-sub">{formatPct(team.byeProbability)} Bye</span>
                              </div>
                            </td>

                            {/* Points For */}
                            <td>
                              <div className="stat-primary">
                                <strong>{formatDec(team.pointsFor, 1)}</strong>
                                <span className="stat-sub">
                                  {team.h2hWins + team.h2hLosses > 0
                                    ? `${formatDec(team.pointsFor / (team.h2hWins + team.h2hLosses), 1)}/wk`
                                    : 'Tiebreaker'}
                                </span>
                              </div>
                            </td>
                          </tr>

                          {showByeDivider && (
                            <tr className="cutoff-line-bye">
                              <td colSpan={9}>
                                TOP 2 SEEDS EARN FIRST-ROUND BYE (ADVANCE TO SEMIFINALS)
                              </td>
                            </tr>
                          )}

                          {showPlayoffDivider && (
                            <tr className="cutoff-line-playoff">
                              <td colSpan={9}>
                                PLAYOFF CUTOFF — TOP 6 SEEDS QUALIFY FOR POSTSEASON
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Adaptive Cards View (<= 820px) */}
            <div className="mobile-cards-view">
              {filteredTeams.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--muted)', font: '12px var(--mono)', background: 'var(--surface)', borderRadius: '8px', border: '1px solid var(--line)' }}>
                  Enter a Sleeper League ID above to decode playoff clinches.
                </div>
              ) : (
                <div className="m-standings-card-list">
                  {filteredTeams.map((team) => (
                    <Fragment key={team.rosterId}>
                      {renderMobileTeamCard(team)}
                      {team.seed === byeSpots && (
                        <div className="m-cutoff-divider bye">
                          <span>TOP 2 SEEDS EARN FIRST-ROUND BYE</span>
                        </div>
                      )}
                      {team.seed === playoffSpots && (
                        <div className="m-cutoff-divider playoff">
                          <span>PLAYOFF CUTOFF — TOP 6 SEEDS QUALIFY</span>
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* VIEW 2: INTERACTIVE WHAT-IF MACHINE */}
        {tab === 'whatif' && (
          <div className="whatif-view">
            <div className="whatif-banner">
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '16px' }}>Interactive Playoff Machine</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '13px' }}>
                  Pick winners for upcoming head-to-head matchups and median outcomes. Standings, seeds, and first-round byes update dynamically in real time.
                </p>
              </div>

              <div className="whatif-actions">
                <span className="picks-count-badge">
                  {totalSimPicksMade} Pick(s) Made
                </span>
                <button
                  type="button"
                  className="chalk-btn"
                  onClick={handleAutoPickChalk}
                  title="Simulate all remaining games by picking higher seeds as winners"
                >
                  <Zap size={13} /> Auto-Pick Higher Seeds
                </button>
                <button
                  type="button"
                  className="reset-btn"
                  onClick={handleResetSim}
                  disabled={totalSimPicksMade === 0}
                >
                  <RotateCcw size={13} /> Reset Picks
                </button>
              </div>
            </div>

            {/* Week Pills for Simulation */}
            <div className="sim-week-tabs">
              <span className="sim-week-label">SELECT WEEK TO SIMULATE:</span>
              {Array.from(
                { length: Math.max(1, (clinchSummary?.regularSeasonEnd ?? 14) - (clinchSummary?.currentWeek ?? 9) + 1) },
                (_, i) => {
                  const w = (clinchSummary?.currentWeek ?? 9) + i
                  const picksInWeek =
                    Object.keys(simMatchupWinners[w] || {}).length +
                    Object.keys(simMedianWinners[w] || {}).length

                  return (
                    <button
                      key={w}
                      type="button"
                      className={`sim-week-pill ${simSelectedWeek === w ? 'selected' : ''}`}
                      onClick={() => setSimSelectedWeek(w)}
                    >
                      <span>WEEK {w}</span>
                      {picksInWeek > 0 && <span className="sim-pill-badge">{picksInWeek}</span>}
                    </button>
                  )
                },
              )}
            </div>

            {/* Matchup Cards for Selected Week */}
            <div className="sim-matchups-section">
              <h4 className="sim-section-title">
                <span>WEEK {simSelectedWeek} MATCHUPS</span>
                <span className="sim-sub">Click a team to pick them as Head-to-Head winner (+1W, -1L to opponent)</span>
              </h4>

              {(() => {
                const weekFeed = data?.weeks[simSelectedWeek]
                const matchups = weekFeed?.matchups || []
                const pairs = new Map<number, typeof matchups>()
                for (const m of matchups) {
                  if (m.matchup_id != null) {
                    const list = pairs.get(m.matchup_id) || []
                    list.push(m)
                    pairs.set(m.matchup_id, list)
                  }
                }

                if (pairs.size === 0) {
                  return (
                    <div className="no-matchups-box">
                      No matchup data found for Week {simSelectedWeek}. Matchups might be scheduled closer to game day.
                    </div>
                  )
                }

                const weekMedianCount = Object.keys(simMedianWinners[simSelectedWeek] || {}).length
                const maxMedianWinners = Math.floor((clinchSummary?.totalTeams ?? 12) / 2)
                const isMedianFull = weekMedianCount >= maxMedianWinners

                return (
                  <div>
                    {hasMedian && (
                      <div className="sim-median-cap-banner">
                        <div className="sim-median-cap-info">
                          <Zap size={14} color="#38bdf8" />
                          <span>
                            Week {simSelectedWeek} Scoring Median: <strong>{weekMedianCount} / {maxMedianWinners} Winners Selected</strong>
                          </span>
                          <span className="median-rule-note">(Strictly 50% of the league beats median)</span>
                        </div>
                        <span className={`sim-median-status-pill ${isMedianFull ? 'full' : ''}`}>
                          {isMedianFull ? `Top Half Full (${maxMedianWinners}/${maxMedianWinners})` : `${maxMedianWinners - weekMedianCount} slots remaining`}
                        </span>
                      </div>
                    )}

                    <div className="matchup-cards-grid">
                      {Array.from(pairs.entries()).map(([matchupId, pair]) => {
                        if (pair.length < 2) return null
                        const t1 = clinchSummary?.teams.find((t) => t.rosterId === pair[0].roster_id)
                        const t2 = clinchSummary?.teams.find((t) => t.rosterId === pair[1].roster_id)
                        if (!t1 || !t2) return null

                        const pickedWinnerId = simMatchupWinners[simSelectedWeek]?.[matchupId]
                        const t1MedianBeater = Boolean(simMedianWinners[simSelectedWeek]?.[t1.rosterId])
                        const t2MedianBeater = Boolean(simMedianWinners[simSelectedWeek]?.[t2.rosterId])
                        const t1Disabled = !t1MedianBeater && isMedianFull
                        const t2Disabled = !t2MedianBeater && isMedianFull

                        return (
                          <div key={matchupId} className="sim-matchup-card">
                            <div className="sim-matchup-header">
                              <span>MATCHUP #{matchupId}</span>
                              <span>WEEK {simSelectedWeek}</span>
                            </div>

                            <div className="sim-teams-row">
                              {/* Team 1 Button */}
                              <button
                                type="button"
                                className={`sim-team-box ${pickedWinnerId === t1.rosterId ? 'winner' : pickedWinnerId === t2.rosterId ? 'loser' : ''}`}
                                onClick={() => handlePickWinner(simSelectedWeek, matchupId, t1.rosterId)}
                              >
                                <div className="sim-team-info">
                                  <span className="sim-team-seed">#{t1.seed}</span>
                                  <span className="sim-team-name">{t1.name}</span>
                                </div>
                                <span className="sim-team-rec">{t1.totalWins}–{t1.totalLosses}</span>
                                {pickedWinnerId === t1.rosterId && (
                                  <span className="sim-win-tag"><Check size={11} /> WIN</span>
                                )}
                              </button>

                              <div className="sim-vs-divider">VS</div>

                              {/* Team 2 Button */}
                              <button
                                type="button"
                                className={`sim-team-box ${pickedWinnerId === t2.rosterId ? 'winner' : pickedWinnerId === t1.rosterId ? 'loser' : ''}`}
                                onClick={() => handlePickWinner(simSelectedWeek, matchupId, t2.rosterId)}
                              >
                                <div className="sim-team-info">
                                  <span className="sim-team-seed">#{t2.seed}</span>
                                  <span className="sim-team-name">{t2.name}</span>
                                </div>
                                <span className="sim-team-rec">{t2.totalWins}–{t2.totalLosses}</span>
                                {pickedWinnerId === t2.rosterId && (
                                  <span className="sim-win-tag"><Check size={11} /> WIN</span>
                                )}
                              </button>
                            </div>

                            {/* Median Scoring Toggles (if median active) */}
                            {hasMedian && (
                              <div className="sim-median-row">
                                <span className="sim-median-title">BEATS WEEKLY MEDIAN:</span>
                                <div className="sim-median-buttons">
                                  <button
                                    type="button"
                                    className={`median-chk ${t1MedianBeater ? 'checked' : ''} ${t1Disabled ? 'disabled' : ''}`}
                                    onClick={() => handleToggleMedian(simSelectedWeek, t1.rosterId)}
                                    disabled={t1Disabled}
                                    title={t1Disabled ? `Maximum ${maxMedianWinners} median winners already selected for Week ${simSelectedWeek}. Uncheck another team first.` : ''}
                                  >
                                    {t1MedianBeater && <Check size={10} />}
                                    <span>{t1.name.slice(0, 10)} (+1W)</span>
                                  </button>
                                  <button
                                    type="button"
                                    className={`median-chk ${t2MedianBeater ? 'checked' : ''} ${t2Disabled ? 'disabled' : ''}`}
                                    onClick={() => handleToggleMedian(simSelectedWeek, t2.rosterId)}
                                    disabled={t2Disabled}
                                    title={t2Disabled ? `Maximum ${maxMedianWinners} median winners already selected for Week ${simSelectedWeek}. Uncheck another team first.` : ''}
                                  >
                                    {t2MedianBeater && <Check size={10} />}
                                    <span>{t2.name.slice(0, 10)} (+1W)</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Live Projected Standings After Simulation */}
            <div className="sim-standings-section">
              <h4 className="sim-section-title">
                <span>PROJECTED PLAYOFF SEEDS AFTER PICKS</span>
                <span className="sim-sub">Standings sorted by projected total wins, then points for tiebreakers</span>
              </h4>

              {/* Desktop Table View (> 820px) */}
              <div className="desktop-table-view">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th className="th-rank">SEED</th>
                        <th>DELTA</th>
                        <th>FRANCHISE</th>
                        <th>PROJECTED RECORD</th>
                        <th>ORIGINAL RECORD</th>
                        <th>POSTSEASON STATUS AFTER PICKS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simulatedTeams.map((team, idx) => {
                        const isBye = idx < byeSpots
                        const isPlayoff = idx < playoffSpots
                        const showByeDivider = idx === byeSpots - 1
                        const showPlayoffDivider = idx === playoffSpots - 1

                        return (
                          <Fragment key={team.rosterId}>
                            <tr className={`standings-row ${isBye ? 'bye-row' : isPlayoff ? 'playoff-row' : 'lottery-row'}`}>
                              <td className="td-rank">{idx + 1}</td>

                              <td>
                                {team.seedDelta > 0 ? (
                                  <span className="delta-pill up">+{team.seedDelta}</span>
                                ) : team.seedDelta < 0 ? (
                                  <span className="delta-pill down">{team.seedDelta}</span>
                                ) : (
                                  <span className="delta-pill same">—</span>
                                )}
                              </td>

                              <td>
                                <div className="team-cell">
                                  {team.avatarUrl ? (
                                    <img
                                      src={team.avatarUrl}
                                      alt={team.name}
                                      className="team-avatar"
                                      loading="lazy"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none'
                                      }}
                                    />
                                  ) : (
                                    <div className="team-avatar-fallback">
                                      {team.name.charAt(0).toUpperCase()}
                                    </div>
                                  )}
                                  <div className="team-meta">
                                    <span className="team-title">{team.name}</span>
                                    <span className="team-sub">{team.ownerDisplayName}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="record-cell">
                                <div className="stat-primary">
                                  <strong style={{ color: team.simWinsAdded > 0 ? '#34d399' : 'var(--ink)' }}>
                                    {team.simTotalWins}–{team.simTotalLosses}
                                  </strong>
                                  {team.simWinsAdded > 0 && (
                                    <span className="stat-sub" style={{ color: '#34d399' }}>
                                      +{team.simWinsAdded}W from simulation
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="record-cell">
                                <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '12px' }}>
                                  {team.totalWins}–{team.totalLosses}
                                </span>
                              </td>

                              <td>
                                {isBye ? (
                                  <span className="status-pill status-clinched-bye">
                                    <Crown size={11} /> Round 1 Bye (Seed #{idx + 1})
                                  </span>
                                ) : isPlayoff ? (
                                  <span className="status-pill status-clinched-playoff">
                                    <Check size={11} /> Playoff Seed #{idx + 1}
                                  </span>
                                ) : (
                                  <span className="status-pill status-eliminated">
                                    Out of Playoff Field
                                  </span>
                                )}
                              </td>
                            </tr>

                            {showByeDivider && (
                              <tr className="cutoff-line-bye">
                                <td colSpan={6}>
                                  TOP 2 SEEDS EARN FIRST-ROUND BYE
                                </td>
                              </tr>
                            )}

                            {showPlayoffDivider && (
                              <tr className="cutoff-line-playoff">
                                <td colSpan={6}>
                                  PLAYOFF CUTOFF — TOP 6 SEEDS QUALIFY
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Adaptive Cards View (<= 820px) */}
              <div className="mobile-cards-view">
                <div className="m-standings-card-list">
                  {simulatedTeams.map((team, idx) => (
                    <Fragment key={team.rosterId}>
                      {renderMobileSimTeamCard(team, idx)}
                      {idx === byeSpots - 1 && (
                        <div className="m-cutoff-divider bye">
                          <span>TOP 2 SEEDS EARN FIRST-ROUND BYE</span>
                        </div>
                      )}
                      {idx === playoffSpots - 1 && (
                        <div className="m-cutoff-divider playoff">
                          <span>PLAYOFF CUTOFF — TOP 6 SEEDS QUALIFY</span>
                        </div>
                      )}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* TEAM CLINCH PATH DRAWER / MODAL */}
      {selectedTeamProfile && (
        <div className="modal-backdrop" onClick={() => setSelectedTeamRosterId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="team-cell">
                {selectedTeamProfile.avatarUrl ? (
                  <img
                    src={selectedTeamProfile.avatarUrl}
                    alt={selectedTeamProfile.name}
                    className="team-avatar"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                ) : (
                  <div className="team-avatar-fallback">
                    {selectedTeamProfile.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>
                    #{selectedTeamProfile.seed} {selectedTeamProfile.name}
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                    {selectedTeamProfile.ownerDisplayName} · {selectedTeamProfile.totalWins}–{selectedTeamProfile.totalLosses} ({selectedTeamProfile.h2hWins}-{selectedTeamProfile.h2hLosses} H2H · {selectedTeamProfile.medianWins}-{selectedTeamProfile.medianLosses} Med)
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setSelectedTeamRosterId(null)}
              >
                Close
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-status-bar">
                <span>POSTSEASON STATUS:</span>
                {renderStatusPill(selectedTeamProfile)}
                <span className="modal-odds">Playoff Odds: {formatPct(selectedTeamProfile.playoffProbability)}</span>
              </div>

              {/* Playoff Clinch / Elimination Path */}
              <div className="modal-info-block">
                <h4>Playoff Clinch &amp; Elimination Intelligence</h4>
                <p>{selectedTeamProfile.magicNumberExplanation}</p>
                {selectedTeamProfile.fastestPlayoffClinchWeek && (
                  <div className="modal-highlight-box">
                    <strong>Earliest Playoff Clinch:</strong> Week {selectedTeamProfile.fastestPlayoffClinchWeek} (in {Math.max(1, selectedTeamProfile.fastestPlayoffClinchWeek - (clinchSummary?.currentWeek ?? 9))} week(s) with optimal results).
                  </div>
                )}
                {selectedTeamProfile.fastestPlayoffElimWeek && (
                  <div className="modal-highlight-box elim">
                    <strong>Earliest Playoff Elimination:</strong> Week {selectedTeamProfile.fastestPlayoffElimWeek} · Ceiling: {selectedTeamProfile.maxPossibleWins} Wins.
                  </div>
                )}
              </div>

              {/* Bye Clinch Path */}
              {byeSpots > 0 && selectedTeamProfile.byeExplanation && (
                <div className="modal-info-block bye-border">
                  <h4 style={{ color: '#f59e0b' }}>First-Round Bye Race (Top 2)</h4>
                  <p>{selectedTeamProfile.byeExplanation}</p>
                  {selectedTeamProfile.fastestByeClinchWeek && (
                    <div className="modal-highlight-box bye">
                      <strong>Earliest Bye Lock:</strong> Week {selectedTeamProfile.fastestByeClinchWeek}.
                    </div>
                  )}
                  {selectedTeamProfile.fastestByeElimWeek && (
                    <div className="modal-highlight-box elim">
                      <strong>Earliest Bye Elimination:</strong> Week {selectedTeamProfile.fastestByeElimWeek}.
                    </div>
                  )}
                </div>
              )}

              {/* Week Outcomes */}
              <div className="modal-info-block">
                <h4>Week {clinchSummary?.currentWeek} Outcome Matrix</h4>
                <ul className="modal-scenarios-list">
                  {selectedTeamProfile.weekImpactScenarios.map((sc, i) => (
                    <li key={i}>{sc}</li>
                  ))}
                </ul>
              </div>

              {/* Remaining Opponents */}
              {selectedTeamProfile.upcomingOpponents.length > 0 && (
                <div className="modal-info-block">
                  <h4>Remaining Schedule</h4>
                  <div className="schedule-pills">
                    {selectedTeamProfile.upcomingOpponents.map((opp) => (
                      <span key={opp.week} className="schedule-pill">
                        Week {opp.week}: vs {opp.opponentName}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* HOW IT WORKS / METHODOLOGY SECTION (Exact layout from fantasy-expected-wins) */}
      <details className="model-details" open>
        <summary>
          <span className="method-icon"><Trophy size={18} /></span>
          <div className="model-heading">
            <span className="model-tag">HOW IT WORKS</span>
            <strong>How Playoff Clinch Math, First-Round Byes, &amp; League Median Work</strong>
          </div>
          <ChevronDown className="model-chevron" size={17} />
        </summary>

        <div className="model-content">
          <div className="model-cards-grid">
            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">FIRST-ROUND BYE</span>
                <h4>1. Top 2 Seeds Earn a Bye</h4>
              </div>
              <p>
                In 6-team playoff brackets, Seeds 1 and 2 skip the quarterfinal round and advance straight to the semifinals.
              </p>
              <p>
                The <strong>Bye Magic Number</strong> measures the exact combination of your wins and Seed 3 losses required to lock a top-2 finish.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">MAGIC NUMBER (M)</span>
                <h4>2. Clinching Mathematical Locks</h4>
              </div>
              <p>
                A team clinches a playoff spot when it is mathematically impossible for the first team outside the cutoff (Seed #7) to catch them.
              </p>
              <p>
                When Magic Number reaches <code>0</code>, you are officially locked!
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">LEAGUE MEDIAN</span>
                <h4>3. Two Games Every Week</h4>
              </div>
              <p>
                In leagues using median scoring, each week offers 2 wins: 1 from your Head-to-Head matchup and 1 from scoring in the top 50% of the league.
              </p>
              <p>
                This doubles the total regular-season games and accelerates clinching and elimination races.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">TIEBREAKERS</span>
                <h4>4. Points For Primary Tiebreaker</h4>
              </div>
              <p>
                In Sleeper leagues, standings ties between identical win-loss records are decided by total <strong>Starter Points For (PF)</strong>.
              </p>
              <p>
                Holding a high PF margin acts as an effective extra half-game buffer against bubble challengers.
              </p>
            </div>
          </div>
        </div>
      </details>

      <div className="bottom-note">
        UNOFFICIAL DYNASTY &amp; REDRAFT TOOL <span>·</span> LIVE SCORES &amp; ROSTERS POWERED BY SLEEPER API
      </div>
    </main>
  )
}
export default App
