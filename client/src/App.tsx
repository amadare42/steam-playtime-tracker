import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type Bucket = 'hour' | 'day' | 'week'

type PlatformPercentages = {
  deck: number
  windows: number
  other: number
}

type GameFrame = {
  from: string
  to: string
  minutes: number
  day_total_minutes?: number
  week_total_minutes?: number
  platform_percentages?: PlatformPercentages
}

type GameBreakdown = {
  app_id: number
  name: string
  frames: GameFrame[]
}

type FrameGroup = {
  key: string
  title: string
  frames: GameFrame[]
}

type GroupedGameBreakdown = GameBreakdown & {
  frameGroups: FrameGroup[]
}

type RequestHistoryEntry = {
  username: string
  bucket: Bucket
  gameId: number | null
  frameKey: string | null
  savedAt: number
}

const BUCKET_MAX_MINUTES: Record<Bucket, number> = {
  hour: 60,
  day: 24 * 60,
  week: 7 * 24 * 60,
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
const REQUEST_HISTORY_STORAGE_KEY = 'steam-playtime.request-history'
const REQUEST_HISTORY_LIMIT = 5
const BREAKDOWN_PAGE_SIZE = 50

function toApiUrl(path: string) {
  return `${API_BASE_URL}${path}`
}

function toDate(value: string): Date {
  return new Date(value.replace(' ', 'T'))
}

function toFrameKey(frame: GameFrame): string {
  return `${frame.from}|${frame.to}`
}

function toHistoryKey(entry: Pick<RequestHistoryEntry, 'username' | 'bucket' | 'gameId' | 'frameKey'>): string {
  const normalizedUsername = entry.username.trim().toLowerCase()
  const gamePart = entry.gameId === null ? 'all-games' : String(entry.gameId)
  const framePart = entry.frameKey ?? 'all-frames'
  return `${normalizedUsername}|${entry.bucket}|${gamePart}|${framePart}`
}

function readRequestHistory(): RequestHistoryEntry[] {
  try {
    const raw = localStorage.getItem(REQUEST_HISTORY_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      return []
    }

    const normalized = parsed
      .filter((item): item is RequestHistoryEntry => (
        item
        && typeof item.username === 'string'
        && (item.bucket === 'hour' || item.bucket === 'day' || item.bucket === 'week')
        && (item.gameId === null || typeof item.gameId === 'number')
        && (item.frameKey === null || typeof item.frameKey === 'string')
        && typeof item.savedAt === 'number'
      ))

    const byKey = new Map<string, RequestHistoryEntry>()
    for (const item of normalized) {
      const cleaned: RequestHistoryEntry = {
        ...item,
        username: item.username.trim(),
      }

      const key = toHistoryKey(cleaned)
      const existing = byKey.get(key)
      if (!existing || cleaned.savedAt > existing.savedAt) {
        byKey.set(key, cleaned)
      }
    }

    return Array.from(byKey.values())
      .sort((a, b) => b.savedAt - a.savedAt)
      .slice(0, REQUEST_HISTORY_LIMIT)
  } catch {
    return []
  }
}

function writeRequestHistory(entries: RequestHistoryEntry[]) {
  try {
    localStorage.setItem(REQUEST_HISTORY_STORAGE_KEY, JSON.stringify(entries.slice(0, REQUEST_HISTORY_LIMIT)))
  } catch {
    // Ignore storage write failures so the UI remains functional.
  }
}

function formatFrameRange(bucket: Bucket, frame: GameFrame): string {
  const from = toDate(frame.from)
  const to = toDate(frame.to)

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return `${frame.from} - ${frame.to}`
  }

  if (bucket === 'hour') {
    return from.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (bucket === 'day') {
    return from.toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const toExclusive = new Date(to)
  toExclusive.setDate(toExclusive.getDate() - 1)
  return `${from.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} - ${toExclusive.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })}`
}

function toLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getStartOfWeekMonday(date: Date): Date {
  const start = new Date(date)
  const dayOffset = (start.getDay() + 6) % 7
  start.setHours(0, 0, 0, 0)
  start.setDate(start.getDate() - dayOffset)
  return start
}

function formatFrameGroupTitle(bucket: Bucket, frame: GameFrame): string {
  const from = toDate(frame.from)
  if (Number.isNaN(from.getTime())) {
    return formatFrameRange(bucket, frame)
  }

  if (bucket === 'hour') {
    return from.toLocaleDateString([], {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  const weekStart = getStartOfWeekMonday(from)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 6)
  return `Week of ${weekStart.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  })} - ${weekEnd.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })}`
}

function getFrameGroupKey(bucket: Bucket, frame: GameFrame): string {
  const from = toDate(frame.from)
  if (Number.isNaN(from.getTime())) {
    return toFrameKey(frame)
  }

  if (bucket === 'hour') {
    return toLocalDateKey(from)
  }

  return toLocalDateKey(getStartOfWeekMonday(from))
}

function formatFrameItemLabel(bucket: Bucket, frame: GameFrame): string {
  const from = toDate(frame.from)
  if (Number.isNaN(from.getTime())) {
    return formatFrameRange(bucket, frame)
  }

  if (bucket === 'hour') {
    return from.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  if (bucket === 'day') {
    return from.toLocaleDateString([], {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
  }

  return formatFrameRange(bucket, frame)
}

function formatMinutes(minutes: number): string {
  if (minutes <= 0) {
    return '0m'
  }

  const hours = Math.floor(minutes / 60)
  const remainder = minutes % 60

  if (hours === 0) {
    return `${remainder}m`
  }

  if (remainder === 0) {
    return `${hours}h`
  }

  return `${hours}h ${remainder}m`
}

function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0
  return `${safe.toFixed(1)}%`
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.max(0, Math.min(100, value))
}

function getPieChartSegments(platformPercentages?: PlatformPercentages): PlatformPercentages {
  if (!platformPercentages) {
    return { deck: 0, windows: 0, other: 100 }
  }

  const deck = clampPercent(platformPercentages.deck)
  const windows = clampPercent(platformPercentages.windows)
  const other = clampPercent(platformPercentages.other)
  const total = deck + windows + other

  if (total <= 0) {
    return { deck: 0, windows: 0, other: 100 }
  }

  return {
    deck: (deck / total) * 100,
    windows: (windows / total) * 100,
    other: (other / total) * 100,
  }
}

function getPlatformHoverLabel(frame: GameFrame): string {
  const platform = getPieChartSegments(frame.platform_percentages)
  return [
    `Total: ${formatMinutes(frame.minutes)}`,
    `Deck: ${formatPercent(platform.deck)}`,
    `Windows: ${formatPercent(platform.windows)}`,
    `Other: ${formatPercent(platform.other)}`,
  ].join('\n')
}

function getFramePeriodTotal(bucket: Bucket, frame: GameFrame): { label: string; shortLabel: string; total: number } | null {
  if (bucket === 'hour' && typeof frame.day_total_minutes === 'number') {
    return {
      label: 'Day total',
      shortLabel: 'day',
      total: frame.day_total_minutes,
    }
  }

  if (bucket === 'day' && typeof frame.week_total_minutes === 'number') {
    return {
      label: 'Week total',
      shortLabel: 'week',
      total: frame.week_total_minutes,
    }
  }

  return null
}

function getHistoryGameLabel(entry: RequestHistoryEntry, resolvedGameName?: string): string {
  if (entry.gameId === null) {
    return 'All games'
  }

  return resolvedGameName ?? `Game #${entry.gameId}`
}

function getHistoryFrameLabel(entry: RequestHistoryEntry): string {
  if (!entry.frameKey) {
    return 'All frames'
  }

  const [from = '', to = ''] = entry.frameKey.split('|')
  if (from && to) {
    return formatFrameRange(entry.bucket, {
      from,
      to,
      minutes: 0,
    })
  }

  return entry.frameKey
}

function formatHistorySummary(entry: RequestHistoryEntry, resolvedGameName?: string): string {
  return `${entry.bucket} · ${getHistoryGameLabel(entry, resolvedGameName)}`
}

function formatHistoryHoverDetails(entry: RequestHistoryEntry, resolvedGameName?: string): string {
  return [
    `User: ${entry.username}`,
    `Period: ${entry.bucket}`,
    `Game: ${getHistoryGameLabel(entry, resolvedGameName)}`,
    `Frame: ${getHistoryFrameLabel(entry)}`,
  ].join('\n')
}

async function apiRequest<T>(path: string): Promise<T> {
  const response = await fetch(toApiUrl(path))
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'error' in payload
      ? String((payload as { error: string }).error)
      : `Request failed with status ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

function App() {
  const [username, setUsername] = useState('')
  const [bucket, setBucket] = useState<Bucket>('day')
  const [games, setGames] = useState<GameBreakdown[]>([])
  const [selectedGameId, setSelectedGameId] = useState<number | null>(null)
  const [selectedFrameKey, setSelectedFrameKey] = useState<string | null>(null)
  const [requestHistory, setRequestHistory] = useState<RequestHistoryEntry[]>([])
  const [isLoadingBreakdown, setIsLoadingBreakdown] = useState(false)
  const [isSyncingUser, setIsSyncingUser] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [isRestoringLatest, setIsRestoringLatest] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [visibleEntryCount, setVisibleEntryCount] = useState(BREAKDOWN_PAGE_SIZE)

  const sortedGames = useMemo(() => {
    return [...games].sort((a, b) => {
      const totalA = a.frames.reduce((sum, frame) => sum + frame.minutes, 0)
      const totalB = b.frames.reduce((sum, frame) => sum + frame.minutes, 0)
      return totalB - totalA
    })
  }, [games])

  const selectedGame = useMemo(() => {
    if (selectedGameId === null) {
      return null
    }

    return sortedGames.find((game) => game.app_id === selectedGameId) ?? null
  }, [selectedGameId, sortedGames])

  const availableFrames = selectedGame?.frames ?? []

  const gameNameById = useMemo(() => {
    return new Map(sortedGames.map((game) => [game.app_id, game.name]))
  }, [sortedGames])

  const filteredGames = useMemo(() => {
    if (selectedGameId === null) {
      return sortedGames
    }

    const game = sortedGames.find((item) => item.app_id === selectedGameId)
    if (!game) {
      return []
    }

    if (!selectedFrameKey) {
      return [game]
    }

    const matchedFrames = game.frames.filter((frame) => toFrameKey(frame) === selectedFrameKey)
    return matchedFrames.length ? [{ ...game, frames: matchedFrames }] : []
  }, [selectedGameId, selectedFrameKey, sortedGames])

  const groupedGames = useMemo<GroupedGameBreakdown[]>(() => {
    if (bucket === 'week') {
      return filteredGames.map((game) => ({
        ...game,
        frameGroups: [{ key: 'all-weeks', title: '', frames: game.frames }],
      }))
    }

    return filteredGames.map((game) => {
      const frameGroupsByKey = new Map<string, FrameGroup>()

      for (const frame of game.frames) {
        const groupKey = getFrameGroupKey(bucket, frame)
        if (!frameGroupsByKey.has(groupKey)) {
          frameGroupsByKey.set(groupKey, {
            key: groupKey,
            title: formatFrameGroupTitle(bucket, frame),
            frames: [],
          })
        }

        frameGroupsByKey.get(groupKey)!.frames.push(frame)
      }

      return {
        ...game,
        frameGroups: Array.from(frameGroupsByKey.values()),
      }
    })
  }, [bucket, filteredGames])

  const totalBreakdownEntries = useMemo(() => {
    return groupedGames.reduce((entrySum, game) => {
      return entrySum + game.frameGroups.reduce((groupSum, group) => groupSum + group.frames.length, 0)
    }, 0)
  }, [groupedGames])

  const totalBreakdownMinutes = useMemo(() => {
    return groupedGames.reduce((sum, game) => {
      return sum + game.frames.reduce((gameSum, frame) => gameSum + frame.minutes, 0)
    }, 0)
  }, [groupedGames])

  useEffect(() => {
    setVisibleEntryCount(BREAKDOWN_PAGE_SIZE)
  }, [games, bucket, selectedGameId, selectedFrameKey])

  const paginatedGroupedGames = useMemo<GroupedGameBreakdown[]>(() => {
    let remaining = Math.max(0, visibleEntryCount)
    if (remaining === 0) {
      return []
    }

    const paginated: GroupedGameBreakdown[] = []

    for (const game of groupedGames) {
      if (remaining <= 0) {
        break
      }

      const paginatedGroups: FrameGroup[] = []

      for (const group of game.frameGroups) {
        if (remaining <= 0) {
          break
        }

        const visibleFrames = group.frames.slice(0, remaining)
        if (!visibleFrames.length) {
          continue
        }

        paginatedGroups.push({
          ...group,
          frames: visibleFrames,
        })

        remaining -= visibleFrames.length
      }

      if (paginatedGroups.length) {
        paginated.push({
          ...game,
          frameGroups: paginatedGroups,
        })
      }
    }

    return paginated
  }, [groupedGames, visibleEntryCount])

  const visibleBreakdownEntries = useMemo(() => {
    return paginatedGroupedGames.reduce((entrySum, game) => {
      return entrySum + game.frameGroups.reduce((groupSum, group) => groupSum + group.frames.length, 0)
    }, 0)
  }, [paginatedGroupedGames])

  const remainingBreakdownEntries = Math.max(0, totalBreakdownEntries - visibleBreakdownEntries)

  const suggestedUsernames = useMemo(() => {
    const uniqueNames = new Set<string>()
    const trimmedCurrent = username.trim()

    if (trimmedCurrent) {
      uniqueNames.add(trimmedCurrent)
    }

    for (const entry of requestHistory) {
      uniqueNames.add(entry.username)
    }

    return Array.from(uniqueNames)
  }, [requestHistory, username])

  const saveHistoryEntry = useCallback((entry: Omit<RequestHistoryEntry, 'savedAt'>) => {
    const normalized: RequestHistoryEntry = {
      ...entry,
      username: entry.username.trim(),
      savedAt: Date.now(),
    }

    if (!normalized.username) {
      return
    }

    setRequestHistory((previous) => {
      const normalizedKey = toHistoryKey(normalized)
      const filtered = previous.filter((item) => toHistoryKey(item) !== normalizedKey)

      const next = [normalized, ...filtered].slice(0, REQUEST_HISTORY_LIMIT)
      writeRequestHistory(next)
      return next
    })
  }, [])

  const loadBreakdown = useCallback(async (
    targetUsername: string,
    targetBucket: Bucket,
    preferredSelection?: { gameId: number | null; frameKey: string | null },
  ) => {
    setError(null)
    setStatus(null)
    setIsLoadingBreakdown(true)

    try {
      const encodedUsername = encodeURIComponent(targetUsername)
      const payload = await apiRequest<GameBreakdown[] | { series: GameBreakdown[] }>(
        `/users/${encodedUsername}?bucket=${targetBucket}&group=game`,
      )

      const series = Array.isArray(payload) ? payload : payload?.series
      const normalizedSeries = Array.isArray(series) ? series : []

      let resolvedGameId: number | null = null
      if (typeof preferredSelection?.gameId === 'number') {
        resolvedGameId = normalizedSeries.some((game) => game.app_id === preferredSelection.gameId)
          ? preferredSelection.gameId
          : null
      }

      let resolvedFrameKey: string | null = null
      if (resolvedGameId !== null && preferredSelection?.frameKey) {
        const game = normalizedSeries.find((item) => item.app_id === resolvedGameId)
        resolvedFrameKey = game?.frames.some((frame) => toFrameKey(frame) === preferredSelection.frameKey)
          ? preferredSelection.frameKey
          : null
      }

      setGames(normalizedSeries)
      setSelectedGameId(resolvedGameId)
      setSelectedFrameKey(resolvedFrameKey)
      setStatus(`Loaded ${normalizedSeries.length} games for ${targetUsername}.`)

      saveHistoryEntry({
        username: targetUsername,
        bucket: targetBucket,
        gameId: resolvedGameId,
        frameKey: resolvedFrameKey,
      })
    } catch (requestError) {
      setGames([])
      setSelectedGameId(null)
      setSelectedFrameKey(null)
      setError(requestError instanceof Error ? requestError.message : 'Failed to load breakdown.')
    } finally {
      setIsLoadingBreakdown(false)
    }
  }, [saveHistoryEntry])

  useEffect(() => {
    const history = readRequestHistory()
    writeRequestHistory(history)
    setRequestHistory(history)

    const latest = history[0]
    if (!latest) {
      setIsRestoringLatest(false)
      return
    }

    setUsername(latest.username)
    setBucket(latest.bucket)

    void loadBreakdown(latest.username, latest.bucket, {
      gameId: latest.gameId,
      frameKey: latest.frameKey,
    }).finally(() => setIsRestoringLatest(false))
  }, [loadBreakdown])

  async function onLoadBreakdown(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const cleanUsername = username.trim()

    if (!cleanUsername) {
      setError('Username is required.')
      return
    }

    await loadBreakdown(cleanUsername, bucket, {
      gameId: selectedGameId,
      frameKey: selectedFrameKey,
    })
  }

  async function onSyncUser() {
    const cleanUsername = username.trim()
    if (!cleanUsername) {
      setError('Username is required before syncing a user.')
      return
    }

    setError(null)
    setStatus(null)
    setIsSyncingUser(true)

    try {
      const encodedUsername = encodeURIComponent(cleanUsername)
      const payload = await apiRequest<{ syncedGames: number }>(`/sync/users/${encodedUsername}`)
      setStatus(`User sync complete. Synced games: ${payload.syncedGames}.`)
      await loadBreakdown(cleanUsername, bucket, {
        gameId: selectedGameId,
        frameKey: selectedFrameKey,
      })
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to sync user.')
    } finally {
      setIsSyncingUser(false)
    }
  }

  async function onSyncAll() {
    setError(null)
    setStatus(null)
    setIsSyncingAll(true)

    try {
      const payload = await apiRequest<{ syncedUsers: number; syncedGames: number }>(`/sync/all`)
      setStatus(
        `Full sync complete. Users: ${payload.syncedUsers}. Games: ${payload.syncedGames}.`,
      )

      const cleanUsername = username.trim()
      if (cleanUsername) {
        await loadBreakdown(cleanUsername, bucket, {
          gameId: selectedGameId,
          frameKey: selectedFrameKey,
        })
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Failed to sync all users.')
    } finally {
      setIsSyncingAll(false)
    }
  }

  const bucketMax = BUCKET_MAX_MINUTES[bucket]

  function onGameSelectionChange(value: string) {
    const nextGameId = value === 'all' ? null : Number(value)
    setSelectedGameId(Number.isNaN(nextGameId) ? null : nextGameId)
    setSelectedFrameKey(null)

    const cleanUsername = username.trim()
    if (cleanUsername) {
      saveHistoryEntry({
        username: cleanUsername,
        bucket,
        gameId: Number.isNaN(nextGameId) ? null : nextGameId,
        frameKey: null,
      })
    }
  }

  function onFrameSelectionChange(value: string) {
    const nextFrameKey = value === 'all' ? null : value
    setSelectedFrameKey(nextFrameKey)

    const cleanUsername = username.trim()
    if (cleanUsername) {
      saveHistoryEntry({
        username: cleanUsername,
        bucket,
        gameId: selectedGameId,
        frameKey: nextFrameKey,
      })
    }
  }

  function restoreFromHistory(entry: RequestHistoryEntry) {
    setUsername(entry.username)
    setBucket(entry.bucket)
    void loadBreakdown(entry.username, entry.bucket, {
      gameId: entry.gameId,
      frameKey: entry.frameKey,
    })
  }

  function removeHistoryEntry(entry: RequestHistoryEntry) {
    setRequestHistory((previous) => {
      const entryKey = toHistoryKey(entry)
      const next = previous.filter((item) => toHistoryKey(item) !== entryKey)
      writeRequestHistory(next)
      return next
    })
  }

  function clearHistory() {
    setRequestHistory([])
    writeRequestHistory([])
  }

  function onLoadMoreEntries() {
    setVisibleEntryCount((current) => Math.min(current + BREAKDOWN_PAGE_SIZE, totalBreakdownEntries))
  }

  return (
    <main className="dashboard">
      <section className="panel controls">
        <h1>Steam Playtime Tracker</h1>
        <p className="subtitle">
          Trigger sync endpoints and inspect per-game playtime by hourly, daily, or weekly frame.
        </p>

        <form onSubmit={onLoadBreakdown} className="controls-grid">
          <label>
            Username
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="steam vanity name"
              list="username-suggestions"
            />
            <datalist id="username-suggestions">
              {suggestedUsernames.map((suggestion) => (
                <option key={suggestion} value={suggestion} />
              ))}
            </datalist>
          </label>

          <label>
            Period
            <select
              value={bucket}
              onChange={(event) => setBucket(event.target.value as Bucket)}
            >
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>
          </label>

          <label>
            Game
            <select
              value={selectedGameId === null ? 'all' : String(selectedGameId)}
              onChange={(event) => onGameSelectionChange(event.target.value)}
              disabled={!sortedGames.length || isLoadingBreakdown || isRestoringLatest}
            >
              <option value="all">All games</option>
              {sortedGames.map((game) => (
                <option key={game.app_id} value={String(game.app_id)}>
                  {game.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Frame
            <select
              value={selectedFrameKey ?? 'all'}
              onChange={(event) => onFrameSelectionChange(event.target.value)}
              disabled={!availableFrames.length || isLoadingBreakdown || isRestoringLatest}
            >
              <option value="all">All frames</option>
              {availableFrames.map((frame) => {
                const frameKey = toFrameKey(frame)
                return (
                  <option key={frameKey} value={frameKey}>
                    {formatFrameRange(bucket, frame)}
                  </option>
                )
              })}
            </select>
          </label>

          <button type="submit" disabled={isLoadingBreakdown || isSyncingUser || isSyncingAll}>
            {isLoadingBreakdown ? 'Loading...' : 'Load breakdown'}
          </button>
        </form>

        {!!requestHistory.length && (
          <div className="history">
            <div className="history-header">
              <h3>Recent requests</h3>
              <button
                type="button"
                className="history-clear"
                onClick={clearHistory}
                disabled={isLoadingBreakdown || isSyncingUser || isSyncingAll}
              >
                Clear all
              </button>
            </div>
            <ul>
              {requestHistory.slice(0, 5).map((entry) => (
                <li key={`${entry.savedAt}-${entry.username}-${entry.bucket}`}>
                  {(() => {
                    const resolvedGameName = entry.gameId === null
                      ? undefined
                      : gameNameById.get(entry.gameId)
                    const hoverDetails = formatHistoryHoverDetails(entry, resolvedGameName)

                    return (
                  <div className="history-item-wrap">
                    <button
                      type="button"
                      className="history-item history-restore"
                      title={hoverDetails}
                      onClick={() => restoreFromHistory(entry)}
                      disabled={isLoadingBreakdown || isSyncingUser || isSyncingAll}
                    >
                      <span className="history-primary">{entry.username}</span>
                      <span className="history-secondary">{formatHistorySummary(entry, resolvedGameName)}</span>
                    </button>
                    <button
                      type="button"
                      className="history-remove"
                      onClick={() => removeHistoryEntry(entry)}
                      disabled={isLoadingBreakdown || isSyncingUser || isSyncingAll}
                      aria-label={`Remove request for ${entry.username} (${formatHistorySummary(entry, resolvedGameName)})`}
                    >
                      X
                    </button>
                  </div>
                    )
                  })()}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="actions">
          <button onClick={onSyncUser} disabled={isSyncingUser || isSyncingAll || isLoadingBreakdown}>
            {isSyncingUser ? 'Syncing user...' : 'Sync user'}
          </button>
          <button onClick={onSyncAll} disabled={isSyncingAll || isSyncingUser || isLoadingBreakdown}>
            {isSyncingAll ? 'Syncing all...' : 'Sync all users'}
          </button>
        </div>

        {status ? <p className="status">{status}</p> : null}
        {error ? <p className="error">{error}</p> : null}
      </section>

      <section className="panel results">
        <div className="results-header">
          <h2>Breakdown by game</h2>
          <div className="results-meta">
            <span className="bucket-cap">Frame max: {formatMinutes(bucketMax)}</span>
            <span className="total-cap">Total: {formatMinutes(totalBreakdownMinutes)}</span>
          </div>
        </div>

        {!paginatedGroupedGames.length ? (
          <p className="empty">Load a user breakdown to view game frames.</p>
        ) : (
          <div className="game-list">
            {paginatedGroupedGames.map((game) => (
              <article key={game.app_id} className="game-card">
                <header>
                  <h3>{game.name}</h3>
                  <span>{formatMinutes(game.frames.reduce((sum, frame) => sum + frame.minutes, 0))} total</span>
                </header>

                {game.frameGroups.map((group) => (
                  <section key={`${game.app_id}-${group.key}`} className="frame-group">
                    {group.title ? (
                      <div className="frame-group-header">
                        <h4 className="frame-group-title">{group.title}</h4>
                        {(() => {
                          const periodTotal = getFramePeriodTotal(bucket, group.frames[0])
                          return periodTotal ? (
                            <span className="frame-group-meta">
                              {periodTotal.label}: {formatMinutes(periodTotal.total)}
                            </span>
                          ) : null
                        })()}
                      </div>
                    ) : null}
                    <ul>
                      {group.frames.map((frame, index) => {
                        const width = Math.min(100, (frame.minutes / bucketMax) * 100)
                        const platform = getPieChartSegments(frame.platform_percentages)
                        const deckEnd = platform.deck
                        const windowsEnd = platform.deck + platform.windows
                        return (
                          <li key={`${game.app_id}-${group.key}-${frame.from}-${index}`}>
                            <div className="frame-meta">
                              <span>{formatFrameItemLabel(bucket, frame)}</span>
                              <span className="frame-value-with-chart">
                                <span>{formatMinutes(frame.minutes)}</span>
                                <span
                                  className="platform-pie"
                                  title={getPlatformHoverLabel(frame)}
                                  aria-label={getPlatformHoverLabel(frame)}
                                  style={{
                                    background: `conic-gradient(#10b981 0% ${deckEnd}%, #3b82f6 ${deckEnd}% ${windowsEnd}%, #9ca3af ${windowsEnd}% 100%)`,
                                  }}
                                />
                              </span>
                            </div>
                            <div className="progress-track" role="presentation">
                              <div className="progress-fill" style={{ width: `${width}%` }} />
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                ))}
              </article>
            ))}

            {remainingBreakdownEntries > 0 ? (
              <div className="pagination-controls">
                <span className="pagination-status">
                  Showing {visibleBreakdownEntries} of {totalBreakdownEntries} entries
                </span>
                <button type="button" onClick={onLoadMoreEntries}>
                  Load {Math.min(BREAKDOWN_PAGE_SIZE, remainingBreakdownEntries)} more
                </button>
              </div>
            ) : totalBreakdownEntries > 0 ? (
              <p className="pagination-status">Showing all {totalBreakdownEntries} entries</p>
            ) : null}
          </div>
        )}
      </section>
    </main>
  )
}

export default App
