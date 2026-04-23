# Instruction Template (Cloud)

> **⚠️ CRITICAL**: This is the foundational backend scaffolding for the Cloud version. Do NOT modify `apps/lite` business logic yet, only configure the backend to support it.
> **Prerequisites**: Read `apps/docs/content/docs/general/monorepo-strategy.mdx` before starting.

# Task: Scaffold Cloud Backend (Go + SQLite + Static Serving)

## Objective
Initialize the `apps/cloud` backend to serve as a self-hosted entry point for the Readio app. This includes setting up a Go server using the standard-library `net/http`, serving the `apps/lite` frontend, providing a server-side RSS fetch proxy to replace public CORS proxies, and scaffolding a SQLite database connection for future data sync. 
*(Note: This phase only provides server capabilities; it DOES NOT wire the frontend to use them yet).*

## Decision Log
- **Required / Waived**: Required. The following must be explicitly updated in `decision-log.mdx`:
  1. The strategic shift to **Golang and SQLite** (overriding the prior Hono/Spring Boot specs).
  2. The **Frontend Reuse Strategy**: `apps/cloud` acts as a pure backend serving the compiled `apps/lite/dist` statically for early deployment phases. UI duplication is strongly forbidden until shared component extraction (`packages/ui`) occurs.

## Bilingual Sync
- **Required / Not applicable**: Required (for all Doc Sync subtasks, including README and Handoffs).

## Preflight Scope Scan & Hidden Risk Sweep
- **config**: Medium Risk. Touches `package.json`, `turbo.json`, Go module, and ENV conventions.
- **persistence**: Medium Risk. SQLite driver, PRAGMA execution, DB path, and lifecycle must be locked to a strict contract.
- **routing**: High Risk. SPA fallback priority vs `/api/*` resolution is highly prone to collision.
- **logging**: Medium Risk. Must enforce Go 1.21+ `log/slog` for structured logs instead of silent failures.
- **network**: High Risk. RSS proxy introduces SSRF vulnerabilities; strict timeout, UA identity, and internal-network rejection are mandatory.
- **storage**: Medium Risk. Executable-relative resolution of `apps/lite/dist` and SQLite file paths needed to avoid CWD brittleness.
- **UI state**: Low-Medium Risk. Strict ban on altering `apps/lite` business logic in this phase to prevent state corruption.
- **tests**: High Risk. Manual verification is insufficient for infrastructure. Minimal `httptest` automation is required for proxy and routing safety.

## Implementation Mode (Strict Execution Sequence)
This scaffold instruction is too broad for a safe one-pass implementation. It MUST be executed sequentially via child tasks. **The next task can only be activated after the previous task's code has been reviewed.**

**Strict Sequence:**
1. `001a-cloud-go-app-scaffold`
2. `001b-cloud-static-serving-contract`
3. `001c-cloud-rss-proxy`
4. `001e-cloud-sqlite-bootstrap`
5. `001f-cloud-integration-and-handoff` (New: E2E Integration & Automation Verification owner)
6. `001d-cloud-doc-sync` (Must sync README.mdx, roadmap, and decision log)

## Fixed Technical Choices
- **HTTP server**: use Go standard library `net/http`
- **Database access**: use `database/sql` with a **pure Go** SQLite driver (e.g., `modernc.org/sqlite`)
- **CGO**: Strictly DISALLOWED (`CGO_ENABLED=0` capability must be preserved)
- **ORMs**: not allowed in this scaffold phase
- **Migrations**: not part of this task

## Required Backend Contracts

### Static Serving Contract
- Backend serves `apps/lite/dist` as the frontend artifact in early cloud phases. path must be resilient (ENV config or executable-relative), NOT a brittle `../lite/dist` CWD hardcode.
- Non-API routes may fallback to `index.html`.
- API routes must be resolved before SPA fallback.

### RSS Proxy Contract
- This is an app-owned RSS fetch proxy, not a generic proxy product.
- Child implementation must make SSRF request filtering, UA spoofing, and timeout behavior explicit.

### SQLite Contract
- Connection/bootstrap only. Must execute PRAGMAs (`WAL`, `foreign_keys`). No schema design yet.

### Automated Testing Baseline
- This infrastructure phase cannot rely solely on manual browser tests.
- Requirements for `001` child modules:
  - Routing test: verify `/api/*` is not swallowed by SPA fallback.
  - Proxy test: verify rejection of private network/localhost targets.
  - DB test: verify bootstrap function successfully creates the DB file in a temporary test dir.

## Documentation Requirements
- Update `apps/docs/content/docs/general/decision-log.mdx` reflecting Golang/SQLite.
- Update `apps/docs/content/docs/general/monorepo-strategy.mdx` reflecting UI reuse and Go strategy.
- Update `apps/docs/content/docs/apps/cloud/README.mdx` and `apps/docs/content/docs/apps/cloud/README.zh.mdx` to remove stale Spring Boot/Hono references and align the visible Cloud docs entrypoint with the chosen scaffold direction.
- Remove stale alternative-framework wording from strategy docs where it conflicts with the fixed choice of standard-library `net/http`.
- `technical-roadmap.mdx` MUST explicitely define where Cloud instructions live (e.g., appending to Phase 12) before marking tasks complete.

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-03-24
- **Reviewed by**:

When finished: append `[COMPLETED]` to the H1 and fill Completion fields. Reviewer must add `Reviewed by` before Worker updates `technical-roadmap.mdx`.
