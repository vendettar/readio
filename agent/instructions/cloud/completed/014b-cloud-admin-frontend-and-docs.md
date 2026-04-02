# Instruction 014b — Cloud Admin Frontend + Deployment Docs

Execute after 014a is complete and reviewed.

## Scope

Frontend:
- `apps/cloud-ui/src/routeComponents/AdminLogsPage.tsx`
- `apps/cloud-ui/src/lib/adminApi.ts`

Docs:
- `apps/docs/content/docs/apps/cloud/deployment.mdx` — admin section
- `apps/docs/content/docs/apps/cloud/deployment.zh.mdx` — zh counterpart

## Must

### 1. Frontend Route

Route: `/ops` (not `/admin` — avoid collision with backend JSON APIs).

Do NOT add to main navigation. Access by direct URL only.

### 2. API Client (`adminApi.ts`)

Functions:
- `fetchAdminLogs(token, filters)` → calls `/admin/logs` with query params
- `fetchAdminHealth(token)` → calls `/admin/health`
- `fetchAdminMetricsSummary(token)` → calls `/admin/metrics/summary`

All requests include `Authorization: Bearer <token>` header.
Handle 401 → surface "Unauthorized" state.

### 3. Admin Logs Page (`AdminLogsPage.tsx`)

Features:
- Token input (stored in sessionStorage, not localStorage, not URL)
- Table columns: Time, Level, Message, Route, Upstream, Elapsed, Error Class
- Level filter: All / INFO / WARN / ERROR
- Route filter: populated from actual data
- Manual refresh button
- Auto-refresh toggle (poll every 10s)
- Auto-refresh stops after 3 consecutive 401 responses
- Explicit unauthorized state when token missing or invalid
- Row click expands to show full attrs

Styling:
- Use existing Tailwind config from the project
- Use existing shadcn/ui `Table` component if available
- Level colors: WARN = yellow bg, ERROR = red bg, INFO = default
- Monospace font for log field values
- No charts or graphs

### 4. Deployment Docs

Add to `apps/docs/content/docs/apps/cloud/deployment.mdx`:
- `READIO_ADMIN_TOKEN` env var description
- `READIO_ADMIN_LOG_BUFFER` env var description (default 2000, min 100, max 10000)
- `/ops` is operator-only, same-origin, protected by bearer token
- Recommend nginx/Cloudflare path restrictions for `/admin/*` in production
- `READIO_ADMIN_TOKEN` is server-only, never emitted via `/env.js`

Update zh counterpart.

## Do not

- Do not add to main navigation
- Do not add auth/session logic beyond Bearer token
- Do not persist token beyond sessionStorage
- Do not put token in URL or query string
- Do not add charts or graphs

## Tests

1. Token stored only in sessionStorage
2. Auto-refresh stops after repeated 401
3. Frontend route `/ops` does not conflict with backend `/admin/*`
4. Filter params correctly map to query string
5. Unauthorized state renders when token missing

## Verify

- `pnpm -C apps/cloud-ui build`
- Focused frontend checks for token/401/filter behavior

## Return

1. files changed
2. frontend route
3. API client functions
4. admin page features
5. deployment docs updated
6. verification results
