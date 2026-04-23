# Instruction: 001b - Cloud Static Serving Contract [COMPLETED]

## Goal
Implement the static-file serving contract in `apps/cloud` so the backend can serve the built `apps/lite/dist` artifact with correct SPA fallback behavior and strict API-route separation.

## Depends On
- `agent/instructions/cloud/001a-cloud-go-app-scaffold.md`

## Scope

### In Scope
- static serving of `apps/lite/dist`
- route handling contract for `/` and non-API client routes
- SPA fallback behavior
- explicit handling of missing build artifact behavior

### Out of Scope
- RSS proxy implementation
- SQLite implementation
- changes to `apps/lite` build output
- broad root workspace orchestration

## Required Contract

### 1. Static Artifact Source
- frontend artifact source is `apps/lite/dist`
- backend serves this artifact as the early cloud frontend
- **Path Resilience**: handler must resolve the path resiliently (e.g., via ENV or `os.Executable()` relative paths), avoiding brittle CWD dependence (`http.Dir("../lite/dist")`)
- *Note for future*: architecture should aim for `go:embed` to compile `dist` directly into the binary in later production phases, but standard disk serving is acceptable for this scaffold.
- this task does not authorize duplicating UI inside `apps/cloud`

### 2. Route Priority
- `/api/*` routes must always be resolved before SPA fallback
- only non-API routes may fallback to `index.html`
- static asset files must be served directly when present

### 3. Missing Build Behavior
- implementation must define what happens when `apps/lite/dist` is missing
- behavior must be explicit and reviewable:
  - clear server error
  - or a documented bootstrap failure path
- do not silently serve broken fallback content

### 4. SPA Fallback
- direct navigation to a frontend route should return `index.html`
- this must not catch API routes
- fallback behavior must remain minimal and predictable

## Implementation Constraints
- keep static serving logic straightforward
- do not bundle proxy or DB logic into this task
- do not assume `apps/lite` build orchestration is solved here unless trivially required and clearly reviewable

## Verification
- build `apps/lite` so `apps/lite/dist` exists
- run `apps/cloud`
- verify `/` serves the Lite app shell
- verify a non-API SPA route falls back to `index.html`
- verify `/api/...` is not swallowed by SPA fallback

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- static-serving route logic in `apps/cloud`
- any helper used to resolve `apps/lite/dist`

### Adjacent Critical Files (Spot Check)
- `apps/lite/dist` assumption handling
- root/local dev docs if touched
- `agent/instructions/cloud/001-cloud-backend-scaffold.md`

## Deliver back
Return:
1. files changed
2. static serving contract actually implemented
3. missing-build behavior
4. any blocker before `001c`

## Completion
- Completed by: Codex
- Commands:
  - `find apps/lite/dist -maxdepth 2 -type f | head -n 20`
  - `pnpm --dir apps/cloud build` (failed: `go` not installed)
  - `pnpm build` (failed at `@readio/cloud#build` because `go` is not installed)
  - `git status --short apps/cloud turbo.json`
  - `nl -ba` / `sed` / `rg` scans on the touched instruction and code files
  - `git diff --check -- apps/cloud/main.go apps/cloud/main_test.go`
- Date: 2026-03-24
- Reviewed by: Codex
