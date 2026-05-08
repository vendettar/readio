# Cloud PI Refactor Audit

Active worker backlog for the Cloud PI refactor.

## Scope

Use this folder as the execution backlog for the remaining PI-first cleanup. Findings keep their original IDs so workers and reviewers can reference them consistently.

Workers should follow only the active checklist items in this folder. Detailed finding bodies in the topic files are reference material; if a finding is not linked from an active checklist, do not schedule it in the current pass.

## Fixed Decisions

These are already settled and must not be re-opened during implementation.

- RSS/feed XML is fully removed from page-rendering data flow.
- `feedUrl` is record-only metadata and does not participate in rendering logic or business identity.
- frontend schema names align with PI, such as `PIPodcastSchema` and `PIEpisodeSchema`.
- public business type aliases remain `Podcast` and `Episode`.
- `fileSize` remains on the episode contract for future detail-page use.
- first-release policy applies: no backward-compatibility branches for old local data.
- Dexie version baseline is `1`.

## Excluded From Current Execution

- stale product surfaces that are already removed, such as OPML / `bulkSubscribe`
- compatibility work for old local DB data, old vault payloads, or old pre-release migration paths
- duplicate frontend restatement of backend-owned PI `max=1000` semantics

## Execution Order

1. Discovery correctness and canonical identity cleanup
2. Remote playback identity and `countryAtSave` hardening
3. Storage / repository / vault contract cleanup
4. Favorites / downloads / local-search contract cleanup
5. Regression coverage and lower-priority cleanup after correctness is stable

## Global Worker Checklist

- [x] Batch A: finish active discovery work from [01-discovery-and-pi-contract.md](./01-discovery-and-pi-contract.md)
- [x] Batch B: finish active player/playback work from [02-player-and-playback.md](./02-player-and-playback.md)
- [x] Batch C: finish active storage/repository/vault work from [03-storage-db-repository-vault.md](./03-storage-db-repository-vault.md)
- [x] Batch D: finish active library/favorites/downloads/search work from [04-library-favorites-downloads-search.md](./04-library-favorites-downloads-search.md)
- [x] After each batch, remove stale tests/fixtures that still encode URL-owned identity or malformed canonical DTOs
- [x] Verify no new code reintroduces RSS/feed XML parsing, feed-owned identity, or URL-owned canonical playback identity

## Required Verification Matrix

- [x] Discovery route resolution: show page, episodes page, detail page, editor-pick bootstrap, canonical route replacement
- [x] Remote playback restore: session reuse, local-download preference, transcript ownership, stale-async guards
- [x] Favorites / downloads / local search merge: one canonical episode should not split by URL, row id, or title text
- [x] Vault export/import: current product contract still round-trips normalized current-format metadata without hidden rewrites

## Topic Files

- [01-discovery-and-pi-contract.md](./01-discovery-and-pi-contract.md)
  Scope: Go discovery relay, PI DTO/schema ownership, frontend discovery contracts, episode-list source semantics
- [02-player-and-playback.md](./02-player-and-playback.md)
  Scope: player state, playback identity, session restore, transcript/playback metadata boundaries, replay orchestration
- [03-storage-db-repository-vault.md](./03-storage-db-repository-vault.md)
  Scope: Dexie schema and indexes, repository boundaries, storage normalization, vault/import-export ownership
- [04-library-favorites-downloads-search.md](./04-library-favorites-downloads-search.md)
  Scope: favorites, downloads, local search, command palette, UI-facing persistence contracts

## Current Active IDs

Only these IDs are in the current execution pass. All other finding IDs below are reference-only unless explicitly promoted.

- Batch A active IDs: `1`, `6`, `7`, `13`, `16`, `25`, `56`, `74`, `75`, `84`, `86`, `87`, `88`, `89`, `104`, `106`, `108`, `109`
- Batch B active IDs: `4`, `11`, `20`, `21`, `23`, `24`, `32`, `34`, `35`, `41`, `42`, `43`, `51`, `52`, `53`, `54`, `55`, `70`, `71`, `72`, `73`, `78`, `80`, `81`, `83`, `98`, `99`, `100`, `101`, `102`, `103`
- Batch C active IDs: `3`, `9`, `12`, `14`, `15`, `18`, `22`, `28`, `44`, `45`, `47`, `48`, `57`, `61`, `62`, `63`, `64`, `65`, `66`, `67`, `68`, `69`, `92`, `93`, `97`, `105`
- Batch D active IDs: `17`, `19`, `27`, `29`, `30`, `31`, `33`, `36`, `37`, `38`, `39`, `40`, `46`, `49`, `50`, `58`, `59`, `60`, `76`, `77`, `79`, `82`, `85`, `94`, `95`, `96`, `107`, `110`

## Finding Index
### Discovery And PI Contract
- 1. Go discovery contract hardening
- 2. Frontend discovery contract alignment
- 6. Go relay semantics and DTO discipline
- 7. Frontend contract and schema-boundary discipline
- 13. Schema bypass is broader than the shared discovery fixtures
- 16. Some cloud-api tests still lock in rejected behavior
- 25. Podcast detail cache is over-partitioned by country
- 26. Some public discovery/storage APIs still force transport-shaped callers
- 56. Backend/cache naming still preserves the old “archive” mental model for the PI episode list payload
- 74. The PI `episodes/byitunesid` mapping path still uses mixed fail-open and fail-closed validation semantics for canonical episode rows
- 75. The PI upstream decoder surface is still wider than the actually used canonical contract
- 84. Canonical episode-route assembly is still duplicated across multiple modules instead of being owned by one route helper
- 86. PI episode-list authority is still serialized into positional string tokens and reparsed from query-key offsets
- 87. Canonical podcast content routes still bypass the shared query-cache helpers and each reassemble resource loading locally
- 88. `PodcastShowPage` still mixes requested route id and canonical podcast id when building episode navigation
- 89. Podcast show and episodes pages still do not replace-navigate onto canonical podcast ids after authoritative lookup
- 90. Editor-pick route-state parsing still carries explicit `episodeSnapshot` legacy-cleanup logic
- 91. `getEpisodeGuid()` remains as an unused wide-input bridge helper in the PI discovery layer
- 104. Discovery tests still manufacture schema-impossible PI entities outside the shared fixture layer
- 106. Discovery route tests still codify positional react-query key grammar instead of using shared query-contract ownership
- 108. PI contract drift has spread beyond discovery tests into playback and row-model helper suites
- 109. Explore and global-search component tests still treat empty canonical identity as a normal UI input shape

### Player And Playback
- 4. Player / session / remote metadata boundary cleanup
- 5. Playback-session storage residue
- 11. Canonical identity still loses to URL during restore flows
- 20. Transcript and ASR side-channel identity remains URL-owned for remote playback
- 21. Core playback identity for remote content is still URL-owned
- 23. `PlaybackSession` is carrying mixed domain semantics in the same fields
- 24. Player-side auxiliary state still keys off source URL churn rather than canonical playback identity
- 32. Remote playback helper quietly weakens required `countryAtSave` back into an empty-string fallback
- 34. Player metadata still allows country-less hybrid remote identity objects
- 35. `countryAtSave` is still being reconstructed from mutable global state instead of preserved as a source snapshot
- 41. Local sessions that retain a network identity can still be replayed through the remote-history path
- 42. Remote session restore still rebuilds “canonical” player metadata from malformed explore rows without validating required PI fields
- 43. History affordances are still enabled by a partial remote-identity guard rather than the full canonical contract
- 51. Player download affordances are still URL-status-owned while the actual action requires canonical remote metadata
- 52. `ReadingContent` still splits one playback context across multiple incompatible side-channel key domains
- 53. Player core track equality and session reset are still URL-owned instead of canonical-identity-owned
- 54. Remote playback session reuse is still resolved by URL lookup at runtime
- 55. Restore dedupe in `GlobalAudioController` uses a third playback identity shape that diverges from the session hook
- 70. Player-side metadata types are only partially separated; many critical entry points still accept the catch-all `EpisodeMetadata` union and then recover intent with runtime guards
- 71. Player metadata snapshots are still conflated with playback transport/control context
- 72. `playerStore.setAudioUrl()` has become an overloaded catch-all mutation API for loading state, identity switching, metadata injection, blob cleanup, and session reset
- 73. Playback rehydration and resume assembly logic is still duplicated across multiple entry points instead of being owned by one playback command path
- 78. Download-page playback still drops persisted episode description when reconstructing canonical playback metadata
- 80. Remote audio export still stages through the main download-persistence pipeline instead of a dedicated export path
- 81. `surfacePolicy` is currently a no-op abstraction layer that no longer encodes any real playback-surface policy
- 83. `MiniPlayerMoreMenu` still derives export-context invalidation from its own ad hoc playback key instead of the shared playback identity/export context
- 98. `importTranscriptForCurrentPlayback()` still mutates transcript/player state after async work without revalidating current playback identity
- 99. Transcript export/import still treats the global `transcriptStore` cue array as current-track truth without playback-identity ownership
- 100. `playerStore.restoreSession()` still has a stale-restore hole in the remote-session local-download probe path
- 101. Startup session-restore trigger ownership is still split between `useSession` and `useAppInitialization`
- 102. Transcript follow-state recovery is still wired only to the manual import event, not to the normal subtitle load paths
- 103. Player/transcript tests still codify low-level coordination tokens as if they were stable public contract

### Storage DB Repository Vault
- 3. Favorite / download / storage contract drift
- 9. Storage model and vault contract
- 12. Persisted time fields are not modeled consistently
- 14. Persistence normalization still allows semantic shape mutation
- 15. Public storage types still encode the wrong ownership model
- 18. Physical DB indexes still encode pre-refactor ownership
- 22. Some public helper surfaces structurally prevent identity-first migration
- 28. Dead or stale DB helpers still encode old GUID semantics
- 44. Dexie still encodes remote episode ownership around URL, bare GUID, and derived key rather than canonical composite identity
- 45. Vault integrity/import still does not treat podcast downloads as canonical episode resources
- 47. Vault import bypasses podcast-download normalization and can persist raw track rows that never passed DB invariants
- 48. Vault regression coverage still does not exercise podcast-download normalization or canonical duplicate rejection
- 57. Several canonical-identity helpers still advertise nullable inputs and silently downgrade contract violations into “not found” fallbacks
- 61. The library persistence layer still leaks raw Dexie tables and record-normalization helpers across abstraction boundaries
- 62. `PlaybackSessionUpdatePatch` still exposes identity and source-shape fields as routine mutable updates
- 63. The repository layer is not acting as a consistent façade; most repositories still mix high-level `DB` methods with raw Dexie table access
- 64. The public vault import/export contract is still an internal Dexie metadata dump, not a product-level backup model
- 65. Raw Dexie table access has leaked beyond repositories into utility/business modules
- 66. `FileTrack` and `PodcastDownload` update contracts are still full-row patch surfaces instead of narrow operations
- 67. Tests are actively codifying thin-proxy repositories and Dexie-shaped vault contracts as the intended design
- 68. `db/types.ts` is still a mixed public-domain surface plus storage-only sentinels/helpers, and those storage details have leaked outward
- 69. `dexieDb.ts` is still serving as both the runtime persistence gateway and an app-wide type barrel
- 92. Metadata-only vault imports are still automatically rewritten into corrupted tracks by startup integrity maintenance
- 93. Vault schema still treats derived `favorite.key` as an external import contract instead of recomputing it from canonical identity
- 97. `PodcastDownloadSnapshot.sourceArtworkUrl` still collapses show artwork and episode artwork into one field
- 105. Vault session regression tests still protect malformed explore rows that violate the current canonical import contract

### Library Favorites Downloads Search
- 17. Download UI and status ownership still key off URL
- 19. Favorite repository/API surface is still key-centric
- 27. Local search still links favorites and history by audio URL
- 29. Downloads page groups by display title instead of canonical podcast identity
- 30. Another dead single-field playback-session helper remains
- 31. Local search final merge still deduplicates remote results by URL and bare GUID instead of canonical episode identity
- 33. Download-service public inputs are still wider than the canonical remote episode contract
- 36. Search results page still assumes `guid` is globally unique in React list identity
- 37. Command palette suggestions still de-duplicate podcasts by display title text
- 38. Local search drops download-backed history rows instead of merging history state onto the matching download result
- 39. Downloaded canonical episodes are still physically URL-owned while local search exposes them as row-owned results
- 40. Download search actions degrade a canonical episode hit into a generic `/downloads` jump
- 46. Downloads repository public surface is still row-/URL-owned despite the domain type already carrying canonical download identity
- 49. Favorites created from downloads/history are still snapshot-owned, not canonical-episode-owned
- 50. Test coverage still actively codifies URL-owned playback/session/transcript identity
- 58. Local search view models still leak raw storage rows instead of exposing action-ready domain results
- 59. `LibraryRepository` write APIs still expose near-full persistence rows instead of narrow command-shaped inputs
- 60. Favorite creation still relies on a bespoke split input contract that forces mappers to synthesize placeholder values
- 76. Favorite persistence is still modeled as a partially optional snapshot even though the canonical add-favorite path now owns most of those fields
- 77. Episode-row download actions still source persisted episode description from presentation text instead of a canonical command payload
- 79. Canonical remote download initiation is still split across multiple overlapping command builders
- 82. `HistoryPage` locally overrides the playback-session row model and bypasses its shared description normalization contract
- 85. Favoriting a search episode still depends on a second podcast-detail lookup instead of the search result’s own snapshot
- 94. Subscribe and add-favorite idempotency still depend on store-local read-before-write orchestration instead of repository-owned commands
- 95. Favorite and subscription field normalization still has two competing owners: `exploreStore` and `dexieDb`
- 96. `Favorite.pubDate` is no longer a stable “published-at” field; some favorite builders synthesize it from download time or empty-string fallbacks
- 107. Local-search action tests still treat malformed favorite/history rows as valid fallback-playback inputs
- 110. History and favorites page tests still render against partial store rows that do not match the active persistence contracts
