import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Crown,
  Flame,
  HelpCircle,
  Lock,
  RefreshCw,
  RotateCcw,
  Search,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  ToggleLeft,
  ToggleRight,
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { analyzeLeagueClinch, type ClinchStatus, type LeagueClinchSummary } from './clinch'
import { getDemoLeagueData } from './demoData'
import { loadLeagueData, type LeagueData } from './sleeper'
import './App.css'

type MainTab = 'clinch' | 'bye' | 'expected' | 'simulator'
type FilterOption = 'ALL' | 'BYE' | 'CLINCHED' | 'BUBBLE' | 'ELIMINATED'

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

export function App() {
  const initialId = useMemo(getInitialLeagueId, [])
  const [leagueId, setLeagueId] = useState(initialId)
  const [data, setData] = useState<LeagueData | null>(null)
  const [busy, setBusy] = useState(Boolean(initialId))
  const [error, setError] = useState('')
  const [tab, setTab] = useState<MainTab>('clinch')
  const [filter, setFilter] = useState<FilterOption>('ALL')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [copied, setCopied] = useState(false)
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null)
  const [enableMedian, setEnableMedian] = useState<boolean>(true)

  // Simulation overrides: week -> matchupId -> winnerRosterId
  const [simMatchupWinners, setSimMatchupWinners] = useState<Record<number, Record<number, number>>>({})
  // Simulation overrides: week -> rosterId -> beatMedian (boolean)
  const [simMedianWinners, setSimMedianWinners] = useState<Record<number, Record<number, boolean>>>({})

  async function refresh(targetId?: string) {
    const activeId = (targetId ?? leagueId).trim()
    if (!activeId) {
      setError('Please enter a Sleeper League ID.')
      setBusy(false)
      return
    }
    if (activeId === 'demo' || activeId.startsWith('demo-')) {
      loadDemo()
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await loadLeagueData(activeId)
      setData(next)
      setLastUpdated(next.lastUpdated)
      // Check if league officially has median match
      const hasMedianSetting = Number(next.league.settings.league_average_match) === 1
      if (hasMedianSetting) {
        setEnableMedian(true)
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('last_playoffs_league_id', activeId)
        const url = new URL(window.location.href)
        url.searchParams.set('league', activeId)
        window.history.replaceState({}, '', url.toString())
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load league data from Sleeper.')
    } finally {
      setBusy(false)
    }
  }

  function loadDemo() {
    setBusy(true)
    setError('')
    try {
      const demo = getDemoLeagueData()
      setData(demo)
      setLeagueId('demo-median-league')
      setLastUpdated(demo.lastUpdated)
      setEnableMedian(true)
    } finally {
      setBusy(false)
    }
  }

  async function copyShareUrl() {
    if (typeof window === 'undefined') return
    const activeId = leagueId.trim()
    if (!activeId) return
    const url = new URL(window.location.href)
    url.searchParams.set('league', activeId)
    const shareUrl = url.toString()
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy shareable league URL:', shareUrl)
    }
  }

  useEffect(() => {
    if (initialId) {
      void refresh(initialId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Analyze Clinch & Expected Wins with median option
  const clinchSummary: LeagueClinchSummary | null = useMemo(() => {
    if (!data) return null
    return analyzeLeagueClinch(data, { enableMedian })
  }, [data, enableMedian])

  // Filtered teams list
  const query = search.trim().toLowerCase()
  const filteredTeams = useMemo(() => {
    if (!clinchSummary) return []
    return clinchSummary.teams.filter((team) => {
      const matchesSearch = !query || `${team.name} ${team.ownerDisplayName}`.toLowerCase().includes(query)
      if (!matchesSearch) return false

      if (filter === 'BYE') {
        return team.seed <= 3 || team.byeProbability > 0.15
      }
      if (filter === 'CLINCHED') {
        return team.hasClinchedPlayoff || team.hasClinchedBye
      }
      if (filter === 'BUBBLE') {
        return !team.hasClinchedPlayoff && !team.isEliminatedFromPlayoffs
      }
      if (filter === 'ELIMINATED') {
        return team.isEliminatedFromPlayoffs
      }
      return true
    })
  }, [clinchSummary, query, filter])

  // Helper for status badge
  function renderStatusBadge(status: ClinchStatus, label: string) {
    switch (status) {
      case 'CLINCHED_BYE':
        return <span className="status-pill status-clinched-bye"><Crown size={12} /> {label}</span>
      case 'CLINCHED_PLAYOFF':
        return <span className="status-pill status-clinched-playoff"><Check size={12} /> {label}</span>
      case 'IN_THE_HUNT':
        return <span className="status-pill status-in-the-hunt"><Flame size={12} /> {label}</span>
      case 'ON_THE_BUBBLE':
        return <span className="status-pill status-on-the-bubble"><ShieldAlert size={12} /> {label}</span>
      case 'WORK_TO_DO':
        return <span className="status-pill status-work-to-do"><Zap size={12} /> {label}</span>
      case 'ELIMINATED':
        return <span className="status-pill status-eliminated">✕ {label}</span>
    }
  }

  // Helper for clinch meter bar
  function renderMeter(meter: number, isHigh: boolean) {
    let fillClass = 'meter-fill-mid'
    if (meter >= 99) fillClass = 'meter-fill-clinched'
    else if (isHigh || meter >= 75) fillClass = 'meter-fill-high'
    else if (meter <= 25) fillClass = 'meter-fill-low'

    return (
      <div className="meter-wrap" title={`Clinch Closeness: ${meter}%`}>
        <div className="meter-track">
          <div className={`meter-fill ${fillClass}`} style={{ width: `${meter}%` }} />
        </div>
        <span className="meter-val">{meter}%</span>
      </div>
    )
  }

  // Helper for schedule luck
  function renderLuck(luck: number) {
    if (Math.abs(luck) < 0.2) {
      return <span className="luck-pill neutral">0.0 Even</span>
    }
    if (luck > 0) {
      return <span className="luck-pill very-lucky"><TrendingUp size={11} /> +{formatDec(luck, 1)} W</span>
    }
    return <span className="luck-pill very-unlucky"><TrendingDown size={11} /> {formatDec(luck, 1)} W</span>
  }

  // Simulator helper: toggle match winner
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

  // Simulator helper: toggle median win
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

  // Compute simulated standings
  const simulatedTeams = useMemo(() => {
    if (!clinchSummary) return []
    const overrideWins = new Map<number, number>()

    for (const weekPicks of Object.values(simMatchupWinners)) {
      for (const winnerId of Object.values(weekPicks)) {
        overrideWins.set(winnerId, (overrideWins.get(winnerId) ?? 0) + 1)
      }
    }
    for (const weekMedians of Object.values(simMedianWinners)) {
      for (const [rosterIdStr, beat] of Object.entries(weekMedians)) {
        if (beat) {
          const rId = Number(rosterIdStr)
          overrideWins.set(rId, (overrideWins.get(rId) ?? 0) + 1)
        }
      }
    }

    return clinchSummary.teams.map((t) => {
      const addedWins = overrideWins.get(t.rosterId) ?? 0
      const simTotalWins = t.totalWins + addedWins
      return {
        ...t,
        simTotalWins,
        addedWins,
      }
    }).sort((a, b) => b.simTotalWins - a.simTotalWins || b.pointsFor - a.pointsFor)
  }, [clinchSummary, simMatchupWinners, simMedianWinners])

  const totalTeams = clinchSummary?.totalTeams ?? 0
  const playoffSpots = clinchSummary?.playoffSpots ?? 6
  const byeSpots = clinchSummary?.byeSpots ?? 2
  const hasMedian = clinchSummary?.hasMedianMatch ?? false

  const seed1 = clinchSummary?.teams[0]
  const seed2 = clinchSummary?.teams[1]
  const seed3 = clinchSummary?.teams[2]
  const seed6 = clinchSummary?.teams[playoffSpots - 1]
  const seed7 = clinchSummary?.teams[playoffSpots]

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
          <h1>The Playoff Race &amp; <em>Bye Hunt</em></h1>
          <p className="intro-copy">
            Exact magic numbers to lock a <b>First-Round Bye</b> (Top 2) and <b>Playoff Spot</b> (Top 6), with full calculation support for weekly league scoring median.
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
              onKeyDown={(e) => { if (e.key === 'Enter') void refresh() }}
              placeholder="Enter Sleeper League ID"
              aria-label="Sleeper League ID"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
            />
            <button
              type="button"
              className={`share-button ${copied ? 'copied' : ''}`}
              onClick={() => void copyShareUrl()}
              title="Copy shareable link to this league"
              disabled={busy || !leagueId.trim()}
            >
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copied ? 'Copied' : 'Share'}</span>
            </button>
            <button
              type="button"
              className="refresh-button"
              onClick={() => void refresh()}
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
                : 'ENTER SLEEPER LEAGUE ID AND CLICK REFRESH'}
            </span>
          </div>
        </div>
      </section>

      {error && (
        <div className="error-banner" role="alert">
          <CircleAlert size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')}>Dismiss</button>
        </div>
      )}

      {/* Summary Strip (4 KPI Items matching fantasy-expected-wins layout) */}
      <section className="summary-strip" aria-label="League Overview">
        <div className="summary-item">
          <span className="summary-label">LEAGUE &amp; FORMAT</span>
          <strong>{clinchSummary?.leagueName ?? (busy ? 'Connecting…' : 'No league loaded')}</strong>
          <span className="summary-note">
            {clinchSummary
              ? `${totalTeams} Teams · ${hasMedian ? '2 Wins/Wk (H2H + Median)' : '1 Win/Wk (H2H)'}`
              : 'Enter Sleeper League ID above'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">SEASON PROGRESS</span>
          <strong>
            {clinchSummary ? `WEEK ${clinchSummary.currentWeek} OF ${clinchSummary.regularSeasonEnd}` : '--'}
          </strong>
          <span className="summary-note">
            {clinchSummary
              ? `${clinchSummary.remainingWeeks} weeks remaining · ${clinchSummary.remainingGamesPerTeam} max wins left`
              : 'Awaiting league connection'}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <Crown size={11} style={{ color: '#c084fc', verticalAlign: 'middle', marginRight: '4px' }} />
            FIRST-ROUND BYE (TOP {byeSpots})
          </span>
          <strong>
            {seed1 && seed2 ? (
              <span style={{ fontSize: '14px', color: '#e9d5ff' }}>
                #1 {seed1.name.slice(0, 12)} ({seed1.totalWins}-{seed1.totalLosses}) · #2 {seed2.name.slice(0, 12)} ({seed2.totalWins}-{seed2.totalLosses})
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed1 && seed3
              ? `#1 Bye Magic: ${seed1.byeMagicNumber ?? 'LOCK'} · Chased by #3 ${seed3.name.slice(0, 14)} (${seed3.totalWins}-${seed3.totalLosses})`
              : `Top ${byeSpots} earn Round 1 Bye`}
          </span>
        </div>

        <div className="summary-item">
          <span className="summary-label">
            <Target size={11} style={{ color: '#38bdf8', verticalAlign: 'middle', marginRight: '4px' }} />
            PLAYOFF BUBBLE (SEED {playoffSpots} vs {playoffSpots + 1})
          </span>
          <strong>
            {seed6 && seed7 ? (
              <span style={{ fontSize: '14px', color: '#7dd3fc' }}>
                #6 {seed6.name.slice(0, 12)} ({seed6.totalWins}-{seed6.totalLosses}) vs #7 {seed7.name.slice(0, 12)} ({seed7.totalWins}-{seed7.totalLosses})
              </span>
            ) : '--'}
          </strong>
          <span className="summary-note">
            {seed6 && seed7
              ? seed6.totalWins === seed7.totalWins
                ? `Tied at ${seed6.totalWins}-${seed6.totalLosses} · #6 leads by +${formatDec(seed6.pointsFor - seed7.pointsFor, 1)} PF`
                : `#6 leads by ${seed6.totalWins - seed7.totalWins} game(s) · Magic #${seed6.magicNumber}`
              : `Top ${playoffSpots} qualify for postseason`}
          </span>
        </div>
      </section>

      {/* Prominent League Median Toggle Bar */}
      <div style={{
        marginTop: '16px',
        padding: '12px 18px',
        borderRadius: '8px',
        background: 'var(--surface)',
        border: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Zap size={18} color="#38bdf8" />
          <div>
            <strong style={{ fontSize: '13px', color: 'var(--ink)' }}>
              LEAGUE MEDIAN SCORING (2 WINS PER WEEK)
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: '11px', color: 'var(--muted)' }}>
              {enableMedian
                ? 'Active: Factoring in 2 games each week (1 Head-to-Head + 1 against Weekly Scoring Median). Standings, magic numbers, and odds reflect 2W/wk.'
                : 'Disabled: Standings and clinches calculate standard 1 game per week (Head-to-Head only). Click toggle to factor in median.'}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setEnableMedian(!enableMedian)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '7px 14px',
            borderRadius: '6px',
            border: enableMedian ? '1px solid rgba(56, 189, 248, 0.45)' : '1px solid var(--line)',
            background: enableMedian ? 'rgba(56, 189, 248, 0.15)' : 'var(--surface-raised)',
            color: enableMedian ? '#38bdf8' : 'var(--muted)',
            cursor: 'pointer',
            font: '600 11px var(--mono)',
            transition: 'all 0.15s ease',
          }}
        >
          {enableMedian ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
          <span>{enableMedian ? 'MEDIAN FACTORED IN (ON)' : 'FACTOR IN MEDIAN (OFF)'}</span>
        </button>
      </div>

      {/* Section Heading & Tabs */}
      <section className="projection-section" style={{ marginTop: '28px' }}>
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              POSTSEASON INTELLIGENCE <span>·</span> {clinchSummary ? clinchSummary.leagueName.toUpperCase() : 'SLEEPER'}
            </p>
            <h2>
              {tab === 'clinch' && 'Playoff Standings & Clinch Radar'}
              {tab === 'bye' && 'First-Round Bye Race (Seeds 1 & 2)'}
              {tab === 'expected' && 'Expected Wins & Schedule Luck'}
              {tab === 'simulator' && 'Interactive What-If Playoff Machine'}
            </h2>
          </div>

          <div className="board-tools">
            {tab !== 'simulator' && data && (
              <div className="search-box">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find team or owner"
                  aria-label="Find team"
                />
              </div>
            )}
            <div className="view-tabs" role="tablist" aria-label="Board view">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'clinch'}
                className={tab === 'clinch' ? 'selected' : ''}
                onClick={() => setTab('clinch')}
              >
                CLINCH RADAR
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'bye'}
                className={tab === 'bye' ? 'selected' : ''}
                onClick={() => setTab('bye')}
              >
                BYE RACE (TOP 2)
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'expected'}
                className={tab === 'expected' ? 'selected' : ''}
                onClick={() => setTab('expected')}
              >
                EXPECTED WINS
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'simulator'}
                className={tab === 'simulator' ? 'selected' : ''}
                onClick={() => setTab('simulator')}
              >
                WHAT-IF MACHINE
              </button>
            </div>
          </div>
        </div>

        {/* Filter pills */}
        {tab === 'clinch' && data && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: '14px', gap: '8px' }}>
            <span style={{ font: '600 10px var(--mono)', color: 'var(--muted)', marginRight: '6px' }}>FILTER:</span>
            <button
              type="button"
              className={`filter-tab ${filter === 'ALL' ? 'selected' : ''}`}
              onClick={() => setFilter('ALL')}
            >
              ALL TEAMS ({clinchSummary?.teams.length ?? 0})
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === 'BYE' ? 'selected' : ''}`}
              onClick={() => setFilter('BYE')}
            >
              👑 BYE CONTENDERS ({clinchSummary?.teams.filter((t) => t.seed <= 3 || t.byeProbability > 0.15).length ?? 0})
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === 'CLINCHED' ? 'selected' : ''}`}
              onClick={() => setFilter('CLINCHED')}
            >
              🔒 CLINCHED ({clinchSummary?.clinchedCount ?? 0})
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === 'BUBBLE' ? 'selected' : ''}`}
              onClick={() => setFilter('BUBBLE')}
            >
              ⚡ IN THE HUNT ({clinchSummary?.bubbleCount ?? 0})
            </button>
            <button
              type="button"
              className={`filter-tab ${filter === 'ELIMINATED' ? 'selected' : ''}`}
              onClick={() => setFilter('ELIMINATED')}
            >
              ✕ ELIMINATED ({clinchSummary?.eliminatedCount ?? 0})
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 1: CLINCH RADAR (MAIN STANDINGS & CLINCH TABLE)           */}
        {/* ------------------------------------------------------------- */}
        {tab === 'clinch' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rank-col">SEED</th>
                  <th>FRANCHISE</th>
                  <th>{hasMedian ? 'RECORD (H2H + MED)' : 'RECORD'}</th>
                  {hasMedian && <th>MEDIAN RECORD</th>}
                  <th>BYE STATUS</th>
                  <th>PLAYOFF STATUS</th>
                  <th>CLINCH METER</th>
                  <th>PLAYOFF M#</th>
                  <th>BYE M#</th>
                  <th>PLAYOFF ODDS</th>
                  <th>POINTS FOR</th>
                  <th>SCENARIOS</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => {
                  const isByeCutoff = team.seed === byeSpots && filter === 'ALL'
                  const isPlayoffCutoff = team.seed === playoffSpots && filter === 'ALL'
                  const isExpanded = expandedRosterId === team.rosterId

                  return (
                    <Fragment key={team.rosterId}>
                      <tr
                        className={`clickable-row ${team.seed <= byeSpots ? 'playoff-row' : team.seed <= playoffSpots ? 'playoff-row' : 'lottery-row'}`}
                        onClick={() => setExpandedRosterId(isExpanded ? null : team.rosterId)}
                      >
                        <td className="rank-cell">
                          <span className={`pick-number ${team.seed <= byeSpots ? 'odds-lottery' : team.seed <= playoffSpots ? '' : 'lottery-number'}`} style={team.seed <= byeSpots ? { background: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.35)', color: '#d8b4fe' } : {}}>
                            {String(team.seed).padStart(2, '0')}
                          </span>
                        </td>

                        <td className="franchise-cell">
                          <div className="team-cell">
                            {team.avatarUrl ? (
                              <img src={team.avatarUrl} alt="" className="team-avatar" />
                            ) : (
                              <div className="team-avatar-fallback">{team.name.charAt(0)}</div>
                            )}
                            <div className="team-meta">
                              <span className="team-title" title={team.name}>{team.name}</span>
                              <span className="team-sub">{team.ownerDisplayName}</span>
                            </div>
                          </div>
                        </td>

                        <td className="record-cell">
                          <div className="stat-primary">
                            <strong>{team.totalWins}–{team.totalLosses}{team.totalTies ? `–${team.totalTies}` : ''}</strong>
                            {hasMedian && (
                              <span className="record-sub">
                                {team.h2hWins}-{team.h2hLosses} H2H · {team.medianWins}-{team.medianLosses} Med
                              </span>
                            )}
                          </div>
                        </td>

                        {hasMedian && (
                          <td className="record-cell">
                            <span className="record-pill" style={{ color: '#7dd3fc' }}>
                              <b>{team.medianWins}–{team.medianLosses}</b> ({Math.round(team.medianWinPct * 100)}%)
                            </span>
                          </td>
                        )}

                        {/* BYE STATUS COLUMN */}
                        <td>
                          {team.hasClinchedBye ? (
                            <span className="status-pill status-clinched-bye"><Crown size={11} /> LOCKED BYE</span>
                          ) : team.seed <= byeSpots ? (
                            <span className="status-pill status-clinched-bye" style={{ background: 'rgba(168, 85, 247, 0.10)' }}>
                              <Crown size={11} /> Bye Seed #{team.seed}
                            </span>
                          ) : team.isEliminatedFromBye ? (
                            <span style={{ color: 'var(--muted)', fontSize: '11px', fontFamily: 'var(--mono)' }}>No Bye</span>
                          ) : (
                            <span className="status-pill" style={{ background: 'rgba(192, 132, 252, 0.10)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.25)' }}>
                              Bye Hunt ({formatPct(team.byeProbability)})
                            </span>
                          )}
                        </td>

                        {/* PLAYOFF STATUS COLUMN */}
                        <td>{renderStatusBadge(team.status, team.statusLabel)}</td>

                        {/* CLINCH METER */}
                        <td className="meter-cell">{renderMeter(team.clinchMeter, team.seed <= playoffSpots)}</td>

                        {/* PLAYOFF MAGIC NUMBER */}
                        <td>
                          {team.hasClinchedPlayoff ? (
                            <span className="magic-pill magic-lock"><Lock size={11} /> LOCK</span>
                          ) : team.magicNumber !== null ? (
                            <span className={`magic-pill ${team.magicNumber <= (hasMedian ? 4 : 2) ? 'magic-active' : 'magic-far'}`}>
                              M: {team.magicNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        {/* BYE MAGIC NUMBER */}
                        <td>
                          {team.hasClinchedBye ? (
                            <span className="magic-pill status-clinched-bye"><Crown size={11} /> LOCKED</span>
                          ) : team.byeMagicNumber !== null ? (
                            <span className="magic-pill magic-bye">
                              Bye M: {team.byeMagicNumber}
                            </span>
                          ) : team.isEliminatedFromBye ? (
                            <span style={{ color: 'var(--muted)', fontSize: '10px' }}>OUT</span>
                          ) : team.byeEliminationNumber !== null ? (
                            <span className="magic-pill elim-danger" style={{ fontSize: '10px' }}>
                              Bye E: {team.byeEliminationNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        <td className="numeric-cell">
                          <b style={{ color: team.playoffProbability >= 0.75 ? '#34d399' : team.playoffProbability <= 0.1 ? '#94a3b8' : '#38bdf8' }}>
                            {formatPct(team.playoffProbability)}
                          </b>
                        </td>

                        <td className="numeric-cell">{formatDec(team.pointsFor, 1)}</td>

                        <td>
                          <span className={`expand-toggle ${isExpanded ? 'open' : ''}`}>
                            <ChevronRight size={16} />
                          </span>
                        </td>
                      </tr>

                      {/* FIRST ROUND BYE CUTOFF LINE */}
                      {isByeCutoff && (
                        <tr className="cutoff-line-bye">
                          <td colSpan={hasMedian ? 12 : 11}>
                            👑 TOP {byeSpots} CLINCH FIRST-ROUND PLAYOFF BYE (ADVANCE TO SEMIFINALS) ▼
                          </td>
                        </tr>
                      )}

                      {/* PLAYOFF BUBBLE CUTOFF LINE */}
                      {isPlayoffCutoff && (
                        <tr className="cutoff-line-playoff">
                          <td colSpan={hasMedian ? 12 : 11}>
                            ▲ TOP {playoffSpots} QUALIFY FOR PLAYOFFS &nbsp;|&nbsp; BUBBLE CUTOFF LINE ▼
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}

                {!data && (
                  <tr>
                    <td colSpan={12} className="empty-cell">
                      {busy ? (
                        <><RefreshCw size={16} className="spin" /> Loading live Sleeper league data…</>
                      ) : (
                        <div className="empty-league-prompt">
                          <p style={{ fontSize: '15px', color: 'var(--ink)' }}>
                            Enter any public Sleeper League ID above to calculate live playoff clinch scenarios and magic numbers.
                          </p>
                          <p style={{ fontSize: '12px', color: 'var(--muted)', margin: '6px 0 14px' }}>
                            Full engine supporting both Head-to-Head and Weekly League Median scoring formats.
                          </p>
                          <button type="button" className="demo-button" onClick={loadDemo}>
                            <Sparkles size={13} /> Or explore with Demo League
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {data && filteredTeams.length === 0 && (
                  <tr>
                    <td colSpan={12} className="empty-cell">No teams match your filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: FIRST-ROUND BYE RACE (TOP 2 SEEDS FOCUS)               */}
        {/* ------------------------------------------------------------- */}
        {tab === 'bye' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rank-col">SEED</th>
                  <th>FRANCHISE</th>
                  <th>RECORD</th>
                  <th>BYE STATUS</th>
                  <th>BYE CLINCH METER</th>
                  <th>BYE MAGIC #</th>
                  <th>BYE ELIM #</th>
                  <th>BYE ODDS</th>
                  <th>GAMES AHEAD / BEHIND</th>
                  <th>POINTS FOR</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => {
                  const isByeCutoff = team.seed === byeSpots

                  return (
                    <Fragment key={team.rosterId}>
                      <tr className={team.seed <= byeSpots ? 'playoff-row' : 'lottery-row'}>
                        <td className="rank-cell">
                          <span className="pick-number" style={team.seed <= byeSpots ? { background: 'rgba(168, 85, 247, 0.15)', borderColor: 'rgba(168, 85, 247, 0.35)', color: '#d8b4fe' } : {}}>
                            {String(team.seed).padStart(2, '0')}
                          </span>
                        </td>

                        <td className="franchise-cell">
                          <div className="team-cell">
                            {team.avatarUrl ? (
                              <img src={team.avatarUrl} alt="" className="team-avatar" />
                            ) : (
                              <div className="team-avatar-fallback">{team.name.charAt(0)}</div>
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
                            {hasMedian && <span className="record-sub">{team.h2hWins}-{team.h2hLosses} H2H · {team.medianWins}-{team.medianLosses} Med</span>}
                          </div>
                        </td>

                        <td>
                          {team.hasClinchedBye ? (
                            <span className="status-pill status-clinched-bye"><Crown size={11} /> CLINCHED BYE</span>
                          ) : team.seed <= byeSpots ? (
                            <span className="status-pill status-clinched-bye"><Crown size={11} /> Bye Holder #{team.seed}</span>
                          ) : team.isEliminatedFromBye ? (
                            <span className="status-pill status-eliminated">Eliminated from Bye</span>
                          ) : (
                            <span className="status-pill" style={{ background: 'rgba(192, 132, 252, 0.12)', color: '#c084fc', border: '1px solid rgba(192, 132, 252, 0.3)' }}>
                              In Bye Hunt
                            </span>
                          )}
                        </td>

                        <td className="meter-cell">{renderMeter(team.byeMeter, team.seed <= byeSpots)}</td>

                        <td>
                          {team.hasClinchedBye ? (
                            <span className="magic-pill status-clinched-bye"><Crown size={11} /> LOCKED</span>
                          ) : team.byeMagicNumber !== null ? (
                            <span className="magic-pill magic-bye">
                              M: {team.byeMagicNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        <td>
                          {team.isEliminatedFromBye ? (
                            <span className="magic-pill elim-out">OUT</span>
                          ) : team.byeEliminationNumber !== null ? (
                            <span className="magic-pill elim-danger">
                              E: {team.byeEliminationNumber}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--muted)' }}>—</span>
                          )}
                        </td>

                        <td className="numeric-cell">
                          <b style={{ color: team.byeProbability >= 0.5 ? '#c084fc' : team.byeProbability <= 0.05 ? '#94a3b8' : '#38bdf8' }}>
                            {formatPct(team.byeProbability)}
                          </b>
                        </td>

                        <td className="numeric-cell">
                          {team.seed <= byeSpots
                            ? <span style={{ color: '#34d399' }}>+{team.gamesBehindBye === 0 ? (clinchSummary?.teams[byeSpots]?.totalWins ? team.totalWins - clinchSummary.teams[byeSpots].totalWins : 0) : 0} G lead</span>
                            : <span style={{ color: '#fb923c' }}>-{team.gamesBehindBye} G back</span>}
                        </td>

                        <td className="numeric-cell">{formatDec(team.pointsFor, 1)}</td>
                      </tr>

                      {isByeCutoff && (
                        <tr className="cutoff-line-bye">
                          <td colSpan={10}>
                            👑 TOP {byeSpots} CLINCH FIRST-ROUND PLAYOFF BYE (ADVANCE TO SEMIFINALS) ▼
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

        {/* Expanded Drawer Details */}
        {tab === 'clinch' && expandedRosterId !== null && (() => {
          const team = clinchSummary?.teams.find((t) => t.rosterId === expandedRosterId)
          if (!team) return null
          return (
            <div className="drawer-card" style={{ marginTop: '16px', background: 'var(--surface-raised)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <h3 style={{ margin: 0, font: '600 16px var(--display)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Target size={16} color="#38bdf8" /> Clinch Path Analysis: {team.name} (Seed #{team.seed})
                </h3>
                <button
                  type="button"
                  style={{ background: 'transparent', border: 0, color: 'var(--muted)', cursor: 'pointer', fontSize: '12px' }}
                  onClick={() => setExpandedRosterId(null)}
                >
                  Close ✕
                </button>
              </div>

              <div className="drawer-content" style={{ padding: 0 }}>
                {/* Clinch Paths */}
                <div>
                  {/* First-round bye path */}
                  {byeSpots > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <h4 style={{ color: '#c084fc', fontSize: '13px', margin: '0 0 8px' }}>
                        <Crown size={14} /> First-Round Bye Race (Top 2)
                      </h4>
                      {team.hasClinchedBye ? (
                        <p style={{ color: '#c084fc', fontSize: '12px', margin: 0 }}>
                          👑 <b>LOCKED FIRST-ROUND BYE!</b> Mathematically guaranteed a top 2 finish.
                        </p>
                      ) : team.clinchByeThisWeekScenarios.length > 0 ? (
                        <ul className="drawer-scenarios">
                          {team.clinchByeThisWeekScenarios.map((s, i) => (
                            <li key={i} className="bye-scenario"><Crown size={14} /> <span>{s}</span></li>
                          ))}
                        </ul>
                      ) : team.isEliminatedFromBye ? (
                        <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>
                          Mathematically eliminated from a top 2 bye. Focusing on locking a playoff seed.
                        </p>
                      ) : (
                        <p style={{ color: 'var(--ink-secondary)', fontSize: '12px', margin: 0 }}>
                          Bye Magic #{team.byeMagicNumber ?? 'N/A'}. Needs wins + Seed 3 ({seed3?.name}) losses down the stretch to lock a bye.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Playoff path */}
                  <h4 style={{ color: '#34d399', fontSize: '13px', margin: '0 0 8px' }}>
                    <ShieldCheck size={14} /> Playoff Clinch Scenarios (This Week)
                  </h4>
                  {team.clinchThisWeekScenarios.length > 0 ? (
                    <ul className="drawer-scenarios">
                      {team.clinchThisWeekScenarios.map((s, i) => (
                        <li key={i} className="clinch-scenario"><Check size={14} /> <span>{s}</span></li>
                      ))}
                    </ul>
                  ) : team.hasClinchedPlayoff ? (
                    <p style={{ color: '#34d399', fontSize: '12px', margin: 0 }}>
                      🎉 <b>CLINCHED PLAYOFFS!</b> This team has mathematically secured a playoff ticket.
                    </p>
                  ) : team.isEliminatedFromPlayoffs ? (
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                      Mathematically eliminated from contention.
                    </p>
                  ) : (
                    <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>
                      Cannot mathematically clinch this week. Wins this week will reduce their Playoff Magic Number ({team.magicNumber}) for Week {(clinchSummary?.currentWeek ?? 1) + 1}.
                    </p>
                  )}

                  {/* Elimination Threat */}
                  {team.eliminatedThisWeekScenarios.length > 0 && (
                    <div style={{ marginTop: '14px' }}>
                      <h4 style={{ color: '#f87171', fontSize: '13px', margin: '0 0 8px' }}>
                        <ShieldAlert size={14} /> Elimination Threat (This Week)
                      </h4>
                      <ul className="drawer-scenarios">
                        {team.eliminatedThisWeekScenarios.map((s, i) => (
                          <li key={i} className="elim-scenario">✕ <span>{s}</span></li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Performance & Median Breakdown */}
                <div>
                  <h4 style={{ color: '#38bdf8', fontSize: '13px', margin: '0 0 8px' }}>
                    <Award size={14} /> Performance &amp; Median Breakdown
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '11.5px' }}>
                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '9px' }}>ALL-PLAY EXPECTED WINS</span>
                      <strong style={{ fontSize: '14px' }}>{team.expectedWins.toFixed(1)}</strong> ({Math.round(team.allPlayPercentage * 100)}% Win Rate)
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '4px' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '9px' }}>SCHEDULE LUCK FACTOR</span>
                      <strong style={{ fontSize: '14px' }}>{renderLuck(team.scheduleLuck)}</strong>
                    </div>
                    <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '4px', gridColumn: 'span 2' }}>
                      <span style={{ color: 'var(--muted)', display: 'block', fontSize: '9px' }}>LEAGUE MEDIAN PERFORMANCE</span>
                      <strong style={{ fontSize: '13px' }}>
                        {team.medianWins} Wins – {team.medianLosses} Losses ({Math.round(team.medianWinPct * 100)}%)
                      </strong> vs. Weekly Scoring Median
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ------------------------------------------------------------- */}
        {/* TAB 3: EXPECTED WINS & SCHEDULE LUCK MATRIX                    */}
        {/* ------------------------------------------------------------- */}
        {tab === 'expected' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rank-col">RANK</th>
                  <th>FRANCHISE</th>
                  <th>ACTUAL RECORD</th>
                  <th>ALL-PLAY EXPECTED WINS</th>
                  <th>SCHEDULE LUCK</th>
                  <th>ALL-PLAY %</th>
                  <th>MEDIAN RECORD</th>
                  <th>POINTS FOR</th>
                  <th>POINTS AGAINST</th>
                  <th>VERDICT</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team, idx) => {
                  const luck = team.scheduleLuck
                  let verdict = 'Fair Schedule'
                  if (luck >= 2.0) verdict = '🍀 Highly Lucky'
                  else if (luck >= 1.0) verdict = 'Lucky Schedule'
                  else if (luck <= -2.0) verdict = '🔥 Brutal Bad Luck'
                  else if (luck <= -1.0) verdict = 'Unlucky Schedule'

                  return (
                    <tr key={team.rosterId} className={team.seed <= playoffSpots ? 'playoff-row' : 'lottery-row'}>
                      <td className="rank-cell">
                        <span className={`pick-number ${team.seed <= playoffSpots ? '' : 'lottery-number'}`}>
                          {String(idx + 1).padStart(2, '0')}
                        </span>
                      </td>

                      <td className="franchise-cell">
                        <div className="team-cell">
                          {team.avatarUrl ? (
                            <img src={team.avatarUrl} alt="" className="team-avatar" />
                          ) : (
                            <div className="team-avatar-fallback">{team.name.charAt(0)}</div>
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
                        </div>
                      </td>

                      <td className="numeric-cell" style={{ fontWeight: 600 }}>
                        {team.expectedWins.toFixed(1)} W
                      </td>

                      <td>{renderLuck(team.scheduleLuck)}</td>

                      <td className="numeric-cell">
                        {Math.round(team.allPlayPercentage * 100)}%
                      </td>

                      <td className="record-cell">
                        <span className="record-pill" style={{ color: '#7dd3fc' }}>
                          {team.medianWins}–{team.medianLosses} ({Math.round(team.medianWinPct * 100)}%)
                        </span>
                      </td>

                      <td className="numeric-cell">{formatDec(team.pointsFor, 1)}</td>
                      <td className="numeric-cell" style={{ color: 'var(--muted)' }}>{formatDec(team.pointsAgainst, 1)}</td>

                      <td>
                        <span style={{ font: '600 10.5px var(--mono)', color: luck > 0 ? '#4ade80' : luck < 0 ? '#fb7185' : 'var(--muted)' }}>
                          {verdict}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: INTERACTIVE WHAT-IF PLAYOFF MACHINE                    */}
        {/* ------------------------------------------------------------- */}
        {tab === 'simulator' && (
          <div className="simulator-wrap">
            <div className="sim-controls-header">
              <div>
                <strong style={{ font: '600 15px var(--display)' }}>Playoff Scenario Simulator</strong>
                <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: '12px' }}>
                  Click remaining matchup winners (and median beats) to test clinching paths and see live standings recalculate.
                </p>
              </div>
              <button
                type="button"
                className="refresh-button"
                onClick={handleResetSim}
                title="Reset simulation overrides"
              >
                <RotateCcw size={13} />
                <span>RESET PICKS</span>
              </button>
            </div>

            {/* Live Standings Simulator Bar */}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PROJECTED SEED</th>
                    <th>FRANCHISE</th>
                    <th>PROJECTED WINS</th>
                    <th>ORIGINAL WINS</th>
                    <th>STATUS AFTER PICKS</th>
                  </tr>
                </thead>
                <tbody>
                  {simulatedTeams.map((team, idx) => {
                    const isBye = idx < byeSpots
                    const isPlayoff = idx < playoffSpots
                    return (
                      <tr key={team.rosterId} className={isPlayoff ? 'playoff-row' : 'lottery-row'}>
                        <td className="rank-cell">
                          <span className={`pick-number ${isPlayoff ? '' : 'lottery-number'}`}>
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                        </td>
                        <td className="franchise-cell">
                          <span className="franchise-name">{team.name}</span>
                        </td>
                        <td className="numeric-cell">
                          <b style={{ color: team.addedWins > 0 ? '#34d399' : 'var(--ink)' }}>
                            {team.simTotalWins} Wins {team.addedWins > 0 ? `(+${team.addedWins})` : ''}
                          </b>
                        </td>
                        <td className="numeric-cell" style={{ color: 'var(--muted)' }}>
                          {team.totalWins} Wins
                        </td>
                        <td>
                          {isBye ? (
                            <span className="status-pill status-clinched-bye"><Crown size={11} /> Round 1 Bye (Seed #{idx + 1})</span>
                          ) : isPlayoff ? (
                            <span className="status-pill status-clinched-playoff"><Check size={11} /> Playoff Seed #{idx + 1}</span>
                          ) : (
                            <span className="status-pill status-eliminated">Out of Playoff Field</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Upcoming Matchup Cards */}
            <div className="sim-week-grid">
              {Array.from({ length: Math.min(3, clinchSummary?.remainingWeeks ?? 0) }, (_, i) => {
                const weekNum = (clinchSummary?.currentWeek ?? 1) + i
                const weekFeed = data?.weeks[weekNum]
                const matchups = weekFeed?.matchups || []

                const pairs = new Map<number, typeof matchups>()
                for (const m of matchups) {
                  if (m.matchup_id != null) {
                    const list = pairs.get(m.matchup_id) || []
                    list.push(m)
                    pairs.set(m.matchup_id, list)
                  }
                }

                return (
                  <div key={weekNum} className="sim-week-card">
                    <h4 className="sim-week-title">
                      <span>WEEK {weekNum} MATCHUPS</span>
                      <span style={{ fontSize: '10px', color: 'var(--muted)' }}>{pairs.size} Head-to-Head Games</span>
                    </h4>

                    {Array.from(pairs.entries()).map(([matchupId, pair]) => {
                      if (pair.length < 2) return null
                      const t1 = clinchSummary?.teams.find((t) => t.rosterId === pair[0].roster_id)
                      const t2 = clinchSummary?.teams.find((t) => t.rosterId === pair[1].roster_id)
                      if (!t1 || !t2) return null

                      const pickedWinner = simMatchupWinners[weekNum]?.[matchupId]

                      return (
                        <div key={matchupId} className="sim-matchup-row">
                          <div className="sim-matchup-teams">
                            <button
                              type="button"
                              className={`sim-team-btn ${pickedWinner === t1.rosterId ? 'picked-win' : ''}`}
                              onClick={() => handlePickWinner(weekNum, matchupId, t1.rosterId)}
                            >
                              <span>{t1.name}</span>
                              {pickedWinner === t1.rosterId && <Check size={12} />}
                            </button>
                            <span className="sim-vs">VS</span>
                            <button
                              type="button"
                              className={`sim-team-btn ${pickedWinner === t2.rosterId ? 'picked-win' : ''}`}
                              onClick={() => handlePickWinner(weekNum, matchupId, t2.rosterId)}
                            >
                              <span>{t2.name}</span>
                              {pickedWinner === t2.rosterId && <Check size={12} />}
                            </button>
                          </div>

                          {hasMedian && (
                            <div className="sim-median-toggle">
                              <span>BEATS MEDIAN:</span>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <button
                                  type="button"
                                  className={`sim-median-btn ${simMedianWinners[weekNum]?.[t1.rosterId] ? 'active' : ''}`}
                                  onClick={() => handleToggleMedian(weekNum, t1.rosterId)}
                                >
                                  {t1.name.slice(0, 8)}: +1W
                                </button>
                                <button
                                  type="button"
                                  className={`sim-median-btn ${simMedianWinners[weekNum]?.[t2.rosterId] ? 'active' : ''}`}
                                  onClick={() => handleToggleMedian(weekNum, t2.rosterId)}
                                >
                                  {t2.name.slice(0, 8)}: +1W
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        <footer className="table-footer">
          <div className="legend">
            <span><i className="legend-dot" style={{ background: '#c084fc' }} /> SEEDS 1–{byeSpots} FIRST-ROUND BYE</span>
            <span><i className="legend-dot playoff-dot" /> SEEDS {byeSpots + 1}–{playoffSpots} PLAYOFF QUALIFIED</span>
            <span><i className="legend-dot lottery-dot" /> SEEDS {playoffSpots + 1}–{totalTeams} ELIMINATION BUBBLE</span>
            <span><ShieldCheck size={14} /> LEAGUE MEDIAN SUPPORT ACTIVE</span>
          </div>
          <span className="simulation-note">
            {totalTeams ? `${totalTeams} TEAMS · ${hasMedian ? '2 WINS PER WEEK (H2H + MEDIAN)' : '1 WIN PER WEEK'} · EXACT CLINCH MATH` : 'ENTER A SLEEPER LEAGUE ID TO BEGIN'}
          </span>
        </footer>
      </section>

      {/* Educational Accordion */}
      <details className="model-details" open style={{ marginTop: '36px' }}>
        <summary>
          <span className="method-icon"><HelpCircle size={18} /></span>
          <div className="model-heading">
            <span className="model-tag">ANALYTICS GUIDE</span>
            <strong>How Playoff Clinch Math, First-Round Byes, &amp; League Median Work</strong>
          </div>
          <ChevronDown className="model-chevron" size={17} />
        </summary>
        <div className="model-content">
          <div className="model-cards-grid">
            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">FIRST-ROUND BYE</span>
                <h4>Top 2 Seeds Earn a Bye</h4>
              </div>
              <p>
                In 6-team playoff brackets, Seeds 1 and 2 skip the quarterfinal round and advance straight to the semifinals. The <b>Bye Magic Number</b> measures the combination of your wins and Seed 3 losses required to lock a top-2 finish.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">MAGIC NUMBER (M)</span>
                <h4>Clinching Mathematical Locks</h4>
              </div>
              <p>
                A team clinches a playoff spot when it is mathematically impossible for the first team outside the cutoff (Seed #{playoffSpots + 1}) to catch them. When $M = 0$, you are officially locked!
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">LEAGUE MEDIAN</span>
                <h4>Two Games Every Week</h4>
              </div>
              <p>
                In leagues using median scoring, each week offers 2 wins: 1 from your Head-to-Head matchup and 1 from scoring in the top 50% of the league. This doubles the total regular-season games and accelerates clinching and elimination races.
              </p>
            </div>
          </div>
        </div>
      </details>
    </main>
  )
}

export default App
