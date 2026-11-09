import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  Award,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
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
  TrendingDown,
  TrendingUp,
  Trophy,
  Zap,
} from 'lucide-react'
import { analyzeLeagueClinch, type ClinchStatus, type LeagueClinchSummary } from './clinch'
import { getDemoLeagueData } from './demoData'
import { projectDraftOrder } from './projection'
import { loadLeagueData, type LeagueData } from './sleeper'
import './App.css'

type MainTab = 'clinch' | 'expected' | 'simulator' | 'picks'
type FilterOption = 'ALL' | 'CLINCHED' | 'BUBBLE' | 'ELIMINATED'

const formatNumber = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
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
    const saved = localStorage.getItem('last_league_id')
    if (saved && saved.trim()) return saved.trim()
  }
  return ''
}

export function App() {
  const initialId = useMemo(getInitialLeagueId, [])
  const initialData = useMemo(() => {
    if (!initialId || initialId === 'demo-median-league' || initialId.startsWith('demo')) {
      return getDemoLeagueData()
    }
    return null
  }, [initialId])

  const [leagueId, setLeagueId] = useState(initialId || 'demo-median-league')
  const [data, setData] = useState<LeagueData | null>(initialData)
  const [busy, setBusy] = useState(Boolean(initialId && initialId !== 'demo-median-league' && !initialId.startsWith('demo')))
  const [error, setError] = useState('')
  const [tab, setTab] = useState<MainTab>('clinch')
  const [filter, setFilter] = useState<FilterOption>('ALL')
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState<number | null>(initialData?.lastUpdated ?? null)
  const [copied, setCopied] = useState(false)
  const [expandedRosterId, setExpandedRosterId] = useState<number | null>(null)

  // Simulation overrides: week -> matchupId -> winnerRosterId
  const [simMatchupWinners, setSimMatchupWinners] = useState<Record<number, Record<number, number>>>({})
  // Simulation overrides: week -> rosterId -> beatMedian (boolean)
  const [simMedianWinners, setSimMedianWinners] = useState<Record<number, Record<number, boolean>>>({})

  async function refresh(targetId?: string) {
    const activeId = (targetId ?? leagueId).trim()
    if (!activeId || activeId === 'demo-median-league' || activeId.startsWith('demo')) {
      loadDemo()
      return
    }
    setBusy(true)
    setError('')
    try {
      const next = await loadLeagueData(activeId)
      setData(next)
      setLastUpdated(next.lastUpdated)
      if (typeof window !== 'undefined') {
        localStorage.setItem('last_league_id', activeId)
        const url = new URL(window.location.href)
        url.searchParams.set('league', activeId)
        window.history.replaceState({}, '', url.toString())
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load league data.')
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
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.searchParams.set('league', 'demo-median-league')
        window.history.replaceState({}, '', url.toString())
      }
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
    const id = getInitialLeagueId()
    if (id && id !== 'demo-median-league' && !id.startsWith('demo')) {
      void refresh(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Analyze Clinch & Expected Wins
  const clinchSummary: LeagueClinchSummary | null = useMemo(() => {
    if (!data) return null
    return analyzeLeagueClinch(data)
  }, [data])

  // Draft pick projections (for legacy draft tab)
  const picks = useMemo(() => (data ? projectDraftOrder(data) : []), [data])

  // Filtered teams list
  const query = search.trim().toLowerCase()
  const filteredTeams = useMemo(() => {
    if (!clinchSummary) return []
    return clinchSummary.teams.filter((team) => {
      const matchesSearch = !query || `${team.name} ${team.ownerDisplayName}`.toLowerCase().includes(query)
      if (!matchesSearch) return false

      if (filter === 'CLINCHED') {
        return team.status === 'CLINCHED_PLAYOFF' || team.status === 'CLINCHED_BYE'
      }
      if (filter === 'BUBBLE') {
        return team.status === 'ON_THE_BUBBLE' || team.status === 'IN_THE_HUNT'
      }
      if (filter === 'ELIMINATED') {
        return team.status === 'ELIMINATED'
      }
      return true
    })
  }, [clinchSummary, query, filter])

  // Helper for status badge
  function renderStatusBadge(status: ClinchStatus, label: string) {
    switch (status) {
      case 'CLINCHED_BYE':
        return <span className="status-pill status-clinched-bye"><Trophy size={12} /> {label}</span>
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
  function renderClinchMeter(meter: number, status: ClinchStatus) {
    let fillClass = 'meter-fill-mid'
    if (status === 'CLINCHED_BYE' || status === 'CLINCHED_PLAYOFF') fillClass = 'meter-fill-clinched'
    else if (status === 'IN_THE_HUNT') fillClass = 'meter-fill-high'
    else if (status === 'WORK_TO_DO') fillClass = 'meter-fill-low'
    else if (status === 'ELIMINATED') fillClass = 'meter-fill-elim'

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
      return <span className="luck-pill luck-even">0.0 (Even)</span>
    }
    if (luck > 0) {
      return <span className="luck-pill luck-lucky"><TrendingUp size={11} /> +{luck.toFixed(1)} W</span>
    }
    return <span className="luck-pill luck-unlucky"><TrendingDown size={11} /> {luck.toFixed(1)} W</span>
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

  // Reset simulator
  function handleResetSim() {
    setSimMatchupWinners({})
    setSimMedianWinners({})
  }

  // Compute simulated standings
  const simulatedTeams = useMemo(() => {
    if (!clinchSummary) return []
    const overrideWins = new Map<number, number>()

    // Add up simulation picks
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
  const hasMedian = clinchSummary?.hasMedianMatch ?? false

  return (
    <main className="app-shell">
      {/* Top Bar */}
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Fantasy Playoffs home">
          <span className="brand-mark" style={{ background: '#38bdf8', color: '#0a0b0d' }}>
            <Trophy size={16} strokeWidth={2.5} />
          </span>
          <span>FANTASY<span className="brand-light">PLAYOFFS</span></span>
        </a>
        <div className="topbar-right">
          <span className="season-label">{clinchSummary ? `${clinchSummary.season} SEASON` : 'DYNASTY / 2026'}</span>
          <span className="live-dot" />
          <span className="live-label">LIVE DATA</span>
        </div>
      </header>

      {/* Intro Header & League Bar */}
      <section className="intro" id="top">
        <div>
          <p className="eyebrow">
            PLAYOFF CLINCH &amp; EXPECTED WINS <span>·</span> WEEK {clinchSummary?.currentWeek || '--'}
          </p>
          <h1>The Playoff Race, <em>Decoded.</em></h1>
          <p className="intro-copy">
            Exact magic numbers, clinch scenarios, and all-play expected wins — engineered with full weekly league median support.
          </p>
        </div>

        <div className="league-control">
          <label htmlFor="league-id">SLEEPER LEAGUE ID</label>
          <div className="league-input-row">
            <input
              id="league-id"
              value={leagueId}
              onChange={(event) => setLeagueId(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') void refresh() }}
              placeholder="Enter League ID"
              aria-label="Sleeper League ID"
              inputMode="numeric"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              className="demo-button"
              onClick={loadDemo}
              title="Load realistic demo league with active median scoring"
            >
              <Sparkles size={13} />
              <span>DEMO</span>
            </button>
            <button
              type="button"
              className={`share-button ${copied ? 'copied' : ''}`}
              onClick={() => void copyShareUrl()}
              title="Copy shareable link to this league"
            >
              {copied ? <Check size={13} /> : <Share2 size={13} />}
              <span>{copied ? 'COPIED' : 'SHARE'}</span>
            </button>
            <button
              type="button"
              className="refresh-button"
              onClick={() => void refresh()}
              disabled={busy || !leagueId.trim()}
              title="Refresh live league data"
            >
              <RefreshCw size={14} className={busy ? 'spin' : ''} />
              <span>{busy ? 'UPDATING' : 'REFRESH'}</span>
            </button>
          </div>
          <div className="refresh-meta">
            <Clock3 size={12} />
            {lastUpdated
              ? `UPDATED ${new Date(lastUpdated).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} · SLEEPER SYNC`
              : 'ENTER A SLEEPER LEAGUE ID OR CLICK DEMO'}
          </div>
        </div>
      </section>

      {error && (
        <div className="error-banner">
          <CircleAlert size={16} />
          <span>Live data unavailable: {error}</span>
          <button type="button" onClick={() => void refresh()}>Retry</button>
        </div>
      )}

      {/* Summary KPI Strip */}
      <section className="summary-strip" aria-label="League summary">
        <div className="summary-item">
          <span className="summary-label">LEAGUE &amp; SCORING</span>
          <strong>{clinchSummary?.leagueName ?? (busy ? 'Connecting…' : 'No league connected')}</strong>
          <span className="summary-note">
            {clinchSummary
              ? `${totalTeams} Teams · ${hasMedian ? '⚡ League Median Active (2W/Wk)' : 'Head-to-Head (1W/Wk)'}`
              : 'Enter a league ID above'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">REGULAR SEASON PROGRESS</span>
          <strong>
            WEEK {clinchSummary?.currentWeek || '--'} <span className="summary-muted">/ {clinchSummary?.regularSeasonEnd ?? 14}</span>
          </strong>
          <span className="summary-note">
            {clinchSummary
              ? `${clinchSummary.remainingWeeks} weeks remaining (${clinchSummary.remainingGamesPerTeam} max wins left)`
              : 'Awaiting league ID'}
          </span>
        </div>
        <div className="summary-item">
          <span className="summary-label">PLAYOFF BRACKET CUTOFF</span>
          <strong>TOP {playoffSpots} QUALIFY</strong>
          <span className="summary-note">
            {clinchSummary
              ? `${clinchSummary.clinchedCount} Clinched · ${clinchSummary.bubbleCount} In Hunt/Bubble · ${clinchSummary.eliminatedCount} Out`
              : 'Top seeds advance'}
          </span>
        </div>
      </section>

      {/* Navigation Tabs */}
      <section className="projection-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              INTELLIGENCE DASHBOARD <span>·</span> {clinchSummary?.leagueName.toUpperCase() ?? 'SLEEPER'}
            </p>
            <h2>
              {tab === 'clinch' && 'Playoff Clinch Radar'}
              {tab === 'expected' && 'Expected Wins & Schedule Luck'}
              {tab === 'simulator' && 'Interactive What-If Playoff Machine'}
              {tab === 'picks' && 'Dynasty Rookie Draft Assets'}
            </h2>
          </div>

          <div className="board-tools">
            {tab !== 'simulator' && (
              <div className="search-box">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
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
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'picks'}
                className={tab === 'picks' ? 'selected' : ''}
                onClick={() => setTab('picks')}
              >
                DRAFT PICKS
              </button>
            </div>
          </div>
        </div>

        {/* Filter pills on clinch view */}
        {tab === 'clinch' && (
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
        {/* TAB 1: CLINCH RADAR TABLE                                     */}
        {/* ------------------------------------------------------------- */}
        {tab === 'clinch' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rank-col">SEED</th>
                  <th>FRANCHISE</th>
                  <th>RECORD</th>
                  <th>CLINCH STATUS</th>
                  <th>CLINCH METER</th>
                  <th>MAGIC #</th>
                  <th>ELIM #</th>
                  <th>PLAYOFF ODDS</th>
                  <th>POINTS FOR</th>
                  <th>SCENARIOS</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map((team) => {
                  const isCutoffLine = team.seed === playoffSpots && filter === 'ALL'
                  const isExpanded = expandedRosterId === team.rosterId

                  return (
                    <Fragment key={team.rosterId}>
                      <tr
                        className={`clickable-row ${team.seed <= playoffSpots ? 'playoff-row' : 'lottery-row'}`}
                        onClick={() => setExpandedRosterId(isExpanded ? null : team.rosterId)}
                      >
                      <td className="rank-cell">
                        <span className={`pick-number ${team.seed <= playoffSpots ? '' : 'lottery-number'}`}>
                          {String(team.seed).padStart(2, '0')}
                        </span>
                      </td>

                      <td className="franchise-cell">
                        <span className="franchise-name" title={team.name}>{team.name}</span>
                        <small style={{ color: 'var(--muted)', fontSize: '10px' }}>{team.ownerDisplayName}</small>
                      </td>

                      <td className="record-cell">
                        <span className="record-pill">
                          <b>{team.totalWins}–{team.totalLosses}{team.totalTies ? `–${team.totalTies}` : ''}</b>
                        </span>
                        {hasMedian && (
                          <span className="record-sub">
                            {team.h2hWins}-{team.h2hLosses} H2H · {team.medianWins}-{team.medianLosses} Med
                          </span>
                        )}
                      </td>

                      <td>{renderStatusBadge(team.status, team.statusLabel)}</td>

                      <td className="meter-cell">{renderClinchMeter(team.clinchMeter, team.status)}</td>

                      <td>
                        {team.magicNumber === 0 ? (
                          <span className="magic-pill magic-lock"><Lock size={11} /> LOCK</span>
                        ) : team.magicNumber !== null ? (
                          <span className={`magic-pill ${team.magicNumber <= (hasMedian ? 4 : 2) ? 'magic-active' : 'magic-far'}`}>
                            M: {team.magicNumber}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>—</span>
                        )}
                      </td>

                      <td>
                        {team.eliminationNumber === 0 ? (
                          <span className="magic-pill elim-out">OUT</span>
                        ) : team.eliminationNumber !== null ? (
                          <span className={`magic-pill ${team.eliminationNumber <= (hasMedian ? 4 : 2) ? 'elim-danger' : 'magic-far'}`}>
                            E: {team.eliminationNumber}
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

                      <td className="numeric-cell">{formatNumber(team.pointsFor)}</td>

                      <td>
                        <span className={`expand-toggle ${isExpanded ? 'open' : ''}`}>
                          <ChevronRight size={16} />
                        </span>
                      </td>
                    </tr>
                    {isCutoffLine && (
                      <tr className="playoff-cutoff-line">
                        <td colSpan={10}>
                          ▲ TOP {playoffSpots} QUALIFY FOR PLAYOFFS &nbsp;|&nbsp; BUBBLE CUTOFF LINE ▼
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}

                {!data && (
                  <tr>
                    <td colSpan={10} className="empty-cell">
                      {busy ? <><RefreshCw size={16} className="spin" /> Calculating playoff clinch models…</> : 'Enter a Sleeper league ID above or click DEMO.'}
                    </td>
                  </tr>
                )}
                {data && filteredTeams.length === 0 && (
                  <tr>
                    <td colSpan={10} className="empty-cell">No teams match your filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Expanded Drawer Details (if any selected) */}
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
                  <h4 style={{ color: '#34d399', fontSize: '13px', margin: '0 0 8px' }}>
                    <ShieldCheck size={14} /> Clinching Scenarios (This Week)
                  </h4>
                  {team.clinchThisWeekScenarios.length > 0 ? (
                    <ul className="drawer-scenarios">
                      {team.clinchThisWeekScenarios.map((s, i) => (
                        <li key={i} className="clinch-scenario"><Check size={14} /> <span>{s}</span></li>
                      ))}
                    </ul>
                  ) : team.status === 'CLINCHED_PLAYOFF' || team.status === 'CLINCHED_BYE' ? (
                    <p style={{ color: '#34d399', fontSize: '12px', margin: 0 }}>
                      🎉 <b>CLINCHED!</b> This team has mathematically secured a playoff spot and cannot be passed by enough teams to miss.
                    </p>
                  ) : team.status === 'ELIMINATED' ? (
                    <p style={{ color: '#94a3b8', fontSize: '12px', margin: 0 }}>
                      Mathematically eliminated from contention.
                    </p>
                  ) : (
                    <p style={{ color: 'var(--muted)', fontSize: '12px', margin: 0 }}>
                      Cannot mathematically clinch this week. Wins this week will reduce their Magic Number for Week {(clinchSummary?.currentWeek ?? 1) + 1}.
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
                    <Award size={14} /> Performance &amp; Schedule Breakdown
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
                    {hasMedian && (
                      <div style={{ background: 'var(--surface)', padding: '8px 10px', borderRadius: '4px', gridColumn: 'span 2' }}>
                        <span style={{ color: 'var(--muted)', display: 'block', fontSize: '9px' }}>MEDIAN RECORD BREAKDOWN</span>
                        <strong style={{ fontSize: '13px' }}>{team.medianWins} Wins – {team.medianLosses} Losses</strong> vs. League Scoring Median
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ------------------------------------------------------------- */}
        {/* TAB 2: EXPECTED WINS & SCHEDULE LUCK MATRIX                    */}
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
                        <span className="franchise-name" title={team.name}>{team.name}</span>
                        <small style={{ color: 'var(--muted)', fontSize: '10px' }}>{team.ownerDisplayName}</small>
                      </td>

                      <td className="record-cell">
                        <span className="record-pill">
                          <b>{team.totalWins}–{team.totalLosses}</b>
                        </span>
                      </td>

                      <td className="numeric-cell" style={{ fontWeight: 600 }}>
                        {team.expectedWins.toFixed(1)} W
                      </td>

                      <td>{renderLuck(team.scheduleLuck)}</td>

                      <td className="numeric-cell">
                        {Math.round(team.allPlayPercentage * 100)}%
                      </td>

                      <td className="record-cell">
                        {hasMedian ? (
                          <span className="record-pill">
                            {team.medianWins}–{team.medianLosses} ({Math.round((team.medianWins / Math.max(1, team.medianWins + team.medianLosses)) * 100)}%)
                          </span>
                        ) : (
                          <span style={{ color: 'var(--muted)' }}>N/A</span>
                        )}
                      </td>

                      <td className="numeric-cell">{formatNumber(team.pointsFor)}</td>
                      <td className="numeric-cell" style={{ color: 'var(--muted)' }}>{formatNumber(team.pointsAgainst)}</td>

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
        {/* TAB 3: INTERACTIVE WHAT-IF PLAYOFF MACHINE                    */}
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
                          {isPlayoff ? (
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

                // Group matchups by matchup_id
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

        {/* ------------------------------------------------------------- */}
        {/* TAB 4: DYNASTY DRAFT PICKS                                     */}
        {/* ------------------------------------------------------------- */}
        {tab === 'picks' && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th className="rank-col">PICK</th>
                  <th>ORIGINAL FRANCHISE</th>
                  <th>PICK HOLDER</th>
                  <th>RECORD</th>
                  <th>PROJECTED MAX PF</th>
                  <th>CURRENT MAX PF</th>
                </tr>
              </thead>
              <tbody>
                {picks.map((team) => (
                  <tr key={team.roster.roster_id} className={team.pick <= (totalTeams - playoffSpots) ? 'lottery-row' : 'playoff-row'}>
                    <td className="rank-cell">
                      <span className={`pick-number ${team.pick <= (totalTeams - playoffSpots) ? 'lottery-number' : ''}`}>
                        {String(team.pick).padStart(2, '0')}
                      </span>
                    </td>
                    <td className="franchise-cell">
                      <span className="franchise-name">{team.name}</span>
                    </td>
                    <td className="holder-cell">
                      {team.pickHolder} {team.pickHolderId !== team.roster.roster_id && <span className="asset-tag">TRADED</span>}
                    </td>
                    <td className="record-cell">
                      <span className="record-pill">{team.record}</span>
                    </td>
                    <td className="numeric-cell">{formatNumber(team.maxPf)}</td>
                    <td className="numeric-cell">{formatNumber(team.currentMaxPf)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <footer className="table-footer">
          <div className="legend">
            <span><i className="legend-dot playoff-dot" /> SEEDS 1–{playoffSpots} PLAYOFF QUALIFIED</span>
            <span><i className="legend-dot lottery-dot" /> SEEDS {playoffSpots + 1}–{totalTeams} ELIMINATION / LOTTERY</span>
            <span><ShieldCheck size={14} /> LEAGUE MEDIAN SUPPORT ACTIVE</span>
          </div>
          <span className="simulation-note">
            {totalTeams} TEAMS · {hasMedian ? '2 WINS PER WEEK (H2H + MEDIAN)' : '1 WIN PER WEEK'} · EXACT CLINCH MATH
          </span>
        </footer>
      </section>

      {/* Educational Accordion */}
      <details className="model-details" open style={{ marginTop: '36px' }}>
        <summary>
          <span className="method-icon"><HelpCircle size={18} /></span>
          <div className="model-heading">
            <span className="model-tag">ANALYTICS GUIDE</span>
            <strong>How Playoff Clinch Math &amp; League Median Work</strong>
          </div>
          <ChevronDown className="model-chevron" size={17} />
        </summary>
        <div className="model-content">
          <div className="model-cards-grid">
            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">MAGIC NUMBER (M)</span>
                <h4>Clinching Mathematical Locks</h4>
              </div>
              <p>
                A team clinches a playoff spot when it is mathematically impossible for the first team outside the cutoff (Seed #{playoffSpots + 1}) to catch them. The <b>Magic Number</b> represents the combination of your wins and chaser losses required to lock the spot. When $M = 0$, you are officially locked!
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">LEAGUE MEDIAN</span>
                <h4>Two Games Every Week</h4>
              </div>
              <p>
                In leagues using median scoring (<code>league_average_match: 1</code>), each week offers 2 wins: 1 from your Head-to-Head matchup and 1 from scoring in the top 50% of the league. This doubles the total regular-season games and accelerates clinching or elimination races.
              </p>
            </div>

            <div className="model-card">
              <div className="model-card-header">
                <span className="model-card-tag">EXPECTED WINS (xW)</span>
                <h4>All-Play Schedule Luck</h4>
              </div>
              <p>
                Your <b>Expected Wins</b> measures how many games you would have won if you had played against every other team in the league each week. Comparing Actual Wins against Expected Wins reveals your Schedule Luck factor.
              </p>
            </div>
          </div>
        </div>
      </details>
    </main>
  )
}

export default App
