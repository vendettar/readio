import { z } from 'zod'

const ADMIN_BASE = '/admin'

export const AdminLogEntrySchema = z.object({
  ts: z.string(),
  level: z.string(),
  msg: z.string(),
  route: z.string().optional(),
  upstream_kind: z.string().optional(),
  upstream_host: z.string().optional(),
  elapsed_ms: z.number().optional(),
  error_class: z.string().optional(),
  status: z.number().optional(),
  attrs: z.record(z.string(), z.string()).optional(),
})

export type AdminLogEntry = z.infer<typeof AdminLogEntrySchema>

export const AdminLogsResponseSchema = z.object({
  entries: z.array(AdminLogEntrySchema),
  total: z.number(),
  buffer_capacity: z.number(),
})

export type AdminLogsResponse = z.infer<typeof AdminLogsResponseSchema>

export const AdminHealthResponseSchema = z.object({
  uptime_seconds: z.number(),
  buffer_size: z.number(),
  buffer_capacity: z.number(),
  go_version: z.string(),
  goroutines: z.number(),
  memory_alloc_mb: z.number(),
  memory_sys_mb: z.number(),
})

export type AdminHealthResponse = z.infer<typeof AdminHealthResponseSchema>

export const RouteStatSchema = z.object({
  count: z.number(),
  errors: z.number(),
  p95_ms: z.number(),
})

export type RouteStat = z.infer<typeof RouteStatSchema>

export const AdminMetricsSummarySchema = z.object({
  uptime_seconds: z.number(),
  total_requests: z.number(),
  by_route: z.record(z.string(), RouteStatSchema),
  by_error_class: z.record(z.string(), z.number()),
})

export type AdminMetricsSummary = z.infer<typeof AdminMetricsSummarySchema>

interface LogFilters {
  level?: string
  route?: string
  error_class?: string
  limit?: number
}

async function adminFetch<T>(
  token: string,
  path: string,
  schema: z.ZodSchema<T>,
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

  const data = await res.json()
  return schema.parse(data)
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
  return adminFetch(token, `${ADMIN_BASE}/logs`, AdminLogsResponseSchema, params)
}

export async function fetchAdminHealth(token: string): Promise<AdminHealthResponse> {
  return adminFetch(token, `${ADMIN_BASE}/health`, AdminHealthResponseSchema)
}

export async function fetchAdminMetricsSummary(token: string): Promise<AdminMetricsSummary> {
  return adminFetch(token, `${ADMIN_BASE}/metrics/summary`, AdminMetricsSummarySchema)
}

export async function clearAdminLogs(token: string): Promise<void> {
  const url = new URL(`${ADMIN_BASE}/logs/clear`, window.location.origin)
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) throw new Error('UNAUTHORIZED')
  if (!res.ok) throw new Error(`Admin API error: ${res.status}`)
}
