import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crown,
  Flame,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
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

type MainTab = 'clinch' | 'bye' | 'whatif' | 'scenarios'
type FilterOption = 'ALL' | 'BYE' | 'CLINCHED' | 'IN_HUNT' | 'BUBBLE' | 'ELIMINATED'

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
    const fromQuery = new URLSearchParams(window.location.search).get('league')
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
    if (fromQuery && ['clinch', 'bye', 'whatif', 'scenarios'].includes(fromQuery)) {
      return fromQuery as MainTab
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
  const [filter, setFilter] = useState<FilterOption>('ALL')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [enableMedianOverride, setEnableMedianOverride] = useState<boolean | null>(null)
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

  const effectiveMedian = useMemo(() => {
    if (enableMedianOverride !== null) return enableMedianOverride
    return data?.hasMedianMatch ?? false
  }, [enableMedianOverride, data?.hasMedianMatch])

  const clinchSummary: LeagueClinchSummary | null = useMemo(() => {
    if (!data) return null
    try {
      return analyzeLeagueClinch(data, { enableMedian: effectiveMedian })
    } catch (err) {
      console.error('Error analyzing playoff clinches:', err)
      return null
    }
  }, [data, effectiveMedian])

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
    if (!clinchSummary) return []
    let list = clinchSummary.teams

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      list = list.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.ownerDisplayName.toLowerCase().includes(q) ||
          String(t.seed).includes(q),
      )
    }

    if (filter === 'BYE') {
      list = list.filter((t) => t.seed <= clinchSummary.byeSpots || t.hasClinchedBye)
    } else if (filter === 'CLINCHED') {
      list = list.filter((t) => t.hasClinchedPlayoff || t.hasClinchedBye)
    } else if (filter === 'IN_HUNT') {
      list = list.filter((t) => t.status === 'IN_THE_HUNT' || t.status === 'IN_CONTROL' || t.status === 'BYE_FAVORITE')
    } else if (filter === 'BUBBLE') {
      list = list.filter((t) => t.status === 'ON_THE_BUBBLE')
    } else if (filter === 'ELIMINATED') {
      list = list.filter((t) => t.isEliminatedFromPlayoffs)
    }

    return list
  }, [clinchSummary, search, filter])

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
    setSimMedianWinners((prev) => {
      const weekMedians = { ...(prev[week] || {}) }
      weekMedians[rosterId] = !weekMedians[rosterId]
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
          weekMedians[t.rosterId] = t.seed <= clinchSummary.totalTeams / 2
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
      for (const [, weekMedians] of Object.entries(simMedianWinners)) {
        for (const [rosterIdStr, beatsMedian] of Object.entries(weekMedians)) {
          const rosterId = Number(rosterIdStr)
          const stat = teamStats.get(rosterId)
          if (!stat) continue
          if (beatsMedian) {
            stat.totalWins += 1
            stat.medianWins += 1
            stat.simWinsAdded += 1
          } else {
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
          <Crown size={11} /> Clinched Bye 👑
        </span>
      )
    }
    if (team.hasClinchedPlayoff) {
      return (
        <span className="status-pill status-clinched-playoff" title="Clinched top-6 playoff spot">
          <Check size={11} /> Clinched Playoff 🔒
        </span>
      )
    }
    if (team.isEliminatedFromPlayoffs) {
      return (
        <span className="status-pill status-eliminated" title="Mathematically eliminated from playoffs">
          Eliminated ✕
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
          <label htmlFor="league-input">SLEEPER LEAGUE ID</label>
          <div className="league-input-row">
            <input
              id="league-input"
              type="text"
              placeholder="e.g. 1329251955255574528"
              value={leagueId}
              onChange={(e) => setLeagueId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') refresh()
              }}
            />
            <button
              type="button"
              className="load-btn"
              disabled={busy}
              onClick={() => refresh()}
            >
              {busy ? <RefreshCw size={13} className="spin" /> : 'Load'}
            </button>
          </div>

          <div className="league-actions">
            <button type="button" className="action-link" onClick={handleLoadDemo}>
              Demo
            </button>
            <span className="action-sep">·</span>
            <button
              type="button"
              className="action-link"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  navigator.clipboard.writeText(window.location.href)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 2000)
                }
              }}
            >
              <Share2 size={11} /> {copied ? 'Copied Link' : 'Share'}
            </button>
            <span className="action-sep">·</span>
            <button
              type="button"
              className="action-link"
              onClick={() => refresh()}
              disabled={busy || !leagueId.trim()}
            >
              <RefreshCw size={11} className={busy ? 'spin' : ''} /> Refresh
            </button>
          </div>
          {lastUpdated && (
            <p className="league-sub">
              UPDATED {new Date(lastUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
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
              ? `WEEK ${clinchSummary.currentWeek} OF ${clinchSummary.regularSeasonEnd}`
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
            {seed1 && seed2 ? (
              <span>
                #1 {seed1.name.slice(0, 10)} ({seed1.totalWins}-{seed1.totalLosses}) · #2 {seed2.name.slice(0, 10)} ({seed2.totalWins}-{seed2.totalLosses})
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed1 && seed3
              ? `#1 Bye Magic: ${seed1.byeMagicNumber ?? 'LOCK'} · Chased by #3 ${seed3.name.slice(0, 12)} (${seed3.totalWins}-${seed3.totalLosses})`
              : 'Seeds 1 & 2 earn bye to semifinals'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <ShieldAlert size={11} className="label-icon" style={{ color: '#fbbf24' }} /> PLAYOFF BUBBLE (SEED 6 vs 7)
          </span>
          <strong>
            {seed6 && seed7 ? (
              <span>
                #6 {seed6.name.slice(0, 10)} ({seed6.totalWins}-{seed6.totalLosses}) vs #7 {seed7.name.slice(0, 10)} ({seed7.totalWins}-{seed7.totalLosses})
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed6 && seed7
              ? seed6.totalWins === seed7.totalWins
                ? `Tied at ${seed6.totalWins}-${seed6.totalLosses} · #6 leads by +${formatDec(seed6.pointsFor - seed7.pointsFor, 1)} PF`
                : `#6 leads by ${seed6.totalWins - seed7.totalWins} game(s) · Magic #${seed6.magicNumber}`
              : 'Cutoff between playoffs and lottery'}
          </span>
        </div>
      </section>

      {/* Median Scoring Banner & Toggle (using exact .live-week-banner style from fantasy-expected-wins) */}
      {clinchSummary && (
        <div className="live-week-banner">
          <div className="live-week-info">
            <span className="live-dot" />
            <div className="live-week-text">
              <strong>League Median Scoring (2 Wins Per Week)</strong>
              <span>
                {hasMedian
                  ? 'Active: Factoring in 2 games each week (1 Head-to-Head + 1 against Weekly Scoring Median). Standings, magic numbers, and odds reflect 2W/wk.'
                  : 'Disabled: Factoring in standard 1 game per week (Head-to-Head only).'}
              </span>
            </div>
          </div>
          <button
            type="button"
            className={`live-toggle-button ${hasMedian ? 'active' : ''}`}
            onClick={() => setEnableMedianOverride(!hasMedian)}
            title="Toggle between full 2W/week median scoring and pure 1W/week H2H"
          >
            <Zap size={13} />
            <span>{hasMedian ? 'Median Factored In (2W/Wk)' : 'Head-to-Head Only (1W/Wk)'}</span>
          </button>
        </div>
      )}

      {/* Main Board Section */}
      <section className="main-board-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              POSTSEASON INTELLIGENCE <span>·</span> {clinchSummary ? clinchSummary.leagueName.toUpperCase() : 'PLAYOFF RACE'}
            </p>
            <h2>
              {tab === 'clinch' && 'Playoff Standings & Clinch Radar'}
              {tab === 'bye' && 'First-Round Bye Race (Top 2 Seeds)'}
              {tab === 'whatif' && 'Interactive What-If Playoff Machine'}
              {tab === 'scenarios' && 'Clinch Scenarios & Magic Number Paths'}
            </h2>
          </div>

          <div className="board-tools">
            <div className="search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Filter teams…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

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
                className={tab === 'bye' ? 'selected' : ''}
                onClick={() => setTab('bye')}
              >
                <Crown size={12} />
                <span>Bye Race</span>
              </button>
              <button
                type="button"
                className={tab === 'whatif' ? 'selected' : ''}
                onClick={() => setTab('whatif')}
              >
                <Flame size={12} />
                <span>What-If</span>
              </button>
              <button
                type="button"
                className={tab === 'scenarios' ? 'selected' : ''}
                onClick={() => setTab('scenarios')}
              >
                <Target size={12} />
                <span>Scenarios</span>
              </button>
            </div>
          </div>
        </div>

        {/* Status Filter Chips (for standings and bye tabs) */}
        {(tab === 'clinch' || tab === 'bye') && clinchSummary && (
          <div className="filter-chips-row">
            <span className="filter-label">FILTER:</span>
            <button
              type="button"
              className={`filter-chip ${filter === 'ALL' ? 'active' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              ALL TEAMS ({totalTeams})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'BYE' ? 'active' : ''}`}
              onClick={() => setFilter('BYE')}
            >
              👑 BYE CONTENDERS ({clinchSummary.teams.filter((t) => t.seed <= byeSpots || t.hasClinchedBye).length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'CLINCHED' ? 'active' : ''}`}
              onClick={() => setFilter('CLINCHED')}
            >
              🔒 CLINCHED ({clinchSummary.clinchedCount + clinchSummary.clinchedByeCount})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'IN_HUNT' ? 'active' : ''}`}
              onClick={() => setFilter('IN_HUNT')}
            >
              ⚡ IN THE HUNT ({clinchSummary.teams.filter((t) => t.status === 'IN_THE_HUNT' || t.status === 'IN_CONTROL' || t.status === 'BYE_FAVORITE').length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'BUBBLE' ? 'active' : ''}`}
              onClick={() => setFilter('BUBBLE')}
            >
              ⚖️ ON BUBBLE ({clinchSummary.teams.filter((t) => t.status === 'ON_THE_BUBBLE').length})
            </button>
            <button
              type="button"
              className={`filter-chip ${filter === 'ELIMINATED' ? 'active' : ''}`}
              onClick={() => setFilter('ELIMINATED')}
            >
              ✕ ELIMINATED ({clinchSummary.eliminatedCount})
            </button>
          </div>
        )}

        {/* VIEW 1: CLINCH RADAR (Main Standings with Focused 8 Columns) */}
        {tab === 'clinch' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="th-rank">#</th>
                  <th>FRANCHISE</th>
                  <th>RECORD</th>
                  <th>PLAYOFF STATUS</th>
                  <th title="Combination of team wins and chaser losses to lock playoff spot">MAGIC #</th>
                  <th title="Combination of team losses and cutoff wins causing elimination">ELIM #</th>
                  <th title="Probability of qualifying for the top-6 playoffs">PLAYOFF ODDS</th>
                  <th title="Points For (Primary Tiebreaker)">POINTS FOR</th>
                  <th style={{ textAlign: 'center' }}>CLINCH PATH</th>
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
                      {clinchSummary ? 'No teams match your current filter.' : 'Enter a Sleeper League ID above to decode playoff clinches.'}
                    </td>
                  </tr>
                )}
                {!busy && filteredTeams.map((team) => {
                  const isByeRow = team.seed <= byeSpots
                  const isPlayoffRow = team.seed <= playoffSpots
                  const showByeDivider = team.seed === byeSpots && filter === 'ALL'
                  const showPlayoffDivider = team.seed === playoffSpots && filter === 'ALL'

                  return (
                    <Fragment key={team.rosterId}>
                      <tr
                        className={`standings-row ${isByeRow ? 'bye-row' : isPlayoffRow ? 'playoff-row' : 'lottery-row'}`}
                        onClick={() => setSelectedTeamRosterId(team.rosterId)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td className="td-rank">
                          <span className={`pick-number ${isByeRow ? 'bye-number' : isPlayoffRow ? '' : 'lottery-number'}`}>
                            {String(team.seed).padStart(2, '0')}
                          </span>
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
                              <span className="team-title" title={team.name}>
                                {team.name}
                              </span>
                              <span className="team-sub">
                                {team.ownerDisplayName}
                                {hasMedian && (
                                  <span> · {team.h2hWins}-{team.h2hLosses} H2H · {team.medianWins}-{team.medianLosses} Med</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="record-cell">
                          <div className="stat-primary">
                            <strong>{team.totalWins}–{team.totalLosses}</strong>
                            <span className="stat-sub">{Math.round(team.winPercentage * 100)}% Win Rate</span>
                          </div>
                        </td>

                        <td>
                          {renderStatusPill(team)}
                        </td>

                        {/* Playoff Magic Number */}
                        <td className="magic-cell">
                          {team.hasClinchedPlayoff ? (
                            <span className="magic-badge locked"><Lock size={10} /> CLINCHED</span>
                          ) : team.isEliminatedFromPlayoffs ? (
                            <span className="magic-badge elim">—</span>
                          ) : team.magicNumber !== null ? (
                            <div className="stat-primary">
                              <span className="magic-badge active">M: {team.magicNumber}</span>
                              {isByeRow && team.byeMagicNumber !== null && (
                                <span className="stat-sub" style={{ color: '#f59e0b', fontSize: '9px' }}>
                                  Bye M: {team.byeMagicNumber}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="magic-badge elim">—</span>
                          )}
                        </td>

                        {/* Elimination Number */}
                        <td className="elim-cell">
                          {team.hasClinchedPlayoff ? (
                            <span className="stat-sub">—</span>
                          ) : team.isEliminatedFromPlayoffs ? (
                            <span className="elim-badge out">OUT</span>
                          ) : team.eliminationNumber !== null ? (
                            <span className="elim-badge active">E: {team.eliminationNumber}</span>
                          ) : (
                            <span className="stat-sub">—</span>
                          )}
                        </td>

                        {/* Playoff Probability with mini-bar */}
                        <td className="odds-cell">
                          <div className="odds-wrap">
                            <span className="odds-val">{formatPct(team.playoffProbability)}</span>
                            <div className="odds-track">
                              <div
                                className={`odds-fill ${team.playoffProbability >= 0.8 ? 'high' : team.playoffProbability >= 0.4 ? 'mid' : 'low'}`}
                                style={{ width: `${Math.round(team.playoffProbability * 100)}%` }}
                              />
                            </div>
                          </div>
                        </td>

                        {/* Points For */}
                        <td className="numeric-cell">
                          <strong style={{ fontFamily: 'var(--mono)' }}>{formatDec(team.pointsFor, 1)}</strong>
                        </td>

                        {/* Scenarios Action */}
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="scenario-btn"
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedTeamRosterId(team.rosterId)
                            }}
                          >
                            View Path <ChevronRight size={11} />
                          </button>
                        </td>
                      </tr>

                      {showByeDivider && (
                        <tr className="cutoff-line-bye">
                          <td colSpan={9}>
                            👑 TOP 2 CLINCH FIRST-ROUND PLAYOFF BYE (ADVANCE TO SEMIFINALS)
                          </td>
                        </tr>
                      )}

                      {showPlayoffDivider && (
                        <tr className="cutoff-line-playoff">
                          <td colSpan={9}>
                            ▲ TOP 6 QUALIFY FOR PLAYOFFS  |  BUBBLE CUTOFF LINE ▼
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* VIEW 2: BYE RACE (TOP 2) */}
        {tab === 'bye' && (
          <div className="bye-race-view">
            <div className="view-intro-box">
              <div className="view-intro-icon">
                <Crown size={20} color="#f59e0b" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px' }}>First-Round Bye Race (Top 2 Seeds)</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>
                  In a 6-team playoff bracket, the #1 and #2 seeds skip the quarterfinals and advance directly to the semifinal round.
                  Bye Magic Numbers represent the combination of your wins and #3 Seed ({seed3?.name ?? 'Chaser'}) losses required to lock a top-2 finish.
                </p>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="th-rank">#</th>
                    <th>FRANCHISE</th>
                    <th>RECORD</th>
                    <th>BYE STATUS</th>
                    <th title="Combination of team wins and seed 3 losses to lock top-2 bye">BYE MAGIC #</th>
                    <th title="Combination of team losses and seed 2 wins to eliminate from bye">BYE ELIM #</th>
                    <th>BYE ODDS</th>
                    <th>VS #3 CHASER</th>
                    <th>POINTS FOR</th>
                    <th style={{ textAlign: 'center' }}>CLINCH PATH</th>
                  </tr>
                </thead>
                <tbody>
                  {clinchSummary?.teams.map((team) => {
                    const isByeRow = team.seed <= byeSpots
                    const showByeDivider = team.seed === byeSpots

                    return (
                      <Fragment key={team.rosterId}>
                        <tr className={`standings-row ${isByeRow ? 'bye-row' : ''}`}>
                          <td className="td-rank">
                            <span className={`pick-number ${isByeRow ? 'bye-number' : 'lottery-number'}`}>
                              {String(team.seed).padStart(2, '0')}
                            </span>
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
                              <strong>{team.totalWins}–{team.totalLosses}</strong>
                              {hasMedian && (
                                <span className="stat-sub">{team.h2hWins}-{team.h2hLosses} H2H · {team.medianWins}-{team.medianLosses} Med</span>
                              )}
                            </div>
                          </td>

                          <td>
                            {team.hasClinchedBye ? (
                              <span className="status-pill status-clinched-bye"><Crown size={11} /> Bye Clinched 👑</span>
                            ) : team.isEliminatedFromBye ? (
                              <span className="status-pill status-eliminated">Eliminated from Bye</span>
                            ) : team.seed === 1 ? (
                              <span className="status-pill status-in-control"><Crown size={11} /> Bye Leader (#1)</span>
                            ) : team.seed === 2 ? (
                              <span className="status-pill status-in-control"><Crown size={11} /> Bye Seed (#2)</span>
                            ) : (
                              <span className="status-pill status-in-the-hunt">Bye Hunt ({formatPct(team.byeProbability)})</span>
                            )}
                          </td>

                          <td className="magic-cell">
                            {team.hasClinchedBye ? (
                              <span className="magic-badge locked"><Lock size={10} /> LOCKED</span>
                            ) : team.isEliminatedFromBye ? (
                              <span className="magic-badge elim">—</span>
                            ) : team.byeMagicNumber !== null ? (
                              <span className="magic-badge active" style={{ color: '#f59e0b', borderColor: 'rgba(245, 158, 11, 0.4)' }}>
                                Bye M: {team.byeMagicNumber}
                              </span>
                            ) : (
                              <span className="magic-badge elim">—</span>
                            )}
                          </td>

                          <td className="elim-cell">
                            {team.hasClinchedBye ? (
                              <span className="stat-sub">—</span>
                            ) : team.isEliminatedFromBye ? (
                              <span className="elim-badge out">OUT</span>
                            ) : team.byeEliminationNumber !== null ? (
                              <span className="elim-badge active">E: {team.byeEliminationNumber}</span>
                            ) : (
                              <span className="stat-sub">—</span>
                            )}
                          </td>

                          <td className="odds-cell">
                            <div className="odds-wrap">
                              <span className="odds-val">{formatPct(team.byeProbability)}</span>
                              <div className="odds-track">
                                <div
                                  className="odds-fill"
                                  style={{
                                    width: `${Math.round(team.byeProbability * 100)}%`,
                                    background: '#f59e0b',
                                  }}
                                />
                              </div>
                            </div>
                          </td>

                          <td>
                            {team.seed === 1 || team.seed === 2 ? (
                              <span style={{ color: '#34d399', fontFamily: 'var(--mono)', fontSize: '11px', fontWeight: 600 }}>
                                +{(team.totalWins - (seed3?.totalWins ?? team.totalWins)).toFixed(1)}G Lead
                              </span>
                            ) : team.seed === 3 ? (
                              <span style={{ color: '#f59e0b', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                #3 Chaser (0.0G)
                              </span>
                            ) : (
                              <span style={{ color: 'var(--muted)', fontFamily: 'var(--mono)', fontSize: '11px' }}>
                                -{(seed3 ? (seed3.totalWins - team.totalWins) : 0).toFixed(1)}G Behind
                              </span>
                            )}
                          </td>

                          <td className="numeric-cell">
                            <strong style={{ fontFamily: 'var(--mono)' }}>{formatDec(team.pointsFor, 1)}</strong>
                          </td>

                          <td style={{ textAlign: 'center' }}>
                            <button
                              type="button"
                              className="scenario-btn"
                              onClick={() => setSelectedTeamRosterId(team.rosterId)}
                            >
                              Path <ChevronRight size={11} />
                            </button>
                          </td>
                        </tr>

                        {showByeDivider && (
                          <tr className="cutoff-line-bye">
                            <td colSpan={10}>
                              👑 TOP 2 EARN FIRST-ROUND PLAYOFF BYE (SEEDS 1 &amp; 2)
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
        )}

        {/* VIEW 3: INTERACTIVE WHAT-IF MACHINE */}
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

                return (
                  <div className="matchup-cards-grid">
                    {Array.from(pairs.entries()).map(([matchupId, pair]) => {
                      if (pair.length < 2) return null
                      const t1 = clinchSummary?.teams.find((t) => t.rosterId === pair[0].roster_id)
                      const t2 = clinchSummary?.teams.find((t) => t.rosterId === pair[1].roster_id)
                      if (!t1 || !t2) return null

                      const pickedWinnerId = simMatchupWinners[simSelectedWeek]?.[matchupId]
                      const t1MedianBeater = Boolean(simMedianWinners[simSelectedWeek]?.[t1.rosterId])
                      const t2MedianBeater = Boolean(simMedianWinners[simSelectedWeek]?.[t2.rosterId])

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
                                  className={`median-chk ${t1MedianBeater ? 'checked' : ''}`}
                                  onClick={() => handleToggleMedian(simSelectedWeek, t1.rosterId)}
                                >
                                  {t1MedianBeater && <Check size={10} />}
                                  <span>{t1.name.slice(0, 10)} (+1W)</span>
                                </button>
                                <button
                                  type="button"
                                  className={`median-chk ${t2MedianBeater ? 'checked' : ''}`}
                                  onClick={() => handleToggleMedian(simSelectedWeek, t2.rosterId)}
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
                )
              })()}
            </div>

            {/* Live Projected Standings After Simulation */}
            <div className="sim-standings-section">
              <h4 className="sim-section-title">
                <span>PROJECTED PLAYOFF SEEDS AFTER PICKS</span>
                <span className="sim-sub">Standings sorted by projected total wins, then points for tiebreakers</span>
              </h4>

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
                            <td className="td-rank">
                              <span className={`pick-number ${isBye ? 'bye-number' : isPlayoff ? '' : 'lottery-number'}`}>
                                {String(idx + 1).padStart(2, '0')}
                              </span>
                            </td>

                            <td>
                              {team.seedDelta > 0 ? (
                                <span className="delta-pill up">▲ +{team.seedDelta}</span>
                              ) : team.seedDelta < 0 ? (
                                <span className="delta-pill down">▼ {team.seedDelta}</span>
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
                                👑 TOP 2 FIRST-ROUND PLAYOFF BYE CUTOFF
                              </td>
                            </tr>
                          )}

                          {showPlayoffDivider && (
                            <tr className="cutoff-line-playoff">
                              <td colSpan={6}>
                                ▲ TOP 6 PLAYOFF QUALIFIED | BUBBLE CUTOFF ▼
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
          </div>
        )}

        {/* VIEW 4: CLINCH SCENARIOS TAB */}
        {tab === 'scenarios' && (
          <div className="scenarios-view">
            <div className="view-intro-box">
              <div className="view-intro-icon">
                <Target size={20} color="#38bdf8" />
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '15px' }}>Clinch Scenarios &amp; Magic Number Paths</h3>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: '12px' }}>
                  Detailed mathematical paths to clinch a playoff spot or first-round bye, weekly outcome matrices, and upcoming scheduled opponents.
                </p>
              </div>
            </div>

            <div className="scenario-cards-grid">
              {clinchSummary?.teams.map((team) => (
                <div key={team.rosterId} className="team-scenario-card">
                  <div className="scenario-card-header">
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
                        <span className="team-title">#{team.seed} {team.name}</span>
                        <span className="team-sub">{team.ownerDisplayName} · {team.totalWins}–{team.totalLosses}</span>
                      </div>
                    </div>
                    {renderStatusPill(team)}
                  </div>

                  <div className="scenario-body">
                    {/* Magic Number Box */}
                    <div className="scenario-section">
                      <span className="scenario-section-label">PLAYOFF MAGIC NUMBER</span>
                      <p className="scenario-text">{team.magicNumberExplanation}</p>
                      {team.fastestPlayoffClinchWeek && (
                        <span className="scenario-pill">
                          ⚡ Earliest Playoff Clinch: Week {team.fastestPlayoffClinchWeek}
                        </span>
                      )}
                    </div>

                    {/* Bye Box (Seeds 1 & 2) */}
                    {team.seed <= byeSpots && (
                      <div className="scenario-section bye-box">
                        <span className="scenario-section-label" style={{ color: '#f59e0b' }}>
                          FIRST-ROUND BYE HUNT
                        </span>
                        <p className="scenario-text">{team.byeExplanation}</p>
                        {team.fastestByeClinchWeek && (
                          <span className="scenario-pill bye">
                            👑 Earliest Bye Clinch: Week {team.fastestByeClinchWeek}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Week Impact */}
                    {team.weekImpactScenarios.length > 0 && (
                      <div className="scenario-section">
                        <span className="scenario-section-label">UPCOMING WEEK IMPACT (WEEK {clinchSummary.currentWeek})</span>
                        <ul className="scenario-list">
                          {team.weekImpactScenarios.map((sc, i) => (
                            <li key={i}>{sc}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Upcoming Opponents */}
                    {team.upcomingOpponents.length > 0 && (
                      <div className="scenario-section">
                        <span className="scenario-section-label">REMAINING SCHEDULE</span>
                        <div className="schedule-pills">
                          {team.upcomingOpponents.slice(0, 4).map((opp) => (
                            <span key={opp.week} className="schedule-pill">
                              Wk {opp.week}: vs {opp.opponentName.slice(0, 12)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
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
                ✕
              </button>
            </div>

            <div className="modal-body">
              <div className="modal-status-bar">
                <span>POSTSEASON STATUS:</span>
                {renderStatusPill(selectedTeamProfile)}
                <span className="modal-odds">Playoff Odds: {formatPct(selectedTeamProfile.playoffProbability)}</span>
              </div>

              {/* Playoff Clinch Path */}
              <div className="modal-info-block">
                <h4>Playoff Clinch Intelligence</h4>
                <p>{selectedTeamProfile.magicNumberExplanation}</p>
                {selectedTeamProfile.fastestPlayoffClinchWeek && (
                  <div className="modal-highlight-box">
                    ⚡ <strong>Earliest Clinch Date:</strong> Week {selectedTeamProfile.fastestPlayoffClinchWeek} (in {Math.max(1, selectedTeamProfile.fastestPlayoffClinchWeek - (clinchSummary?.currentWeek ?? 9))} week(s) with chalk/optimal results).
                  </div>
                )}
              </div>

              {/* Bye Clinch Path */}
              {selectedTeamProfile.seed <= byeSpots && (
                <div className="modal-info-block bye-border">
                  <h4 style={{ color: '#f59e0b' }}>First-Round Bye Race (Top 2)</h4>
                  <p>{selectedTeamProfile.byeExplanation}</p>
                  {selectedTeamProfile.fastestByeClinchWeek && (
                    <div className="modal-highlight-box bye">
                      👑 <strong>Earliest Bye Lock:</strong> Week {selectedTeamProfile.fastestByeClinchWeek}.
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
