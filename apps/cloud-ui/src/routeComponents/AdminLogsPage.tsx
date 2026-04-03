import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { Switch } from '../components/ui/switch'
import {
  type AdminHealthResponse,
  type AdminLogEntry,
  fetchAdminHealth,
  fetchAdminLogs,
} from '../lib/adminApi'

const SESSION_KEY = 'readio_admin_token'
const MAX_401S = 3

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h ${m}m`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function levelClass(level: string): string {
  switch (level) {
    case 'WARN':
      return 'bg-yellow-500/10 text-yellow-700'
    case 'ERROR':
      return 'bg-red-500/10 text-red-700'
    case 'INFO':
      return 'text-foreground/60'
    default:
      return 'text-foreground/60'
  }
}

function HealthBar({ health }: { health: AdminHealthResponse }) {
  return (
    <div className="mb-4 flex flex-wrap gap-4 rounded-md border p-3 text-sm">
      <span>
        Uptime: <span className="font-mono">{formatUptime(health.uptime_seconds)}</span>
      </span>
      <span>
        Buffer:{' '}
        <span className="font-mono">
          {health.buffer_size}/{health.buffer_capacity}
        </span>
      </span>
      <span>
        Mem: <span className="font-mono">{health.memory_alloc_mb}MB</span> /{' '}
        <span className="font-mono">{health.memory_sys_mb}MB</span>
      </span>
      <span>
        Goroutines: <span className="font-mono">{health.goroutines}</span>
      </span>
      <span>
        Go: <span className="font-mono">{health.go_version}</span>
      </span>
    </div>
  )
}

function FilterBar({
  token,
  onTokenChange,
  levelFilter,
  onLevelFilterChange,
  routeFilter,
  onRouteFilterChange,
  routes,
  autoRefresh,
  onAutoRefreshChange,
  onRefresh,
}: {
  token: string
  onTokenChange: (val: string) => void
  levelFilter: string
  onLevelFilterChange: (val: string) => void
  routeFilter: string
  onRouteFilterChange: (val: string) => void
  routes: string[]
  autoRefresh: boolean
  onAutoRefreshChange: (val: boolean) => void
  onRefresh: () => void
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <Input
        type="password"
        placeholder="Token"
        className="w-48"
        value={token}
        onChange={(e) => onTokenChange(e.target.value)}
      />

      <Select
        value={levelFilter || 'all'}
        onValueChange={(v) => onLevelFilterChange(v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-28">
          <SelectValue placeholder="Level" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All</SelectItem>
          <SelectItem value="INFO">INFO</SelectItem>
          <SelectItem value="WARN">WARN</SelectItem>
          <SelectItem value="ERROR">ERROR</SelectItem>
        </SelectContent>
      </Select>

      <Select
        value={routeFilter || 'all'}
        onValueChange={(v) => onRouteFilterChange(v === 'all' ? '' : v)}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Route" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Routes</SelectItem>
          {routes.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button variant="outline" size="sm" onClick={onRefresh}>
        Refresh
      </Button>

      <div className="flex items-center gap-2 text-sm">
        <Switch
          id="admin-auto-refresh"
          checked={autoRefresh}
          onCheckedChange={(checked) => onAutoRefreshChange(checked === true)}
        />
        <label htmlFor="admin-auto-refresh">Auto-refresh (10s)</label>
      </div>
    </div>
  )
}

function LogTable({
  entries,
  expandedKey,
  onToggleExpand,
}: {
  entries: (AdminLogEntry & { _key: string })[]
  expandedKey: string | null
  onToggleExpand: (key: string) => void
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50">
          <tr>
            <th className="px-3 py-2 font-medium">Time</th>
            <th className="px-3 py-2 font-medium">Level</th>
            <th className="px-3 py-2 font-medium">Message</th>
            <th className="px-3 py-2 font-medium">Route</th>
            <th className="px-3 py-2 font-medium">Upstream</th>
            <th className="px-3 py-2 font-medium">Elapsed</th>
            <th className="px-3 py-2 font-medium">Error</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">
                No entries
              </td>
            </tr>
          )}
          {entries.map((entry) => (
            <Fragment key={entry._key}>
              <tr
                className="cursor-pointer border-b hover:bg-muted/30"
                onClick={() => onToggleExpand(entry._key)}
              >
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">{entry.ts}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 font-mono text-xs ${levelClass(entry.level)}`}
                  >
                    {entry.level}
                  </span>
                </td>
                <td className="max-w-xs truncate px-3 py-1.5 font-mono text-xs">{entry.msg}</td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                  {entry.route ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                  {entry.upstream_host ?? '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                  {entry.elapsed_ms != null ? `${entry.elapsed_ms}ms` : '—'}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 font-mono text-xs">
                  {entry.error_class ?? '—'}
                </td>
              </tr>
              {expandedKey === entry._key && entry.attrs && Object.keys(entry.attrs).length > 0 && (
                <tr className="border-b bg-muted/20">
                  <td colSpan={7} className="px-3 py-2">
                    <pre className="overflow-x-auto font-mono text-xs">
                      {JSON.stringify(entry.attrs, null, 2)}
                    </pre>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminLogsPage() {
  const [token, setToken] = useState(() => sessionStorage.getItem(SESSION_KEY) ?? '')
  const [health, setHealth] = useState<AdminHealthResponse | null>(null)
  const [entries, setEntries] = useState<AdminLogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [bufferCapacity, setBufferCapacity] = useState(0)
  const [levelFilter, setLevelFilter] = useState('')
  const [routeFilter, setRouteFilter] = useState('')
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consecutive401s, setConsecutive401s] = useState(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const hasToken = token.trim().length > 0

  const saveToken = useCallback((val: string) => {
    setToken(val)
    if (val.trim()) {
      sessionStorage.setItem(SESSION_KEY, val.trim())
    } else {
      sessionStorage.removeItem(SESSION_KEY)
    }
    setConsecutive401s(0)
    setError(null)
  }, [])

  const loadData = useCallback(async () => {
    if (!token.trim()) return
    setIsLoading(true)
    try {
      const [logs, h] = await Promise.all([
        fetchAdminLogs(token.trim(), {
          level: levelFilter || undefined,
          route: routeFilter || undefined,
        }),
        fetchAdminHealth(token.trim()),
      ])
      setEntries(logs.entries)
      setTotal(logs.total)
      setBufferCapacity(logs.buffer_capacity)
      setHealth(h)
      setConsecutive401s(0)
      setError(null)
    } catch (e) {
      if (e instanceof Error && e.message === 'UNAUTHORIZED') {
        setConsecutive401s((prev) => prev + 1)
        setError('Unauthorized — check your token')
      } else {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      setIsLoading(false)
    }
  }, [token, levelFilter, routeFilter])

  useEffect(() => {
    if (hasToken) void loadData()
  }, [hasToken, loadData])

  useEffect(() => {
    if (consecutive401s >= MAX_401S) {
      setAutoRefresh(false)
    }
  }, [consecutive401s])

  useEffect(() => {
    if (autoRefresh && hasToken && consecutive401s < MAX_401S) {
      intervalRef.current = setInterval(loadData, 10000)
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [autoRefresh, hasToken, consecutive401s, loadData])

  const entriesWithKeys = useMemo(
    () => entries.map((e, i) => ({ ...e, _key: `${e.ts}-${e.level}-${e.msg}-${i}` })),
    [entries]
  )

  const routes = useMemo(() => {
    const set = new Set<string>()
    entries.forEach((e) => {
      if (e.route) set.add(e.route)
    })
    return Array.from(set).sort()
  }, [entries])

  if (!hasToken) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="mb-4 text-xl font-semibold">Admin Logs</h1>
        <p className="text-muted-foreground mb-4 text-sm">
          Enter the admin bearer token to access /ops.
        </p>
        <Input
          type="password"
          placeholder="Bearer token"
          value={token}
          onChange={(e) => saveToken(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void loadData()
          }}
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <h1 className="mb-4 text-xl font-semibold">Admin Logs</h1>

      {error && (
        <div className="mb-4 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      {isLoading && (
        <div className="mb-4 rounded-md border px-3 py-2 text-sm text-muted-foreground">
          Loading...
        </div>
      )}

      {health && <HealthBar health={health} />}

      <FilterBar
        token={token}
        onTokenChange={saveToken}
        levelFilter={levelFilter}
        onLevelFilterChange={setLevelFilter}
        routeFilter={routeFilter}
        onRouteFilterChange={setRouteFilter}
        routes={routes}
        autoRefresh={autoRefresh}
        onAutoRefreshChange={(checked) => {
          setConsecutive401s(0)
          setAutoRefresh(checked)
        }}
        onRefresh={loadData}
      />

      <LogTable
        entries={entriesWithKeys}
        expandedKey={expandedKey}
        onToggleExpand={(key) => setExpandedKey(expandedKey === key ? null : key)}
      />

      <div className="mt-2 text-right text-xs text-muted-foreground">
        {entries.length} / {total} entries (buffer capacity: {bufferCapacity})
      </div>
    </div>
  )
}
