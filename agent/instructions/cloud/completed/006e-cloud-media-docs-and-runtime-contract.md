# Instruction 006e: Cloud Media Docs And Runtime Contract [COMPLETED]

## Parent
- `006-cloud-media-fallback-default-proxy.md`
- `006a-cloud-media-surface-audit.md`
- `006b-cloud-media-fallback-proxy-contract.md`
- `006c-cloud-media-client-fallback-routing.md`
- `006d-cloud-media-range-seek-regression-coverage.md`

## Objective
Synchronize Cloud documentation, handoff state, and runtime contract wording after the media fallback-first architecture is implemented.

## Goal
After this instruction:

- Cloud docs accurately describe media behavior
- handoff docs reflect the new default backend fallback proxy role
- no docs still imply that Cloud media is either fully browser-only or fully backend-mandatory

## Documentation Requirements
Update Cloud documentation and handoff to reflect:

- Cloud does not require a user-configured CORS proxy for supported media fallback paths
- direct browser media access remains preferred when available
- `apps/cloud-api` acts as the built-in fallback proxy for supported media-adjacent failures
- backend media fallback is pass-through and non-caching
- browser-local downloads/transcripts/settings remain browser-local
- clearing browser site data still removes those local artifacts
- Cloud currently keeps Workbox/PWA disabled unless a later instruction explicitly restores it

## Required Accuracy Notes
Documentation must not over-claim:

- do not say "all audio always goes through backend"
- do not say "Cloud never touches third-party media domains directly"
- do not say "Cloud caches media server-side"
- do not say "seek/scroll/state is retained" unless proven by structural tests
- do not imply that native media-element transport and JS fetch fallback are the same mechanism

## Likely Files
Update the task-relevant Cloud docs only, likely including:

- `apps/docs/content/docs/apps/cloud/**`
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- Cloud handoff entry and relevant sub-docs

If a touched docs file has a `.zh.mdx` counterpart, update both.

## Roadmap / Lifecycle Rules
- Only mark roadmap progress after the child instruction is reviewed
- keep handoff index high-level; move detailed implementation notes into the specific sub-docs
- if any parent or child instruction completion state changes, keep lifecycle markers consistent

## Tests / Verification Notes
Docs updates must mention the actual verification contract used for media fallback:

- backend tests
- frontend targeted tests
- manual Cloud runtime verification at `http://localhost:8080`

Do not document a stronger runtime guarantee than what `006d` actually proved.

## Verification
1. Re-read each docs file immediately before editing
2. `pnpm -C apps/cloud-ui build`
3. `go test ./...` in `apps/cloud-api`
4. any roadmap/handoff sync required by the instruction lifecycle

## Done When
- Cloud docs and handoff accurately describe the fallback-first media contract
- roadmap and lifecycle state are synchronized
- no stale Cloud docs still describe user-supplied media proxying as the required path

## Completion
- Completed by: Codex
- Reviewed by: Codex reviewer
- Commands:
  - `pnpm -C apps/cloud-ui build`
  - `go test ./...` in `apps/cloud-api`
  - `git diff --check`
- Date: 2026-03-28
