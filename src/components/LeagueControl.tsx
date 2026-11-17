import { Check, Clock3, RefreshCw, Share2 } from 'lucide-react'
import type { UserLeagueSummary } from '../sleeper'

export interface RecentLeague {
  id: string
  name: string
  season: string
}

interface LeagueControlProps {
  leagueId: string
  activeLeagueId?: string
  busy: boolean
  copied: boolean
  lastUpdated: number | null
  userLeagues: UserLeagueSummary[]
  resolvedUserLabel: string
  recentLeagues: RecentLeague[]
  onLeagueIdChange: (value: string) => void
  onRefresh: () => void
  onCopyShareUrl: () => void
  onSelectUserLeague: (leagueId: string) => void
  onSelectRecentLeague: (leagueId: string) => void
}

export function LeagueControl({
  leagueId,
  activeLeagueId,
  busy,
  copied,
  lastUpdated,
  userLeagues,
  resolvedUserLabel,
  recentLeagues,
  onLeagueIdChange,
  onRefresh,
  onCopyShareUrl,
  onSelectUserLeague,
  onSelectRecentLeague,
}: LeagueControlProps) {
  return (
    <div className="league-control">
      <label htmlFor="league-id">SLEEPER LEAGUE ID OR USERNAME</label>
      <div className="league-input-row">
        <input
          id="league-id"
          type="text"
          value={leagueId}
          onChange={(e) => onLeagueIdChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRefresh()
          }}
          placeholder="League ID or @username"
          aria-label="Sleeper League ID or username"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          className={`share-button ${copied ? 'copied' : ''}`}
          onClick={onCopyShareUrl}
          title="Copy shareable link"
          disabled={busy || !leagueId.trim()}
        >
          {copied ? <Check size={13} /> : <Share2 size={13} />}
          <span>{copied ? 'Copied' : 'Share'}</span>
        </button>
        <button
          type="button"
          className="refresh-button"
          onClick={onRefresh}
          disabled={busy || !leagueId.trim()}
          title="Refresh live data"
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
            : 'ENTER A SLEEPER LEAGUE ID OR @USERNAME'}
        </span>
      </div>

      {userLeagues.length > 1 && (
        <div className="quick-leagues-row" aria-label={`Leagues for @${resolvedUserLabel}`}>
          <span className="quick-leagues-label">@{resolvedUserLabel}</span>
          {userLeagues.map((entry) => (
            <button
              key={entry.league_id}
              type="button"
              className={`quick-league-chip ${activeLeagueId === entry.league_id ? 'active' : ''}`}
              onClick={() => onSelectUserLeague(entry.league_id)}
              disabled={busy}
              title={`${entry.name} (${entry.season} · ${entry.total_rosters} teams)`}
            >
              <span>{entry.name}</span>
              {entry.isDynasty && <span className="dynasty-badge">DYN</span>}
            </button>
          ))}
        </div>
      )}

      {userLeagues.length <= 1 && recentLeagues.length > 0 && (
        <div className="quick-leagues-row" aria-label="Recent leagues">
          <span className="quick-leagues-label">RECENT</span>
          {recentLeagues.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`quick-league-chip ${activeLeagueId === entry.id ? 'active' : ''}`}
              onClick={() => onSelectRecentLeague(entry.id)}
              disabled={busy}
              title={`${entry.name} (${entry.season})`}
            >
              <span>{entry.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
