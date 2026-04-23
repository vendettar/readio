# Instruction 003: Cloud Discovery PodcastIndex Relay Validation And Request Normalization

Harden the PodcastIndex relay methods so they validate PI response status before caching or serializing, centralize PI auth/header construction, and stop accepting oversized or ambiguous PI request bodies.

## 1. Instruction Metadata

- **Decision Log**: Required
- **Bilingual Sync**: Not applicable
- **Priority**: High
- **Owner Stream**: Cloud API PodcastIndex relay boundary
- **Depends on**: Current PI second-hop ownership for detail/enrichment

## 2. Constraint Check

- Current intended architecture in this thread
  - PI owns detail/enrichment via `itunesId`
  - RSS remains fallback only
- `apps/docs/content/docs/general/api/podcastindex/podcasts.mdx`
  - PI podcast lookups return `status: "true"` and feed payloads
  - `podcasts/batch/byguid` returns `status`, `found`, `feeds`
- `apps/docs/content/docs/general/api/podcastindex/episodes.mdx`
  - PI episode lookups return `status: "true"` and episode/items payloads
- `agent/instructions/cloud/022-discovery-cache-graceful-degradation.md`
  - local decoding/contract bugs must not be silently promoted to success
- Current in-repo canonical identity contract
  - PI show/detail enrichment is `podcasts/byitunesid`
  - PI episode archive lookup is `episodes/byitunesid`
  - exact episode lookup is `episodes/byguid` plus `podcastItunesId`
  - `feedid` / `feedurl` episode-resolution paths are not production-owned unless explicitly reintroduced

## 3. Problem Statement

The PI relay methods currently over-trust upstream success:

1. PI response `status` is declared in structs but not validated before use.
2. Several relay methods can return zero-value payloads as successful fetches, which then get cached or serialized.
3. PI auth/hash/header logic is duplicated across multiple methods, increasing drift risk.
4. The public GUID batch route does not enforce a body size or batch cardinality contract.
5. The relay still risks over-preserving upstream compatibility branches such as `feedid` even when cloud-ui no longer exercises them.

This instruction tightens the PI boundary without changing ownership:

- PI remains the second-hop provider
- the relay becomes stricter about what counts as a successful upstream response
- shared request construction is centralized

## 4. Decision Log

| # | Decision | Rationale |
|---|---|---|
| D1 | PI relay success requires validated `status` and required payload shape | Declared-but-ignored status fields are dead safety rails |
| D2 | Zero-value PI payloads must not be cached as successful refreshes unless explicitly treated as not-found | Prevent transient PI weirdness from becoming stable cached nulls |
| D3 | PI auth/header construction must be centralized | Avoid duplicated timestamp/hash/header drift across methods |
| D4 | GUID batch requests need a body-size and cardinality contract | Public POST routes must not accept unbounded payloads |
| D5 | Optional numeric fields must remain optional in serialized responses | `0` should not automatically become a meaningful duration or count |
| D6 | In-repo cloud episode-resolution must not keep dead PI identifier branches alive | Dead compatibility paths obscure the active contract |

## 5. Affected Methods

- `apps/cloud-api/discovery_podcastindex.go`
  - `fetchPodcastIndexEpisodes`
  - `fetchPodcastIndexEpisodeByGUID`
  - `fetchPodcastIndexPodcastByItunesID`
  - `fetchPodcastIndexPodcastsBatchByGUID`
  - `handlePodcastIndexEpisodes`
  - `handlePodcastIndexPodcastsBatchByGUID`
  - `handlePodcastIndexPodcastByItunesID`
  - `mapPodcastIndexPodcastToDiscoveryPodcast`
  - `mapPodcastIndexFeedToSummaryResponse`
- `apps/cloud-api/discovery.go`
  - `getWithGracefulDegradation`
  - shared error classification and typed cache handling
- `apps/cloud-api/discovery_test.go`

## 6. Required Changes

### Scope Boundary

This instruction owns API-side PI relay correctness:

- request normalization
- request authentication/header construction
- response validation
- cache-write eligibility
- public batch-route limits

It does not own:

- UI route semantics
- editor-pick snapshot policy
- RSS fallback policy
- generic discovery-infra cleanup beyond the minimal typing/error-shaping changes needed to harden PI routes

If a helper becomes shared, keep the helper narrow: centralize PI transport/auth concerns, but leave endpoint-specific success validation with the endpoint-specific code.

### A. Validate PI response `status` and shape before success

For all PI fetch methods:

1. treat `status != "true"` as upstream-invalid
2. treat missing required payload members as upstream-invalid
3. distinguish:
   - explicit not-found / empty-but-valid result
   - invalid upstream payload

At minimum:

- `fetchPodcastIndexPodcastByItunesID` must not return a zero-value feed as a normal success
- `fetchPodcastIndexEpisodeByGUID` must not return a zero-value episode object as a normal success
- `fetchPodcastIndexEpisodes` must not treat malformed item lists as valid episode archives
- `fetchPodcastIndexPodcastsBatchByGUID` must validate `status`, `feeds`, and returned feed identity fields
- `fetchPodcastIndexEpisodeByGUID` must only exercise the active `podcastItunesId` branch unless a new production owner is introduced

### B. Do not cache ambiguous `nil` refreshes as successful by default

Review every fetch closure passed into `getWithGracefulDegradation` for PI routes.

Required outcome:

- a transient invalid PI payload must not become a cached `nil`/empty successful refresh
- only explicit and intentional not-found semantics may be cached as null/empty
- the route must document when null is a valid response and when it is not

### C. Centralize PI request construction

Create a shared helper for PI relay requests that owns:

- credential presence checks
- timestamp generation
- SHA1 auth hash construction
- `User-Agent`
- `X-Auth-Key`
- `X-Auth-Date`
- `Authorization`
- JSON GET/POST execution

This helper must replace the repeated request-building logic in the three fetch methods and the batch POST method.

### D. Harden the GUID batch route contract

`handlePodcastIndexPodcastsBatchByGUID` must add explicit limits:

- request body size limit
- max number of GUIDs per request
- dedupe normalized GUIDs before upstream dispatch

Behavior requirements:

- malformed JSON array still fails fast
- oversized body or too many GUIDs returns a typed param/bad-request error
- response ordering remains aligned to the caller’s normalized GUID order for successfully found items

### E. Remove dead identifier branches while tightening the relay

Review the in-repo cloud-ui callers before preserving any PI lookup path that accepts:

- `feedid`
- `feedurl`
- other non-`podcastItunesId` identifiers for active episode-resolution routes

If there is no production owner in the current repo, remove the branch instead of carrying it forward as speculative compatibility.

### F. Tighten PI response shaping

Review serialized response fields for optional numeric values:

- duration
- episodeCount
- other zero-value optional fields

Do not emit synthetic `0` pointers unless `0` is a real, intentional value.

### G. Must Not Regress

- HTTP 200 from PI is not sufficient for success; `status != "true"` remains invalid even when transport succeeded.
- Exact-lookup routes such as `podcasts/byitunesid` and `episodes/byguid` must never serialize a synthetic zero-value object as if it were a resolved record.
- If a centralized PI transport helper is introduced, it must not hide route-specific payload validation behind a “generic success” abstraction.
- Duplicate GUIDs in batch requests may be deduped for upstream work, but caller-visible normalization/order behavior must be deterministic and explicitly tested.
- Invalid PI payload classification must happen before cache write and before nil/empty results are treated as refresh success.
- Dead non-`podcastItunesId` exact-lookup branches must stay deleted unless a real production owner is reintroduced and documented first.

### H. Changed-Zone Tests To Rewrite Or Add

- `apps/cloud-api/discovery_test.go`
  - add `status: "false"` coverage for each active PI relay family
  - add zero-value `podcasts/byitunesid` payload coverage
  - add zero-value `episodes/byguid` payload coverage
  - add batch duplicate-GUID normalization/ordering coverage
  - add oversized batch/body-limit coverage
  - add explicit proof that non-`podcastItunesId` exact episode-resolution branches are gone

### I. Recommended Rollout Order

1. Add failing PI validation tests for `status`, zero-value payloads, and batch limits.
2. Centralize PI auth/request construction without weakening endpoint-specific validation.
3. Tighten each PI fetch method’s success/not-found/invalid distinctions.
4. Apply batch normalization/body limits and delete dead identifier branches.
5. Remove optional-zero response residue and re-run full PI discovery tests.

## 7. Forbidden Outcomes

- No change away from PI as the detail/enrichment provider
- No new generic “fire-and-forget” PI helper that hides route-specific validation
- No unbounded public GUID batch POST body
- No caching of ambiguous PI invalid payloads as successful refreshes
- No preservation of dead `feedid`/non-itunesid episode-resolution branches without a documented production owner

## 8. Verification Plan

### Required Automated Verification

- `go test ./...` in `apps/cloud-api`
- new/updated tests covering:
  - PI `status: "false"` handling
  - PI zero-value podcast lookup payload does not cache as success
  - PI zero-value episode-byguid payload does not cache as success
  - GUID batch body-size/cardinality enforcement
  - deduped GUID batch request ordering/serialization

### Required Manual Verification

1. Open a show detail page and confirm PI byitunesid still loads valid detail.
2. Open an editor-pick batch flow and confirm PI batch results still preserve input order for found rows.
3. Confirm a PI provider misconfiguration still returns service unavailable cleanly.

## 9. Acceptance Criteria

- [ ] all PI relay methods validate `status` before treating a response as success
- [ ] zero-value PI podcast/episode payloads are not silently cached as successful refreshes
- [ ] PI auth/header construction is centralized
- [ ] GUID batch route enforces body-size and batch-count limits
- [ ] optional numeric fields are no longer serialized as meaningless zero pointers
- [ ] changed-zone PI tests cover invalid status/payload handling
- [ ] dead non-`podcastItunesId` episode-resolution branches are removed unless a real owner is documented
- [ ] duplicate GUID batch normalization and caller-visible ordering are documented by tests

## 10. Completion

- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
