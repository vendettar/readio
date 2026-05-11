# 032 — Ops Component Cleanup and Naming Alignment

## [Decision Log]
- Waived (Updated in 031/Top).

## [Bilingual Sync]
- Not applicable (Instruction only).

## [1] adminApi.ts Dormant Tagging
- **File**: `apps/cloud-ui/src/lib/adminApi.ts`
- **Action**: Add a `DORMANT` comment block at the top of the file.
- **Content**: Explain that this file contains the legacy/dormant admin client for same-origin deployments, SSH tunnels, or future protected reverse proxies. In the standard Cloud architecture, observability is handled via Grafana (see `/ops` route and `grafana-cloud.mdx`), and this client is not currently used by production Cloud-UI components.
- **Verification**: Ensure `buildAdminURL` still uses `window.location.origin`.

## [2] adminApi.test.ts Cleanup
- **File**: `apps/cloud-ui/src/lib/__tests__/adminApi.test.ts`
- **Action**: Remove the `vi.mock('../runtimeConfig', ...)` block.
- **Rationale**: `adminApi.ts` no longer imports `runtimeConfig`. The mock is a "fake dependency" that creates misleading test maintenance.
- **Action**: Update the test to verify that `fetch` is called with a URL relative to `window.location.origin` without needing the mock.

## [3] AdminLogsPage Renaming to OpsPage
- **Rename Files**:
  - `apps/cloud-ui/src/routeComponents/AdminLogsPage.tsx` -> `apps/cloud-ui/src/routeComponents/OpsPage.tsx`
  - `apps/cloud-ui/src/routeComponents/__tests__/AdminLogsPage.test.tsx` -> `apps/cloud-ui/src/routeComponents/__tests__/OpsPage.test.tsx`
- **Update Component Name**:
  - Rename `export default function AdminLogsPage` to `export default function OpsPage` in the new file.
- **Update Route Definition**:
  - **File**: `apps/cloud-ui/src/routes/ops.tsx`
  - Update the lazy import to point to `../routeComponents/OpsPage`.
- **Update Test**:
  - Update the import and test descriptions in `OpsPage.test.tsx`.

## [4] Verification
- `pnpm lint` in `apps/cloud-ui`.
- `pnpm test apps/cloud-ui/src/lib/__tests__/adminApi.test.ts`.
- `pnpm test apps/cloud-ui/src/routeComponents/__tests__/OpsPage.test.tsx`.
- Ensure `/ops` route in local dev still renders correctly (manual check by Execution agent if possible).
