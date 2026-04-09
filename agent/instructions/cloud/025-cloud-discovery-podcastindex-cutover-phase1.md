# Instruction 025: Cloud Discovery PodcastIndex Cutover Phase 1

## Objective
Replace the supplementary hydration source used by Instruction 023.

Current state:
- `PodcastShowPage` uses RSS as the primary episode source
- when RSS looks severely truncated, the page fetches supplementary historical episodes from Apple lookup
- this task changes only that supplementary source

Target state:
- keep RSS as the primary source of truth
- when RSS looks severely truncated, use PodcastIndex episode lookup to supplement missing history
- do not use Apple episode lookup for the 023 hydration path anymore

## Scope
This task is intentionally narrow.

In scope:
- Cloud UI hybrid hydration path introduced by Instruction 023
- the supplementary history source for truncated show pages
- any minimal Cloud backend helper/relay work required only to support this hydration source safely

Out of scope:
- full discovery provider migration
- replacing Apple search
- replacing Apple top charts
- replacing `lookup/podcast` globally
- replacing RSS as the primary content source
- redesigning the dedicated episodes page
- introducing a new pagination architecture

## Why
Apple supplementary episode lookup has proven unreliable as a hydration source:
- sometimes Apple returns fewer episodes than RSS
- sometimes it adds no useful historical coverage
- it is not a trustworthy long-term source for truncated-feed repair

PodcastIndex is a better candidate for this specific job:
- episode history lookup is a first-class API
- lookup can be keyed by Apple/iTunes podcast identity
- it is a more natural supplementary catalog source than Apple for this scenario

## Core Contract
### 1. RSS remains primary
RSS still owns:
- feed-level show metadata
- any episode that already exists in RSS
- richer episode content already present in RSS

PodcastIndex may only:
- add missing historical episodes that RSS does not contain
- provide fallback episode metadata for those newly added items

It must not:
- overwrite existing RSS episode fields
- replace RSS-owned latest episode when RSS already has that item
- become the primary source for the whole page

### 2. PodcastIndex replaces Apple only for the hydration path
For truncated-feed supplemental hydration:
- do not call Apple `lookup/podcast-episodes`
- do call PodcastIndex instead

This instruction does **not** require removing Apple from other discovery routes.

### 3. No-gain hydration must still be discarded
Keep the 023 protection:
- if supplementary fetch adds no net new episodes after merge/dedupe
- discard the supplementary result
- keep RSS unchanged

### 4. Graceful failure
If PodcastIndex supplementary fetch fails:
- keep the original RSS list unchanged
- do not hard-fail the show page
- do not clear rendered RSS items
- do not introduce flicker/reset

## Source Selection Contract
Use PodcastIndex only when the existing 023 truncation heuristic says hydration is worth attempting.

Keep the current gating shape unless a focused reproducer proves it wrong:
- severe RSS scarcity
- meaningful discrepancy vs total known catalog size
- valid source identity for supplementary lookup

However, the supplementary lookup identity must now be PodcastIndex-compatible.

## Identity / Keying Strategy
The supplementary fetch must be keyed from a stable show identity supported by PodcastIndex.

Phase 1 identity order:
1. Apple/iTunes podcast id already present on the show record
2. PodcastIndex feed id, only if it is already available from a prior trusted lookup
3. other stable PI-compatible podcast identity only if explicitly justified

Do not use the current RSS `feedUrl` for PodcastIndex supplementary lookup in this phase.
For truncated-feed shows, that URL may itself be the truncated identity and will systematically miss the complete PI history.

If the page lacks a PI-compatible lookup identity:
- do not attempt supplementary hydration
- keep RSS-only behavior

Phase 1 contract:
- UI should pass the smallest stable lookup identity it already has
- for current discovery data, use the Apple/iTunes podcast id first
- UI consumers should prefer `providerPodcastId` but fall back to `id` when the source only exposes the same Apple/iTunes id there
- pass that value to Cloud as `itunesId`
- do not introduce speculative feed canonicalization in this phase
- do not invent a lossy fallback from titles or current RSS `feedUrl`
- missing or non-numeric `itunesId` values must short-circuit to skip rather than attempting a speculative PI lookup

## Backend Route Contract
Phase 1 should use the smallest backend surface that safely supports the 023 hydration path.

Recommended shape:
- add or extend a Cloud discovery helper/route dedicated to podcast supplementary history lookup
- the route is owned by Cloud backend and may call PodcastIndex with server-side credentials
- the route should not become a general-purpose provider migration surface in this phase

Input contract:
- accept only the minimum lookup identity needed for PodcastIndex history lookup
- reject malformed or unsupported identity input with a safe skip/failure path
- phase 1 route input is `itunesId`

Output contract:
- return only the minimal episode fields needed by the existing 023 merge path
- keep the response shape narrow and hydration-specific
- do not return raw PodcastIndex upstream payloads directly to the browser
- backend must map PodcastIndex responses into a narrow hydration episode shape owned by Cloud
- do not couple this phase to a broader discovery schema rewrite

## Backend / Security Boundary
PodcastIndex authenticated endpoints require server-side credentials.

Therefore:
- do not call authenticated PodcastIndex endpoints directly from the browser
- route authenticated PodcastIndex access through Cloud backend ownership
- keep PodcastIndex credentials server-side only
- do not expose PodcastIndex secrets in `/env.js`

If a no-auth PI endpoint is used for a specific part, document that explicitly.
But the default assumption for this task is:
- authenticated PI access belongs to Cloud backend

Phase 1 explicitly does not allow:
- shipping PodcastIndex credentials to the browser
- exposing PodcastIndex auth material through `/env.js`
- browser-direct calls to authenticated PI episode history endpoints

## Recommended Phase 1 Architecture
Use the smallest safe cutover:
1. browser renders RSS episodes first
2. truncation heuristic decides whether to attempt supplementation
3. browser calls same-origin Cloud discovery endpoint/helper
4. Cloud backend queries PodcastIndex for episode history
5. browser merges RSS + PodcastIndex episodes with existing RSS-first rules
6. browser discards no-gain results

This keeps:
- UI behavior stable
- secrets on the backend
- provider cutover localized

## Dedupe / Merge Contract
Preserve the Instruction 023 merge rules.

Dedupe key priority:
1. normalized enclosure/audio URL
2. RSS/item GUID when available
3. title + publish date as last-resort fallback

Rules:
- RSS item wins when both sources describe the same episode
- PodcastIndex only fills missing items
- merged list sorts by publish date descending
- invalid/missing dates remain stable-last
- if identity evidence is weak, fail conservatively and avoid false-positive dedupe

## PodcastIndex Data Mapping Contract
PodcastIndex supplementary items may populate only the minimal episode fields needed for merge and rendering, such as:
- title
- description
- audio/enclosure URL
- publish date
- artwork URL
- duration
- GUID, when present

Rules:
- RSS-owned items must keep existing RSS fields
- PI metadata may only populate newly added supplementary items
- PI must not overwrite richer RSS episode descriptions, artwork, or enclosure data for items already present in RSS
- if PI omits a field, do not synthesize a misleading placeholder value merely to satisfy a merge path

## Failure / Empty / Skip Semantics
The implementation must distinguish these cases in behavior and observability:

1. skip
- no PI-compatible identity
- truncation heuristic does not justify hydration
- invalid or unsupported lookup identity

2. graceful failure
- PI upstream/network/auth failure
- RSS remains rendered and unchanged

3. no-gain result
- PI request succeeds but adds no net-new episodes after merge/dedupe
- discard supplementary result and keep RSS-only list

4. useful supplement
- PI request succeeds and merged list grows with new historical items

Do not collapse all of the above into a single generic "failed" reason.

## Cutover Boundaries
This phase is a source cutover, not a hydration redesign.

Must preserve:
- RSS-first rendering
- no second loading skeleton
- no list reset/flicker after RSS is already visible
- the 023 show-switch race protection
- latest/default episode selection behavior derived from the final merged list

Phase 1 does not require:
- a new pagination architecture
- a general PI discovery migration
- persistent frontend caching changes beyond the existing 023 hydration behavior
- a new backend cache layer unless an existing low-risk discovery cache can be reused without broadening scope
- a retry/backoff/rate-limit redesign for discovery as a whole unless strictly required for this hydration path

## Reproducer-First
Start with a failing regression test before implementation.

At minimum, add focused coverage for:
1. truncated RSS + PodcastIndex returns more history -> merged list grows
2. truncated RSS + PodcastIndex returns fewer/no useful episodes -> RSS remains unchanged
3. PodcastIndex fetch failure -> RSS remains unchanged
4. no valid Apple/iTunes podcast id -> no supplementary fetch
5. RSS-first merge still wins over PI for duplicate items

## Tests
Must add or update focused tests covering:
1. severe truncation triggers PI hydration instead of Apple hydration
2. Apple supplementary endpoint is no longer used on this path
3. PI supplementary fetch increases history when useful
4. PI supplementary fetch with no net new episodes is discarded
5. PI supplementary fetch failure is graceful
6. no valid Apple/iTunes podcast id means RSS-only fallback
7. latest episode CTA still behaves correctly after merge
8. stale async results from one show cannot overwrite another show
9. UI hydration path no longer calls Apple supplementary lookup
10. duplicate-only PI results are discarded as no-gain hydration
11. invalid or weak `itunesId` input safely skips supplementation
12. PI-only newly added items do not replace an existing RSS latest episode

## Observability
Keep low-cardinality hydration observability and update the reason/source fields.

Suggested fields:
- `episodes_hydration=skipped|applied|failed`
- `episodes_hydration_source=podcastindex`
- `episodes_hydration_reason=...`
- `rss_count`
- `supplementary_count`
- `merged_count`

Do not emit high-cardinality episode-level labels.

Suggested low-cardinality reasons:
- `not_truncated`
- `missing_identity`
- `invalid_identity`
- `pi_error`
- `no_gain`
- `applied`

## Review Focus
Reviewer must check:
1. Apple supplementary hydration is no longer used in the 023 path
2. RSS remains the primary source
3. PodcastIndex credentials stay server-side
4. no PI identity means safe RSS-only behavior
5. no-gain supplementary results are discarded
6. failure remains graceful
7. merge/dedupe semantics from 023 are preserved
8. PI route scope did not expand into a general discovery/provider migration
9. no second loading state or RSS flicker was introduced by the cutover

## Acceptance Criteria
- [ ] Truncated show pages no longer use Apple as the supplementary history source
- [ ] RSS remains the primary source for existing feed episodes
- [ ] PodcastIndex can supplement missing historical episodes when useful
- [ ] No-gain PI results are discarded
- [ ] PI failure leaves RSS behavior intact
- [ ] No PodcastIndex secret reaches browser runtime config
- [ ] Latest episode CTA and episode ordering remain correct

## Completion
- **Completed by**:
- **Commands**:
- **Date**: 2026-04-09
- **Reviewed by**:
