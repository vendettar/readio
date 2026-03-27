# Instruction 005f: Cloud Editor's Picks Cutover [COMPLETED]

## Parent
- `005-cloud-networking-cutover.md`

## Objective
Remove the remaining browser-direct discovery dependency from Cloud Explore by moving Editor's Picks lookups to `apps/cloud-api`.

## Goal
After this instruction:

- the visible Explore Editor's Picks section is fully same-origin through `apps/cloud-api`
- `apps/cloud-ui` no longer uses `appleProvider.lookupPodcastsByIds(...)` for Cloud Explore
- Cloud can claim the user-visible discovery experience is backend-owned for the Explore surface

## Required Work
Implement a backend-owned lookup-by-ids path for Cloud discovery and migrate the Cloud frontend callers that power Explore Editor's Picks.

At minimum:

- identify the exact user-visible Editor's Picks call chain from `apps/cloud-ui/src/hooks/useDiscoveryPodcasts.ts`
- add a same-origin backend endpoint in `apps/cloud-api` for the lookup-by-ids use case
- switch the Cloud discovery facade so the Explore Editor's Picks path uses the backend endpoint instead of `appleProvider.lookupPodcastsByIds(...)`
- preserve the existing Explore UI contract and loading/error behavior
- remove or quarantine any Cloud-visible browser-direct lookup-by-ids path that would keep Explore dependent on Apple from the browser

## Scope Scan Requirements
Before editing, report risks across:

1. config/runtime defaults
2. persistence/cache interactions
3. routing/query-key behavior for Explore
4. logging/error mapping
5. network/cache ownership
6. storage/serialization side effects
7. UI state/hooks for Explore page loading states
8. tests and mocks

Also perform the hidden-risk sweep for async re-entrancy and repeated hot-path work in Explore queries.

## Impact Checklist
- Affected modules: `apps/cloud-api/discovery.go`, Cloud discovery facade/callers, Explore hooks/tests
- Regression risks:
  - Editor's Picks caching/query keys drift from current behavior
  - lookup-by-ids ordering mismatch relative to curated pick order
  - partial/missing podcast results changing visible Explore composition
- Required verification:
  - backend tests for the new endpoint
  - frontend tests proving Editor's Picks uses same-origin Cloud discovery instead of browser-direct provider logic
  - build verification for `apps/cloud-ui`

## Decision Log
- Waived unless the implementation changes a rule doc or a broader architectural pattern

## Bilingual Sync
- Not applicable unless product docs are changed in the same task

## Tests / Verification
1. `go test ./...` in `apps/cloud-api`
2. `pnpm -C apps/cloud-ui build`
3. targeted Vitest covering Explore Editor's Picks same-origin cutover
4. targeted text search showing Cloud-visible Editor's Picks no longer depends on `appleProvider.lookupPodcastsByIds(...)`

## Done When
- Explore Editor's Picks is same-origin and backend-owned in Cloud
- no Cloud-visible Explore path still depends on browser-direct lookup-by-ids
- verification commands are green

## Completion
- Completed by: Codex execution worker
- Reviewed by: Codex reviewer
- Commands: `go test ./...` in `apps/cloud-api`; `pnpm -C apps/cloud-ui exec vitest run src/lib/discovery/__tests__/cloudCutover.sameOrigin.test.ts`; `pnpm -C apps/cloud-ui build`; `rg -n "appleProvider\\.lookupPodcastsByIds" /Users/Leo_Qiu/Documents/dev/readio/apps/cloud-ui/src`
- Date: 2026-03-27 18:25:05 CST
