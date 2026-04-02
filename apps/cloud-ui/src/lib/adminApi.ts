const ADMIN_BASE = '/admin'

export interface AdminLogEntry {
  ts: string
  level: string
  msg: string
  route?: string
  upstream_kind?: string
  upstream_host?: string
  elapsed_ms?: number
  error_class?: string
  status?: number
  attrs?: Record<string, string>
}

export interface AdminLogsResponse {
  entries: AdminLogEntry[]
  total: number
  buffer_capacity: number
}

export interface AdminHealthResponse {
  uptime_seconds: number
  buffer_size: number
  buffer_capacity: number
  go_version: string
  goroutines: number
  memory_alloc_mb: number
  memory_sys_mb: number
}

export interface RouteStat {
  count: number
  errors: number
  p95_ms: number
}

export interface AdminMetricsSummary {
  uptime_seconds: number
  total_requests: number
  by_route: Record<string, RouteStat>
  by_error_class: Record<string, number>
}

interface LogFilters {
  level?: string
  route?: string
  error_class?: string
  limit?: number
}

async function adminFetch<T>(
  token: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v) url.searchParams.set(k, v)
    })
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`)
  return res.json()
}

export async function fetchAdminLogs(
  token: string,
  filters: LogFilters = {}
): Promise<AdminLogsResponse> {
  const params: Record<string, string> = {}
  if (filters.level) params.level = filters.level
  if (filters.route) params.route = filters.route
  if (filters.error_class) params.error_class = filters.error_class
  if (filters.limit) params.limit = String(filters.limit)
  return adminFetch<AdminLogsResponse>(token, `${ADMIN_BASE}/logs`, params)
}

export async function fetchAdminHealth(token: string): Promise<AdminHealthResponse> {
  return adminFetch<AdminHealthResponse>(token, `${ADMIN_BASE}/health`)
}

export async function fetchAdminMetricsSummary(token: string): Promise<AdminMetricsSummary> {
  return adminFetch<AdminMetricsSummary>(token, `${ADMIN_BASE}/metrics/summary`)
}
