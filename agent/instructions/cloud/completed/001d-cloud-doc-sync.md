# Instruction: 001d - Cloud Doc Sync [COMPLETED]

## Goal
Update the durable documentation for the cloud scaffold decision after the backend scaffold direction is implemented and reviewed.

## Depends On
- `agent/instructions/cloud/001a-cloud-go-app-scaffold.md`
- `agent/instructions/cloud/001b-cloud-static-serving-contract.md`
- `agent/instructions/cloud/001c-cloud-rss-proxy.md`
- `agent/instructions/cloud/001e-cloud-sqlite-bootstrap.md`
- reviewer sign-off on the implemented scaffold direction

## Scope

### In Scope
- decision-log update for the Go + SQLite shift
- monorepo-strategy update for `apps/cloud`
- cloud docs README update
- cloud handoff/index creation or update
- roadmap update only after reviewer sign-off

### Out of Scope
- runtime/backend code changes
- speculative future cloud feature docs beyond the scaffold phase
- docs unrelated to cloud/backend direction

## Required Doc Updates

### 1. Decision Log
Update:
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

Must capture:
- shift to Go + SQLite for `apps/cloud`
- rejection of prior Hono / Spring Boot direction for this phase
- frontend reuse strategy: `apps/cloud` serves built `apps/lite/dist`

### 2. Monorepo Strategy
Update:
- `apps/docs/content/docs/general/monorepo-strategy.mdx`
- `apps/docs/content/docs/general/monorepo-strategy.zh.mdx`

Must capture:
- `apps/cloud` role in the monorepo
- backend/frontend relationship
- no UI duplication in early cloud phases
- remove stale alternate-framework wording that conflicts with the fixed scaffold choice of Go standard-library `net/http`

### 3. Cloud Docs README
Update:
- `apps/docs/content/docs/apps/cloud/README.mdx`
- `apps/docs/content/docs/apps/cloud/README.zh.mdx`

Must capture:
- the current scaffold direction is Go + SQLite
- stale Spring Boot / Hono wording is removed
- the page points readers to the Cloud handoff docs for current backend contracts

### 4. Cloud Handoff
Create or update:
- `apps/docs/content/docs/apps/cloud/handoff/index.mdx`
- Chinese counterpart if the cloud doc structure requires it

Must capture:
- cloud scaffold purpose
- static-serving strategy
- RSS proxy purpose and limits
- SQLite bootstrap-only status

### 5. Technical Roadmap
Update:
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- Chinese counterpart if required by current roadmap structure

Only after reviewer sign-off.
This update is sequencing-dependent and must not block the backend scaffold implementation itself.
Roadmap update must explicitly state where Cloud instructions live in the instruction map so the Cloud stream is not orphaned from the documented sequence.

## Implementation Constraints
- document current reality only
- do not overstate future cloud capabilities
- do not claim schema/sync/auth layers exist if only scaffolding is implemented
- keep bilingual sync accurate where counterpart docs exist

## Verification
- docs lint/check commands used in this repo
- confirm all touched docs remain internally consistent with implemented scaffold behavior

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- decision log docs
- monorepo strategy docs
- cloud docs README files
- cloud handoff docs
- technical roadmap docs if updated

### Adjacent Critical Files (Spot Check)
- `agent/instructions/cloud/001-cloud-backend-scaffold.md`
- implemented `apps/cloud` scaffold shape

## Deliver back
Return:
1. docs changed
2. exact contract language added for Go + SQLite + static serving
3. whether roadmap was updated or intentionally deferred pending sign-off

## Completion
- Completed by: Codex
- Commands:
  - `git diff --check -- apps/docs/content/docs/general/decision-log.mdx apps/docs/content/docs/general/decision-log.zh.mdx`
  - `rg -n "D116|Go \`net/http\`|apps/lite/dist|Spring Boot / Hono|SQLite" apps/docs/content/docs/general/decision-log.mdx apps/docs/content/docs/general/decision-log.zh.mdx`
  - `git diff --check -- apps/docs/content/docs/general/monorepo-strategy.mdx apps/docs/content/docs/general/monorepo-strategy.zh.mdx`
  - `rg -n "Gin|Fiber|Spring Boot|Hono|net/http|SQLite|apps/lite/dist|Future Direction|未来方向" apps/docs/content/docs/general/monorepo-strategy.mdx apps/docs/content/docs/general/monorepo-strategy.zh.mdx`
  - `git diff --check -- apps/docs/content/docs/apps/cloud/README.mdx apps/docs/content/docs/apps/cloud/README.zh.mdx`
  - `rg -n "Spring Boot|Hono|net/http|apps/lite/dist|handoff|SQLite" apps/docs/content/docs/apps/cloud/README.mdx apps/docs/content/docs/apps/cloud/README.zh.mdx`
  - `git diff --check -- apps/docs/content/docs/apps/cloud/handoff/index.mdx apps/docs/content/docs/apps/cloud/handoff/index.zh.mdx`
  - `rg -n "Cloud Handoff|Cloud 交接|Current Purpose|当前目的|Static Serving Strategy|静态服务策略|RSS Proxy Contract|SQLite Bootstrap Status|Boundaries|边界" apps/docs/content/docs/apps/cloud/handoff/index.mdx apps/docs/content/docs/apps/cloud/handoff/index.zh.mdx`
  - `pnpm --dir apps/docs build` (blocked by existing `apps/docs/.next/lock`)
  - `rg -n "agent/instructions/cloud|Cloud Scaffold Stream|Cloud 骨架流|Current status|当前状态|001a|001b|001c|001d|001e|001f|Spring Boot API" apps/docs/content/docs/general/technical-roadmap.mdx apps/docs/content/docs/general/technical-roadmap.zh.mdx`
  - `git diff --check -- apps/docs/content/docs/general/technical-roadmap.mdx apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- Date: 2026-03-24
- Reviewed by: Codex
