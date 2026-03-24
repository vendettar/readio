---
description: Rename the current dictionary runtime config to an English-only contract and add explicit not-configured fallback behavior for unsupported transcript languages
---

# Instruction 139: English Dictionary Config and Language Fallback

Goal: make the current dictionary integration contract explicit and fail-closed:

- the existing configured dictionary API is English-only
- runtime config naming must reflect that English-only reality
- lookup attempts for other transcript languages must show an explicit “dictionary API not configured for this language” message instead of pretending the backend supports them
- the architecture must remain extensible so future content regions / languages can each supply their own dictionary API

## Status
- [ ] Active
- [ ] Completed

## Problem

Current code and docs still imply a generic dictionary API:

- runtime config uses a generic key (`READIO_DICTIONARY_API_URL`)
- runtime schema/defaults expose the same generic meaning
- transcript docs describe lookup as if one shared dictionary backend is the long-term model

But current product reality is narrower:

- the configured backend is `https://api.dictionaryapi.dev/api/v2/entries/en/`
- this is an English-only dictionary lookup contract
- non-English transcript tokens may still reach lookup UI flows without a language-specific backend guarantee

This creates three problems:

1. **Semantic drift**: config naming overstates current capability.
2. **User-facing ambiguity**: unsupported languages are not clearly distinguished from “not found” or generic network failures.
3. **Future migration risk**: later per-language / per-region dictionary expansion lacks an explicit transitional contract.

## Product Decision

Current phase policy:

1. Readio currently has **one configured dictionary backend for English only**.
2. Future expansion will support **per-language (and potentially per content-region) dictionary APIs**.
3. Until a language-specific dictionary API is configured, lookup is still allowed to open, but the callout must present an explicit “not configured for this language” state.
4. This is not treated as “word not found”.

## Read First (Required)

- `apps/lite/src/lib/runtimeConfig.defaults.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/public/env.js`
- `apps/lite/src/lib/selection/api.ts`
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- `apps/lite/src/lib/locales/en.ts`
- `apps/lite/src/lib/locales/zh.ts`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

## Scope Scan (Required Before Coding)

1. Config & env parsing
   - High risk. Runtime env key rename changes public configuration contract.
2. Persistence & data integrity
   - No DB schema change expected.
3. Routing & param validation
   - No route contract change expected.
4. Logging & error handling
   - High risk. “Unsupported language / not configured” must not be misclassified as “not found” or “network”.
5. Network & caching
   - Medium risk. English cache and unsupported-language lookup states must not contaminate each other.
6. Storage & serialization
   - No storage format migration expected.
7. UI state & hooks
   - High risk. Lookup callout must display an explicit configuration-state result without breaking close/highlight behavior.
8. Tests & mocks
   - Mandatory. Runtime-config rename, lookup fallback behavior, and docs sync all need regression coverage.

## Hidden Risk Sweep

- **Semantic error drift**: unsupported-language lookup must not surface `lookupNotFound`.
- **Backward-compat confusion**: this task is a hard break for the old config key; mixed old/new key support is not allowed.
- **Dynamic context consistency**: language-dependent dictionary availability must resolve from the actual transcript / content language, not a stale singleton or module-scope snapshot.
- **Highlight side effects**: unsupported-language lookup must not arm delayed same-word highlight as if lookup succeeded.
- **Cache contamination**: unsupported-language fallback states must not be written into or read from the English dictionary cache path.

## Target Contract

### Runtime Config

- Replace generic English lookup config naming with an English-specific contract.
- The current configured backend must be represented as English-only in both name and behavior.

Expected direction:

- old meaning: generic `READIO_DICTIONARY_API_URL`
- new meaning: English-specific key (for example `READIO_EN_DICTIONARY_API_URL`)

The final implementation must update:

- defaults
- schema
- env map
- browser runtime typing
- handoff docs

### Lookup Behavior

For a lookup request:

1. If transcript language is supported **and** the corresponding dictionary API is configured:
   - perform normal lookup
2. If transcript language does not yet have a configured dictionary API:
   - open lookup UI
   - show explicit message equivalent to:
     - `Dictionary API is not configured for this language yet`
   - do not classify as `lookupNotFound`
   - do not classify as `errorNetwork`
   - do not treat as successful dictionary result

### Lookup Language Source Contract

Dictionary availability must be resolved from the actual transcript/content language carried through the lookup flow.

Required rules:

- `139b` must pass an explicit lookup language through the selection/lookup pipeline.
- Language keys must be normalized before dictionary-availability resolution so region forms (for example `en-US`) map to their configured base-language contract instead of falling into the unsupported-language path.
- Do not infer dictionary availability from UI locale, app default language, or module-scope singleton state.
- Do not let the lookup flow guess language from unrelated global i18n state when transcript/content language is available.

The child implementation must make the language source reviewable in code.

### Cache Contract

Current implementation must preserve semantic separation between:

- successful English dictionary entries
- unsupported-language not-configured fallback state

Required rules:

- unsupported-language fallback must not populate the English dictionary cache
- unsupported-language fallback must not affect English lookup highlighting behavior
- implementation should remain compatible with future per-language cache namespacing rather than deepening word-only cache assumptions

### Future Expansion Contract

Docs must state clearly:

- future product direction is per-language dictionary API support
- current implementation only has English configured
- unsupported languages use explicit not-configured fallback until their API is wired

Region-aware dictionary routing is future architecture context only.
It must not be introduced as an implementation requirement in this instruction unless a later product/provider reality requires it.

## Solution Selection

### Option A: Keep generic key and just document English-only behavior
- Lower short-term implementation cost
- Worse long-term clarity
- Leaves current semantic mismatch in place

### Option B: Rename config to English-only now and add not-configured fallback
- Slightly higher implementation cost
- Best semantic accuracy
- Best future path for adding per-language APIs without over-designing region routing now

**Decision**: choose Option B.

Rationale:

- current name overclaims capability
- fail-closed unsupported-language behavior is a product requirement now
- future multi-language expansion is easier when the English-only contract is already explicit

## Implementation Mode (Strict)

This instruction is expected to exceed a safe one-pass scope and must be split into child instructions if needed.

Recommended split:

- `139a-english-dictionary-config-rename`
- `139b-language-not-configured-lookup-state`
- `139c-dictionary-doc-and-decision-sync`

Do not combine config rename, UI fallback, and docs/decision sync into one uncontrolled pass if the touched file count or risk becomes too large.

## Required Changes

### 1. Rename the current dictionary config contract to English-only

Implementation must update the runtime config naming so both the environment variable name and internal config naming reflect English-only behavior.

This includes:

- runtime defaults
- schema fields
- env map
- browser runtime typings
- any helper/API usage sites

The final naming must be internally consistent. Do not leave mixed generic and English-specific naming in active code paths.

This rename is a hard break:

- only the new English-specific key is supported after this task
- the old generic key must not remain readable in active runtime config paths
- docs must describe only the new key

### 2. Add explicit unsupported-language lookup state

The lookup flow must detect when the transcript/content language lacks a configured dictionary API and produce a dedicated UI state.

Required semantics:

- lookup callout still opens
- callout content states “dictionary API not configured for this language”
- this state should use a dedicated UI/error key rather than reusing `lookupNotFound` or `errorNetwork`
- this state is distinct from:
  - no result / not found
  - network failure
- this state must not arm delayed same-word lookup highlighting

### 3. Preserve current English behavior

English lookup must continue to work through the configured English dictionary API.

### 4. Prepare future per-language/per-region dictionary expansion

Implementation must not hard-code “English vs everything else” in a way that blocks future per-language growth.

Preferred architecture:

- dictionary availability resolved by language key / mapping
- English is simply the only configured entry today

Non-goal for this task:

- do not introduce region-aware routing or provider selection abstractions yet

### 5. Update docs and decision log

This task changes runtime config contract and product behavior, so documentation updates are required in the same execution wave.

Required docs:

- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.mdx`
- `apps/docs/content/docs/apps/lite/handoff/features/transcript-reading.zh.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.mdx`
- `apps/docs/content/docs/apps/lite/handoff/environment.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`

## Acceptance Criteria

1. Runtime config no longer describes the current English-only dictionary backend as a generic all-language dictionary API.
2. English lookup continues to function.
3. Unsupported transcript languages open lookup UI with a dedicated “not configured” state.
4. Unsupported-language lookup is not misreported as “not found” or “network error”.
5. Unsupported-language lookup does not apply same-word highlight as if lookup succeeded.
6. Docs clearly describe:
   - current English-only state
   - future per-language / per-region expansion direction
   - current fallback UX for unsupported languages
7. Decision log records the contract change.
8. Language normalization prevents supported region variants (for example `en-US`) from being misclassified as unsupported.

## Required Tests

At minimum, child execution must cover:

1. runtime config accepts the new English-specific key and no longer depends on the generic name
2. English lookup still succeeds normally
3. unsupported-language lookup returns the dedicated “not configured” UI state
4. unsupported-language lookup close path does not arm/apply delayed same-word highlight
5. existing not-found and network error paths remain semantically distinct
6. old generic dictionary env key is no longer accepted by runtime config
7. normalized English region variants (for example `en-US`) still resolve through the English dictionary path
8. any new user-visible lookup-state key is covered by all shipped locale files, or the child instruction explicitly documents and tests the fallback policy

## Verification

Follow child instruction verification commands if split.
If not explicitly split, minimum verification must include:

- relevant narrow `vitest` suites for runtime config + lookup state
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/docs lint`

## Decision Log

- Required

## Bilingual Sync

- Required

## Reviewer Evidence Surface

### Changed-Zone Files (Must Review)
- `apps/lite/src/lib/runtimeConfig.defaults.ts`
- `apps/lite/src/lib/runtimeConfig.schema.ts`
- `apps/lite/src/lib/runtimeConfig.ts`
- `apps/lite/public/env.js`
- `apps/lite/src/lib/selection/api.ts`
- `apps/lite/src/hooks/selection/useSelectionActions.ts`
- `apps/lite/src/components/Selection/SelectionUI.tsx`
- touched locale files
- touched docs / decision log files

### Adjacent Critical Files (Spot Check)
- `apps/lite/src/lib/selection/dictCache.ts`
- `apps/lite/src/lib/selection/types.ts`
- `apps/docs/content/docs/apps/lite/handoff/i18n.mdx`
- `apps/docs/content/docs/apps/lite/handoff/i18n.zh.mdx`
- transcript handoff docs
