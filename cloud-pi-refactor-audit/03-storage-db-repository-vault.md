# Storage DB Repository Vault

Dexie schema and indexes, repository boundaries, storage normalization, and vault/import-export ownership.

Findings in this file keep their original audit numbering.

Only the checklist-linked findings below are active execution scope for workers in the current pass. Other finding bodies in this file remain as reference history and should not be scheduled unless explicitly promoted later.

## Worker Checklist

- [x] Correctness pass C1: tighten canonical storage contracts for favorites, downloads, sessions, and persisted publication metadata. Findings: `3`, `12`, `14`, `15`, `57`, `66`
- [x] Correctness pass C2: rebuild DB/repository ownership around canonical episode identity instead of URL / key / raw table access. Findings: `18`, `22`, `44`, `61`, `62`, `63`, `65`
- [x] Correctness pass C3: fix current vault import/export and integrity boundaries so they preserve normalized current-format data only. Findings: `9`, `45`, `47`, `48`, `92`, `93`, `97`, `105`
- [x] Contract cleanup pass C4: finish type/boundary cleanup around storage-owned helper exports. Findings: `68`, `69`
- [x] Optional cleanup after C1-C4 are green: remove dead helper and thin-proxy test residue, and revisit the larger vault product-contract redesign. Findings: `28`, `64`, `67`
- [x] Exit criteria: storage and vault boundaries must not accept malformed canonical rows that runtime write paths would reject

## Reference Findings

### 3. Favorite / download / storage contract drift

Priority: must fix

- favorite-input builders still fabricate placeholder values such as `''`, `0`, or download time as publish time.
  - affected: `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
  - affected shape: `apps/cloud-ui/src/lib/db/types.ts`
- `PodcastDownload` drops canonical publish-time metadata, forcing downstream reconstruction from `downloadedAt`.
  - affected: `apps/cloud-ui/src/lib/downloadService.ts`
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
- `PodcastDownload.sourceEpisodeTitle` duplicates `TrackBase.name`.
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
  - affected consumers include downloads UI paths
- some storage docs and schema naming are already drifting from actual Dexie table names.

### 9. Storage model and vault contract

Priority: must fix

- vault import/export currently restores blob-dependent metadata rows without the blob payloads they depend on.
  - affected: `apps/cloud-ui/src/lib/vault.ts`
  - affected integrity gap: `apps/cloud-ui/src/lib/integrity.ts`
  - risk: imported rows can claim playable audio or active subtitles that do not exist
- remote browser-local dedupe is still URL-owned instead of canonical episode-owned.
  - affected identity/storage paths include `apps/cloud-ui/src/lib/dexieDb.ts`, `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`, `apps/cloud-ui/src/hooks/useSession.ts`, `apps/cloud-ui/src/hooks/useLocalSearch.ts`
- DB create/update APIs are wider than the intended persistence contract and still allow callers to set derived or internal fields directly.
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
  - affected repositories: downloads/library/session paths
- vault parse/integrity rules are weaker than actual DB normalization rules.
  - affected: `apps/cloud-ui/src/lib/vault.ts`
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`

Priority: should fix

- subtitle-state referential integrity is underspecified beyond the blob export/import problem.
  - examples: `activeSubtitleId`, `manualPinnedAt`, subtitle-content foreign keys

### 12. Persisted time fields are not modeled consistently

Priority: should fix

- browser-local entities still model the same semantic field, episode publish time, with inconsistent names and representations.
  - `Favorite`: `pubDate?: string`
  - `PlaybackSession`: `publishedAt?: number`
  - `PodcastDownload`: currently no canonical publish-time field
  - affected shapes: `apps/cloud-ui/src/lib/db/types.ts`
  - affected bridge logic: `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
- downstream bridge code is forced to convert or fabricate publish-time data across those mismatched shapes.
  - examples:
    - `downloadedAt` converted into fake favorite `pubDate`
    - numeric `publishedAt` converted back into string `pubDate`
  - risk: storage contract stays harder to reason about than the canonical PI source contract

### 14. Persistence normalization still allows semantic shape mutation

Priority: must fix

- `upsertPlaybackSession()` can rewrite an existing session across storage shapes instead of preserving entity class.
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - current behavior: it merges a fresh `PlaybackSessionCreateInput` over the existing row and then re-normalizes the result
  - risk: a row originally persisted as `local` can be rewritten into `explore`, or vice versa, under the same primary key
  - why this matters: session identity and lifecycle semantics differ across local and canonical-remote playback; allowing in-place shape mutation makes the persistence contract harder to trust

Priority: should fix

- persistence normalization is still asymmetric: some required identity fields are normalized strictly, but adjacent snapshot fields are left as raw caller input.
  - examples include `PodcastDownload.name`, `sourceDescription`, optional URLs, and some playback-session display fields
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - risk: DB rows become partly canonicalized and partly raw, which weakens “stored shape is normalized shape” as a contract

### 15. Public storage types still encode the wrong ownership model

Priority: should fix

- public DB type comments still explicitly define `sourceUrlNormalized` as the dedupe owner for podcast downloads.
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
  - risk: even after implementation fixes, the public type surface will continue steering future code toward URL-owned identity
- `PodcastDownloadCreateInput` is still an almost full-row type instead of a command-shaped input.
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
  - this reinforces caller-writable storage internals and makes future cleanup harder

### 18. Physical DB indexes still encode pre-refactor ownership

Priority: must fix

- Dexie table indexes still make URL/key ownership the physical fast path.
  - affected schema: `apps/cloud-ui/src/lib/dexieDb.ts`
  - current examples:
    - downloads/tracks: unique `&[sourceType+sourceUrlNormalized]`
    - playback sessions: `[audioUrl+lastPlayedAt]`
    - favorites: `&key`, plus secondary `audioUrl`
  - missing physical contract:
    - compound canonical episode indexes such as `[sourcePodcastItunesId+sourceEpisodeGuid]`
    - playback-session lookups keyed by canonical remote identity
    - favorite uniqueness/indexing directly on `podcastItunesId + episodeGuid`
  - risk: even if app-layer helpers are cleaned up, persistence performance paths and query ergonomics will keep dragging the code back toward URL/key-owned identity

### 22. Some public helper surfaces structurally prevent identity-first migration

Priority: should fix

- some public hook/helper APIs only accept `audioUrl` and therefore cannot be called in a canonical-identity-first way even when the caller has richer PI identity available.
  - examples:
    - `useEpisodeStatus(audioUrl)`
    - `findDownloadedTrack(normalizedUrl)`
    - `getStoredDownloadStatus(normalizedUrl)`
  - affected files:
    - `apps/cloud-ui/src/hooks/useEpisodeStatus.ts`
    - `apps/cloud-ui/src/lib/downloadService.ts`
  - risk: downstream callers are forced back into URL-owned lookups because the API signatures leave no path for canonical `podcastItunesId + episodeGuid`

Priority: cleanup

- player-side tests and helper names still preserve stale “feed episode” wording in places where the runtime contract is already PI-owned canonical remote playback.

### 28. Dead or stale DB helpers still encode old GUID semantics

Priority: cleanup

- `getPlaybackSessionsByShortGuid()` appears to be unused and still bakes in old “GUID prefix search” semantics on `episodeGuid` alone.
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - current behavior:
    - searches `episodeGuid` with `startsWithIgnoreCase`
    - assumes prefix matching on a single field is meaningful
  - problems:
    - no consumer was found in the current repo scan
    - it assumes `episodeGuid` is the right standalone search surface
    - it does not include `podcastItunesId`, so even if revived it would be cross-podcast ambiguous
  - risk: stale helper/API surface keeps obsolete identity assumptions alive and invites incorrect future reuse

### 44. Dexie still encodes remote episode ownership around URL, bare GUID, and derived key rather than canonical composite identity

Priority: should fix

- the current IndexedDB schema still lacks first-class composite indexes for canonical remote episode identity, so storage and repository code naturally fall back to URL-, GUID-, and derived-key-owned access patterns.
  - affected: `apps/cloud-ui/src/lib/dexieDb.ts`
  - current behavior:
    - `tracks` are unique on `[sourceType+sourceUrlNormalized]`
    - `playback_sessions` index `audioUrl`, bare `episodeGuid`, and `[audioUrl+lastPlayedAt]`
    - `favorites` index `&key`, `episodeGuid`, and `audioUrl`
    - there is no native index on `podcastItunesId + episodeGuid` for favorites, downloads, or playback sessions
  - problems:
    - canonical lookups have to be reconstructed through URL, synthetic key, or full scans instead of being a first-class storage primitive
    - row-/URL-owned APIs are reinforced by the schema shape underneath them
    - even when higher layers know the canonical identity, the persistence layer still does not model it directly
  - risk: identity drift remains structurally baked into the DB contract, making URL/key-centric behavior the path of least resistance for future code

### 45. Vault integrity/import still does not treat podcast downloads as canonical episode resources

Priority: should fix

- vault validation currently enforces canonical uniqueness for subscriptions and favorites, but not for downloaded podcast episodes or remote playback rows.
  - affected:
    - `apps/cloud-ui/src/lib/integrity.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
  - current behavior:
    - `verifyVaultIntegrity()` checks duplicate IDs, subscriptions by `podcastItunesId`, and favorites by `podcastItunesId::episodeGuid`
    - it does not reject multiple podcast download rows sharing the same `sourcePodcastItunesId + sourceEpisodeGuid`
    - it does not reject multiple remote playback sessions representing the same canonical episode either
    - `importVault()` then bulk-adds the incoming tracks/sessions as-is after schema/integrity pass
  - problems:
    - the backup/restore boundary can reintroduce canonical duplicates even if runtime write paths are later cleaned up
    - podcast downloads are still validated as generic track rows, not as canonical remote episode artifacts
    - the integrity rules are stricter for favorites than for downloaded copies of the same canonical episode
  - risk: vault restore can silently repopulate duplicated canonical downloads/session rows and resurrect identity drift from persisted data

### 47. Vault import bypasses podcast-download normalization and can persist raw track rows that never passed DB invariants

Priority: should fix

- `importVault()` normalizes subscriptions, favorites, and playback sessions before persistence, but podcast download rows are bulk-inserted raw after only a loose schema/integrity pass.
  - affected:
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/integrity.ts`
  - current behavior:
    - `podcastDownloadSchema` accepts plain `z.string()` values for `sourceUrlNormalized`, `sourcePodcastTitle`, `sourceEpisodeTitle`, `sourcePodcastItunesId`, and `sourceEpisodeGuid`
    - `importVault()` runs `normalizeSubscriptionRecord()`, `normalizeFavoriteRecord()`, and `normalizePlaybackSessionRecord()`
    - it then `bulkAdd()`s `vault.data.tracks` directly, without a corresponding download-track normalization step
    - `verifyVaultIntegrity()` does not compensate by validating canonical download fields beyond generic row shape / duplicate ID checks
  - problems:
    - imported podcast downloads can bypass the same `normalizeRequiredText()` and country/identity invariants enforced by `DB.addPodcastDownload()`
    - whitespace, empty-string, or otherwise non-normalized download identity fields can enter persistent storage through backup/restore
    - the vault boundary is stricter for favorites and sessions than for downloaded copies of the same canonical episode
  - risk: restore/import can seed malformed download rows that later break canonical lookup, dedupe, and route generation while still appearing schema-valid at import time

### 48. Vault regression coverage still does not exercise podcast-download normalization or canonical duplicate rejection

Priority: cleanup

- the current vault regression tests cover favorites/subscriptions/playback-session normalization, but there is no corresponding coverage for podcast download import invariants.
  - affected:
    - `apps/cloud-ui/src/lib/__tests__/vault.favorites.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/vault.sessions-null-track.test.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/lib/integrity.ts`
  - current behavior:
    - existing vault tests explicitly assert normalization for subscription/favorite/playback-session records
    - no vault test asserts that imported podcast downloads are trimmed/normalized like `DB.addPodcastDownload()` would
    - no vault test rejects duplicate `sourcePodcastItunesId + sourceEpisodeGuid` download rows
  - problems:
    - the asymmetry in Round 16.47 is currently unguarded by regression tests
    - URL-/row-owned download behavior can stay “green” simply because canonical download import invariants are never exercised
  - risk: future changes can keep reintroducing malformed or canonically duplicated download rows through backup/restore without any test catching the regression


### 57. Several canonical-identity helpers still advertise nullable inputs and silently downgrade contract violations into “not found” fallbacks

Priority: cleanup

- multiple helpers that conceptually operate on canonical `podcastItunesId + episodeGuid` identity still accept `null | undefined` inputs and quietly return `null` / `false` instead of requiring a strict identity at the type boundary.
  - affected:
    - `apps/cloud-ui/src/lib/db/favoriteIdentity.ts`
    - `apps/cloud-ui/src/store/exploreStore.ts`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/lib/routes/episodeResolver.ts`
  - current behavior:
    - `buildFavoriteKey(...)` accepts nullable `podcastItunesId` and `episodeGuid` and returns `null` when either is missing
    - `ExploreState.isFavorited(...)` accepts nullable canonical identity inputs and degrades to a falsy result
    - `buildLibraryEpisodeRoute(...)`, `trySearchEpisodeDirectRoute(...)`, and `buildSearchEpisodeRoute(...)` all accept nullable canonical ids and silently fall back to `null` or a show route
  - problems:
    - canonical identity loss is being treated as a routine branch instead of a boundary violation
    - callers are encouraged to pass partially known episode identity around instead of normalizing it earlier
    - when upstream contracts drift, the failure mode becomes “feature unavailable” rather than an obvious type/runtime contract break
  - risk: null/undefined sprawl survives inside the canonical PI identity path, making regressions harder to detect and letting malformed data quietly masquerade as ordinary fallback behavior


### 61. The library persistence layer still leaks raw Dexie tables and record-normalization helpers across abstraction boundaries

Priority: cleanup

- the repository layer is still reaching through the `DB` facade and directly importing low-level Dexie tables plus row-construction helpers from `dexieDb`.
  - affected:
    - `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
  - current behavior:
    - `LibraryRepository` imports `db`, `buildSubscriptionRecord`, and `normalizeSubscriptionRecord` directly from `dexieDb`
    - `bulkAddSubscriptionsIfMissing()` performs its own transaction against raw Dexie tables and then reconstructs stored rows with those helpers
    - `dexieDb` publicly exports persistence-specific normalizers/builders such as `buildSubscriptionRecord`, `normalizeSubscriptionRecord`, and `normalizeFavoriteRecord`
  - problems:
    - the abstraction boundary between repository and DB layer is porous; callers can choose between high-level methods and low-level table manipulation
    - row-construction rules are no longer clearly owned by one layer
    - persistence normalization helpers are becoming part of the app-facing toolkit rather than remaining storage internals
  - risk: future persistence refactors will have to chase hidden dependencies on raw Dexie shape/behavior, and storage invariants become easier to bypass or duplicate inconsistently

### 62. `PlaybackSessionUpdatePatch` still exposes identity and source-shape fields as routine mutable updates

Priority: should fix

- the public playback-session patch contract still allows callers to update canonical identity and source-specific metadata fields even though real runtime callers only use a much narrower subset.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/repositories/PlaybackRepository.ts`
  - current behavior:
    - `PlaybackSessionUpdatePatch` includes `audioUrl`, `localTrackId`, `artworkUrl`, `podcastTitle`, `episodeGuid`, `podcastItunesId`, `transcriptUrl`, and `countryAtSave`
    - `DB.updatePlaybackSession()` merges that patch over the full stored row and then re-normalizes it
    - the current non-test runtime callers only appear to use narrow operational fields such as `progress`, `durationSeconds`, `audioId`, `subtitleId`, `audioFilename`, and `subtitleFilename`
  - problems:
    - the public patch type advertises that identity/source fields are ordinary mutable session state
    - this keeps the door open for accidental in-place mutation of canonical remote metadata under a stable session id
    - the API contract is materially wider than demonstrated runtime needs
  - risk: even after callers become cleaner, the storage API continues to invite identity mutation and keeps persistence semantics harder to reason about than necessary

### 63. The repository layer is not acting as a consistent façade; most repositories still mix high-level `DB` methods with raw Dexie table access

Priority: cleanup

- the abstraction leak seen in `LibraryRepository` is actually systemic: repository modules across files/directories still interleave `DB` façade calls with direct `db` table reads/writes and ad hoc transactions.
  - affected:
    - `apps/cloud-ui/src/lib/repositories/FilesRepository.ts`
    - `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
    - `apps/cloud-ui/src/lib/repositories/PlaybackRepository.ts`
    - `apps/cloud-ui/src/lib/repositories/LibraryRepository.ts`
  - current behavior:
    - repositories commonly import both `DB` and raw `db` from `dexieDb`
    - `FilesRepository` and `DownloadsRepository` perform many direct `db.tracks` / `db.local_subtitles` reads and updates alongside façade calls
    - `PlaybackRepository.trackExists()` dynamically imports `db` and bypasses the façade entirely
    - transaction ownership is split inconsistently between repository code and `dexieDb`
  - problems:
    - the intended layering is no longer clear: repository methods are partly domain services, partly Dexie adapters, and partly direct table scripts
    - storage invariants can end up duplicated or bypassed depending on which path a repository method chooses
    - this makes it harder to reason about where normalization, identity enforcement, and transaction boundaries truly live
  - risk: future cleanup will have to chase storage behavior across multiple “semi-owner” layers, increasing the chance of inconsistent fixes and hidden regressions

### 64. The public vault import/export contract is still an internal Dexie metadata dump, not a product-level backup model

Priority: should fix

- `vault.ts` still exposes import/export data in terms of raw internal tables and persistence artifacts rather than a storage-agnostic backup contract.
  - affected: `apps/cloud-ui/src/lib/vault.ts`
  - current behavior:
    - exported payload keys mirror internal table names such as `tracks`, `local_subtitles`, and `playback_sessions`
    - schemas require internal persistence fields like `id`, `createdAt`, `addedAt`, `sourceType`, `audioFilename`, and `subtitleFilename`
    - `exportVault()` serializes those table rows almost directly, and `importVault()` bulk-loads them back after selective normalization
  - problems:
    - the backup boundary is owned by current IndexedDB layout rather than by stable user/domain concepts
    - internal persistence artifacts become part of the long-term external contract even when they are not meaningful product data
    - future storage refactors will have to preserve or translate a dump format that was never intentionally designed as a domain backup schema
  - risk: backup/import behavior stays tightly coupled to current local database implementation details, making storage cleanup and first-release simplification harder than it needs to be

### 65. Raw Dexie table access has leaked beyond repositories into utility/business modules

Priority: cleanup

- direct `db` access is no longer contained to the DB layer or repository layer; several utility/business modules now depend on concrete table layout as well.
  - affected:
    - `apps/cloud-ui/src/lib/downloadCapacity.ts`
    - `apps/cloud-ui/src/lib/player/playbackSource.ts`
    - `apps/cloud-ui/src/lib/db/credentialsRepository.ts`
    - `apps/cloud-ui/src/lib/files/ingest.ts`
    - `apps/cloud-ui/src/lib/repositories/SubtitleCandidateBuilder.ts`
  - current behavior:
    - `downloadCapacity` iterates `db.audioBlobs` directly to compute cache usage
    - `playbackSource` fetches `db.audioBlobs` directly after resolving a download row
    - `credentialsRepository` owns its own `db.credentials` transactions
    - `files/ingest` mixes `DB.transaction(...)` with raw `db` imports in the same module
    - `SubtitleCandidateBuilder` reads `db.local_subtitles` and `db.subtitles` directly
  - problems:
    - storage-layout knowledge is spreading into modules whose main responsibility is no longer “database access”
    - there is no single choke point for evolving table names, indexes, or normalization rules
    - architecture intent becomes harder to read because business helpers are also acting as mini-Dexie adapters
  - risk: future persistence cleanup will require repo-wide edits across unrelated modules, and database implementation details will keep resisting encapsulation


### 66. `FileTrack` and `PodcastDownload` update contracts are still full-row patch surfaces instead of narrow operations

Priority: should fix

- the same “patch is wider than real usage” problem seen in playback sessions also exists for file tracks and podcast downloads.
  - affected:
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/repositories/FilesRepository.ts`
    - `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
    - `apps/cloud-ui/src/store/filesStore.ts`
  - current behavior:
    - `DB.updateFileTrack(id, updates: Partial<FileTrack>)` accepts nearly any file-track field
    - `DB.updatePodcastDownload(id, updates: Partial<PodcastDownload>)` accepts nearly any download-row field
    - repository/store callers mostly use narrow operational updates such as `name`, `folderId`, or `activeSubtitleId`
    - the only intentionally broad helper appears to be `updateTrackPatch(...)`, which is already marked as a retention/integrity escape hatch
  - problems:
    - routine public update APIs still advertise that most stored fields are ordinary mutable app inputs
    - identity/snapshot fields on downloads and files are not clearly separated from operational fields
    - this keeps storage-shaped mutation as the default interface instead of pushing callers toward explicit operations
  - risk: accidental row mutation remains easy, and later cleanup of persistence invariants will keep encountering patch contracts that are much broader than product behavior actually needs

### 67. Tests are actively codifying thin-proxy repositories and Dexie-shaped vault contracts as the intended design

Priority: cleanup

- several tests now lock in the current leaky layering by asserting repository methods are mostly transparent pass-throughs and vault import/export is a DB-row round-trip.
  - affected:
    - `apps/cloud-ui/src/lib/repositories/__tests__/LibraryRepository.test.ts`
    - `apps/cloud-ui/src/lib/repositories/__tests__/FilesRepository.test.ts`
    - `apps/cloud-ui/src/lib/repositories/__tests__/PlaybackRepository.test.ts`
    - `apps/cloud-ui/src/store/__tests__/filesStore.repository-boundary.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/vault.favorites.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/vault.sessions-null-track.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/vault.credentials-exclusion.test.ts`
  - current behavior:
    - repository tests primarily assert direct delegation to `DB` methods
    - store boundary tests assert that writes pass through unchanged to repository methods
    - vault tests construct and assert payloads in terms of raw table rows and internal fields like `playback_sessions`, `audioFilename`, `subtitleFilename`, and `localTrackId`
  - problems:
    - the test suite is documenting current layering leaks as deliberate architecture rather than incidental implementation
    - future refactors toward command-shaped repositories or domain-shaped backup contracts will have to fight regression tests first
    - this increases the odds that internal DB shape continues to calcify simply because the tests are optimized for it
  - risk: test coverage becomes an inertia source for the very boundary cleanup the refactor still needs, raising the cost of every later architectural simplification


### 68. `db/types.ts` is still a mixed public-domain surface plus storage-only sentinels/helpers, and those storage details have leaked outward

Priority: cleanup

- the file claims to be a stable public type surface that does not expose implementation details, but it still exports IndexedDB-specific runtime sentinels and storage normalization helpers that are now consumed outside the DB layer.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/lib/integrity.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
    - `apps/cloud-ui/src/lib/retention.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/integrity.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/dexieDb.branch.test.ts`
  - current behavior:
    - `db/types.ts` publicly exports `TRACK_SOURCE`, `ROOT_FOLDER_ID`, `toStoredFolderId()`, and `fromStoredFolderId()`
    - `ROOT_FOLDER_ID` is an IndexedDB sentinel used to encode “root folder” as a stored string value
    - non-DB modules import those values directly, for example integrity checks compare against `ROOT_FOLDER_ID`, vault schemas hard-code `TRACK_SOURCE`, and repository/tests assert on these storage-level constants
    - the same file therefore mixes domain entities (`PlaybackSession`, `Favorite`, `Track`) with persistence-only representation helpers
  - problems:
    - the advertised boundary is misleading; callers are not consuming a pure domain/public contract, they are also consuming how IndexedDB happens to encode that contract today
    - storage representation details are becoming shared application vocabulary instead of remaining owned by `dexieDb` or a narrow persistence adapter
    - future changes to folder storage encoding or track-source persistence shape will require repo-wide edits across utility, repository, vault, and test code because those details are no longer encapsulated
  - risk: first-release cleanup will remain harder than necessary because persistence representation choices are being promoted to semi-public contracts, increasing coupling between domain code and current Dexie implementation

### 69. `dexieDb.ts` is still serving as both the runtime persistence gateway and an app-wide type barrel

Priority: cleanup

- many modules that do not perform database operations still import plain entity types from `dexieDb.ts`, which keeps the persistence implementation module on the type dependency path for unrelated player/file/business helpers.
  - affected:
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/player/surfacePolicy.ts`
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
    - `apps/cloud-ui/src/lib/files/sortFolders.ts`
    - `apps/cloud-ui/src/lib/player/remotePlayback.ts`
    - `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
    - `apps/cloud-ui/src/lib/player/playerSessionRestore.ts`
  - current behavior:
    - `dexieDb.ts` re-exports large sets of entity types from `db/types.ts`
    - pure type consumers such as `surfacePolicy.ts` and `sortFolders.ts` import `Favorite`, `PlaybackSession`, or `FileFolder` from `../dexieDb` even though they do not need `DB`, `db`, transactions, or table names
    - this makes the persistence implementation module a de facto canonical import path for both runtime storage operations and passive type consumption
  - problems:
    - architecture intent becomes harder to read because “I import from `dexieDb`” no longer tells you whether a module truly depends on persistence behavior
    - storage-module ownership keeps expanding even when consumers only need shared domain shapes
    - future effort to narrow or replace the Dexie layer will have to untangle many unnecessary type-only edges first
  - risk: the codebase keeps reinforcing `dexieDb.ts` as a central kitchen-sink module, making boundary cleanup and storage isolation more expensive than necessary


### 92. Metadata-only vault imports are still automatically rewritten into corrupted tracks by startup integrity maintenance

Priority: should fix

- the vault contract explicitly exports metadata without audio/subtitle blobs, but app initialization immediately runs integrity maintenance that mutates those imported rows into `isCorrupted` tracks.
  - affected:
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/lib/retention.ts`
    - `apps/cloud-ui/src/hooks/useAppInitialization.ts`
    - `apps/cloud-ui/src/lib/db/types.ts`
  - current behavior:
    - `exportVault()` excludes `audioBlobs` and subtitle content by design
    - `importVault()` restores `tracks`, `local_subtitles`, and `playback_sessions` metadata rows anyway
    - `useAppInitialization()` always schedules `runIntegrityCheck()` on mount
    - `runIntegrityCheck()` iterates all tracks and marks any row whose `audioId` blob is missing as `isCorrupted = true`
  - problems:
    - metadata-only restore is not just “incomplete until blobs exist”; the app deterministically rewrites imported rows on next startup
    - a nominal backup/import boundary is therefore not even metadata-stable under normal app lifecycle
    - the integrity pass is effectively compensating for a vault contract decision, but that coupling is implicit and unmodeled
  - risk: import/export behavior remains surprising and self-mutating, making it harder to reason about whether vault restore is a backup, a metadata migration artifact, or a one-way diagnostic snapshot

### 93. Vault schema still treats derived `favorite.key` as an external import contract instead of recomputing it from canonical identity

Priority: cleanup

- favorites in the vault payload still have to carry an exact precomputed `key`, even though that value is derived from canonical identity and later normalized again during import.
  - affected:
    - `apps/cloud-ui/src/lib/vault.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
    - `apps/cloud-ui/src/lib/__tests__/vault.favorites.test.ts`
  - current behavior:
    - `favoriteSchema` requires `key: z.string()`
    - the schema also refines that `favorite.key === buildFavoriteKey(favorite.podcastItunesId, favorite.episodeGuid)`
    - after parse, `importVault()` still calls `normalizeFavoriteRecord(...)`, which recomputes the key from `podcastItunesId + episodeGuid`
  - problems:
    - a derived storage artifact is still being enforced as part of the external vault contract instead of being treated as import-time reconstruction
    - the import boundary is validating internal storage layout details before normalization rather than accepting canonical identity and deriving internal fields
    - tests continue to model this derived-key requirement as normal vault behavior
  - risk: the backup/import contract stays more tightly coupled to current Dexie favorite-row shape than necessary, and future cleanup of favorite persistence will have to preserve or translate an internal field that should not need to cross the boundary at all


### 97. `PodcastDownloadSnapshot.sourceArtworkUrl` still collapses show artwork and episode artwork into one field, so downstream consumers cannot preserve the two-layer artwork contract

Priority: cleanup

- the download snapshot model still stores only one artwork URL for a downloaded episode, even though the rest of the app has already moved toward a distinct “podcast artwork” vs “episode artwork” shape.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/lib/downloadService.ts`
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
  - current behavior:
    - `PodcastDownloadSnapshot` defines one `sourceArtworkUrl` field and documents it as `Episode/podcast artwork URL`
    - `persistAudioBlobAsDownload()` stores one `artworkUrl` into that field
    - `mapPodcastDownloadToFavoriteInputs()` reuses the same value both as favorite podcast artwork and favorite episode artwork input
    - row-model and download UI consumers then use that one field for both primary artwork and fallback artwork roles
  - problems:
    - the storage contract no longer tells callers whether the saved image is show-level artwork or episode-level artwork
    - favorite/download/playback consumers are forced to guess fallback semantics because the original distinction was erased at persistence time
    - any future UI that wants episode art with podcast-art fallback cannot reconstruct the two-layer contract from downloaded data
  - risk: downloaded episodes and favorites derived from them will keep drifting from the canonical PI artwork model, and future detail-page or library polish will be constrained by this flattened snapshot shape


### 105. Vault session regression tests still protect malformed explore rows that violate the current canonical import contract

Priority: cleanup

- one vault regression suite is still asserting successful round-trip behavior for an `explore` playback-session row that does not satisfy the current canonical vault schema.
  - affected:
    - `apps/cloud-ui/src/lib/__tests__/vault.sessions-null-track.test.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
  - current behavior:
    - `vault.sessions-null-track.test.ts` writes directly to `db.playback_sessions` with `source: 'explore'`, `audioUrl`, `countryAtSave`, and `localTrackId: null`
    - that fixture omits canonical required explore-session fields such as `artworkUrl`, `podcastTitle`, `episodeGuid`, and `podcastItunesId`
    - the test title and assertions still describe that malformed row as something that should “successfully export and import”
    - meanwhile `vault.ts` defines `explorePlaybackSessionSchema` as requiring those omitted canonical fields and `normalizePlaybackSessionRecord(...)` also treats them as required
  - problems:
    - the regression suite is preserving a state that the declared vault import contract explicitly rejects
    - test intent and production contract are now pointing in opposite directions, so future cleanup has to choose which one is authoritative
    - this also blurs the audit signal around explore-session strictness because malformed session compatibility is being framed as desirable regression coverage
  - risk: malformed remote-session compatibility can survive or be reintroduced simply because an old test still treats it as a success case, even though the PI-first architecture wants vault/session boundaries to fail closed
