# Player And Playback

Player state, playback identity, session restore, transcript/playback metadata boundaries, and replay orchestration.

Findings in this file keep their original audit numbering.

Only the checklist-linked findings below are active execution scope for workers in the current pass. Other finding bodies in this file remain as reference history and should not be scheduled unless explicitly promoted later.

## Worker Checklist

- [x] Correctness pass B1: move remote playback identity ownership from URL to canonical episode identity. Findings: `11`, `20`, `21`, `24`, `53`, `54`, `55`
- [x] Correctness pass B2: harden `countryAtSave` as source-owned required metadata instead of mutable fallback state. Findings: `32`, `35`, `42`, `43`
- [x] Correctness pass B3: finish session restore and stale-async coordination around the canonical playback identity. Findings: `41`, `98`, `99`, `100`, `101`, `102`
- [x] Contract cleanup pass B4: separate local metadata vs canonical remote metadata through player/session boundaries. Findings: `4`, `23`, `34`, `51`, `52`, `70`, `71`, `72`, `73`
- [x] Verification pass B5: update tests still codifying old playback identity or low-level coordination tokens. Findings: `103`
- [x] Optional cleanup after B1-B5 are green: lower-priority export / abstraction cleanup. Findings: `78`, `80`, `81`, `83`
- [x] Exit criteria: no player-side side-channel should treat `audioUrl` as canonical remote ownership when `podcastItunesId + guid` is available

## Reference Findings

### 4. Player / session / remote metadata boundary cleanup

Priority: should fix

- remote playback still treats `countryAtSave` as an out-of-band patch instead of final canonical remote payload state.
  - affected: `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
  - affected: `apps/cloud-ui/src/lib/player/remotePlayback.ts`
- remote download flow sometimes erases precise remote typing by falling back to a generic helper.
  - affected: `apps/cloud-ui/src/lib/player/remotePlayback.ts`
  - related helper: `apps/cloud-ui/src/lib/downloadService.ts`
- session builders still contain residue for an intermediate metadata state that should no longer exist.
  - affected: `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`

### 5. Playback-session storage residue

Priority: needs deeper validation

- `PlaybackSession` still appears to persist file-era fields that Cloud runtime may no longer consume.
  - candidate fields: `audioFilename`, `subtitleFilename`
  - affected: `apps/cloud-ui/src/lib/db/types.ts`
  - related: `apps/cloud-ui/src/lib/vault.ts`

This item needs second-pass confirmation before implementation because it touches persistence shape.

### 11. Canonical identity still loses to URL during restore flows

Priority: must fix

- remote session restore still tries to resolve a local download by normalized audio URL only, even when the persisted session already carries canonical `podcastItunesId` and `episodeGuid`.
  - affected: `apps/cloud-ui/src/store/playerStore.ts`
  - related lookup: `apps/cloud-ui/src/lib/repositories/DownloadsRepository.ts`
  - risk: restore can miss the correct local download or collide with the wrong one when audio URLs change or are reused
- local search result merging still gives URL identity priority over canonical episode identity for favorites and remote history rows.
  - affected: `apps/cloud-ui/src/hooks/useLocalSearch.ts`
  - risk: different canonical episodes that share or rotate URLs can collapse into one result bucket

### 20. Transcript and ASR side-channel identity remains URL-owned for remote playback

Priority: should fix

- remote transcript cache, transcript import/export for remote playback, and online ASR triggering still use normalized audio URL as the persistence identity.
  - affected: `apps/cloud-ui/src/lib/remoteTranscript.ts`
  - affected: `apps/cloud-ui/src/lib/player/playbackExport.ts`
  - current behavior:
    - remote transcript cache rows are keyed by normalized URL
    - imported transcript persistence for remote playback uses `originalAudioUrl || audioUrl`
    - online ASR for current playback builds its track key from the resolved audio URL
  - risk: transcript continuity and remote-ASR reuse break when the same canonical episode identity gets a different audio URL, and the side-channel continues to model URL as the real owner

Priority: cleanup

- some remaining comments/tests still describe these side-channel paths in terms that imply URL identity is the intended stable owner, which no longer matches the PI-first canonical route model.

### 21. Core playback identity for remote content is still URL-owned

Priority: must fix

- the player’s core remote playback identity key is still derived only from normalized remote audio URL.
  - affected: `apps/cloud-ui/src/lib/player/playbackIdentity.ts`
  - current behavior:
    - local playback identity: `local-track:${localTrackId}`
    - remote playback identity: `remote-playback:${normalizedAudioUrl}`
  - missing from the identity foundation:
    - `podcastItunesId`
    - `episodeGuid`
    - optionally `countryAtSave` if route-context authority is intended to participate
  - risk: even if storage, routes, downloads, and favorites move to canonical episode identity, player-owned event correlation and side-channel continuity will still treat URL as the real remote owner

- multiple player-side features inherit that URL-owned remote identity from the foundation layer.
  - affected consumers include:
    - transcript imported event correlation
    - playback export/import flow
    - remote transcript cache participation
    - remote playback session correlation
  - affected files include:
    - `apps/cloud-ui/src/components/AppShell/PlayerSurfaceFrame.tsx`
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/lib/remoteTranscript.ts`
    - `apps/cloud-ui/src/hooks/useSession.ts`

### 23. `PlaybackSession` is carrying mixed domain semantics in the same fields

Priority: should fix

- the same `PlaybackSession` display fields mean different things depending on `source`, and consumers already need repair logic to cope with that.
  - affected producer: `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
  - current examples:
    - remote/canonical session: `podcastTitle` means show title, `description` means episode description
    - local/file session: `podcastTitle` is reused for artist, `description` is reused for album
  - affected consumers:
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
  - evidence:
    - history rendering needs source-specific patching
    - row model treats the same fields as podcast episode metadata unless caller intervenes
  - risk: shared session shape stops being self-explanatory, and every new consumer has to rediscover which fields are “real podcast metadata” vs “local file fallback metadata”

### 24. Player-side auxiliary state still keys off source URL churn rather than canonical playback identity

Priority: should fix

- several player-side UI/support systems still derive their reset keys from `audioUrl` / `originalAudioUrl` instead of a canonical playback identity object.
  - affected examples:
    - foreground prefetch scheduler: `apps/cloud-ui/src/hooks/useForegroundAudioPrefetch.ts`
    - reading/transcript lookup key and download progress key: `apps/cloud-ui/src/components/AppShell/ReadingContent.tsx`
    - mini-player export availability context key: `apps/cloud-ui/src/components/AppShell/MiniPlayerMoreMenu.tsx`
  - risk: when the same canonical episode switches between direct URL, proxy URL, blob URL, or restored local source, these auxiliary systems can reset or fork state as if the user changed tracks

Priority: cleanup

- some comments in player/session-related tests still talk about “explore session” or “feed episode” even where the runtime contract has already become canonical remote PI playback or local-file playback.

### 32. Remote playback helper quietly weakens required `countryAtSave` back into an empty-string fallback

Priority: should fix

- the remote playback entry path still converts missing `countryAtSave` into `''` right before building canonical remote metadata.
  - affected: `apps/cloud-ui/src/lib/player/remotePlayback.ts`
  - current behavior:
    - `playRemotePayload()` passes `countryAtSave: patch?.countryAtSave ?? ''`
    - `buildCanonicalRemotePlaybackMetadata()` then has to re-validate and reject that invalid state at runtime
  - problems:
    - a declared required field is downgraded back into a pseudo-optional field at a central helper boundary
    - callers lose a crisp contract and instead get late failure behavior
    - this is the same class of looseness the PI refactor has been trying to remove elsewhere
  - risk: remote playback remains dependent on “validate after weakening” instead of carrying a strict canonical metadata contract end-to-end

### 34. Player metadata still allows country-less hybrid remote identity objects

Priority: should fix

- the player-side metadata model still permits local metadata objects to carry remote-style canonical fields without the full remote contract.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
  - current behavior:
    - `LocalEpisodeMetadata` inherits optional `showTitle`, `artworkUrl`, `episodeGuid`, and `podcastItunesId` from `EpisodeMetadataBase`
    - `mapPlaybackSessionToEpisodeMetadata()` emits those fields for local sessions when present, but without `countryAtSave`
    - `buildManagedPlaybackSessionCreateInput()` can persist that hybrid metadata shape back into local playback sessions
  - problems:
    - “local metadata” and “canonical remote metadata” are still not structurally separated all the way down
    - callers must keep rediscovering via runtime guards whether a metadata object is navigable/canonical or just a partial carry-over
  - risk: hybrid metadata states survive the refactor and keep forcing downstream code to defend against half-remote, half-local objects instead of working against clean type layers

### 35. `countryAtSave` is still being reconstructed from mutable global state instead of preserved as a source snapshot

Priority: should fix

- several playback/navigation/favorite entry points still derive `countryAtSave` from the current global explore country instead of treating it as source-owned snapshot data.
  - affected:
    - `apps/cloud-ui/src/hooks/useEpisodePlayback.ts`
    - `apps/cloud-ui/src/components/GlobalSearch/SearchEpisodeItem.tsx`
    - `apps/cloud-ui/src/routeComponents/SearchPage.tsx`
    - `apps/cloud-ui/src/components/GlobalSearch/CommandPalette.tsx`
    - `apps/cloud-ui/src/components/EpisodeRow/EpisodeRow.tsx`
  - current behavior:
    - `useEpisodePlayback()` falls back to `useExploreStore.getState().country` when `countryAtSave` is omitted
    - search-page episode actions explicitly pass `globalCountry`
    - search episode favorite creation resolves podcast detail with `globalCountry`
    - global search routing also builds show/episode routes from `globalCountry`
    - generic episode rows fall back from manual/route country to `globalCountry`
  - problems:
    - a persisted remote record can end up bound to the user’s current browsing region instead of the region/snapshot from which the entity was produced
    - changing country between render, click, playback, favorite, and later restore can mutate the saved route context for the same canonical episode
    - this weakens the meaning of `countryAtSave` back into “whatever the app is set to now”
  - risk: route generation, favorite/session persistence, and later detail restoration can drift away from the originating discovery context even when the canonical episode identity itself is unchanged

### 41. Local sessions that retain a network identity can still be replayed through the remote-history path

Priority: should fix

- the history and local-search playback branches still prefer `session.audioUrl` over `session.source`, so a local session carrying both `audioId` and `audioUrl` can bypass blob/subtitle restore and be treated as remote playback.
  - affected:
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
  - current behavior:
    - local session creation can persist `audioUrl` alongside `source: 'local'`
    - history playback checks `if (session.audioUrl)` before `session.source === 'local' && session.audioId`
    - local search actions do the same
    - `mapSessionToPlaybackPayload()` accepts any session with `audioUrl`, only enforcing canonical-remote validation for `source === 'explore'`
  - problems:
    - a local/file-origin session with preserved remote reference can skip `loadAudioBlob()` and subtitle restoration
    - the replay path is chosen by transport field presence instead of the domain source type
    - local and remote semantics remain mixed at runtime, not just in types
  - risk: history/search playback can silently take the wrong execution path, losing local restore guarantees and behaving inconsistently for the same persisted session shape

### 42. Remote session restore still rebuilds “canonical” player metadata from malformed explore rows without validating required PI fields

Priority: should fix

- the restore path still trusts any `source === 'explore'` row with `audioUrl` and reconstructs `CanonicalRemoteEpisodeMetadata` directly from stored fields, even when required canonical metadata may be missing.
  - affected:
    - `apps/cloud-ui/src/lib/player/playerSessionRestore.ts`
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/vault.ts`
  - current behavior:
    - `buildRestoredRemoteSessionState()` directly assigns `podcastTitle`, `artworkUrl`, `episodeGuid`, and `podcastItunesId` into a `CanonicalRemoteEpisodeMetadata` object
    - `playerStore.restoreSession()` calls that path for any explore row that merely has `audioUrl`
    - the vault schema says explore playback sessions require those fields, but malformed rows are still treated as viable runtime input elsewhere
  - problems:
    - restore is reconstructing canonical metadata by assertion/cast, not by validation
    - legacy or malformed explore rows can repopulate player state with non-canonical remote metadata
    - the runtime restore boundary is looser than the declared persistence contract
  - risk: the app can resurrect invalid remote session state after import/restore and then rely on downstream guards to discover the corruption too late

### 43. History affordances are still enabled by a partial remote-identity guard rather than the full canonical contract

Priority: should fix

- `isNavigableExplorePlaybackSession()` only checks `countryAtSave`, `podcastItunesId`, and `episodeGuid`, but downstream favorite/download actions also require show/artwork completeness.
  - affected:
    - `apps/cloud-ui/src/lib/db/types.ts`
    - `apps/cloud-ui/src/components/EpisodeRow/episodeRowModel.ts`
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
    - `apps/cloud-ui/src/lib/db/favoriteMappers.ts`
    - `apps/cloud-ui/src/store/exploreStore.ts`
    - `apps/cloud-ui/src/lib/downloadService.ts`
  - current behavior:
    - history rows use `isNavigableExplorePlaybackSession()` to decide episode route / favorite availability
    - the guard does not require `podcastTitle` or `artworkUrl`
    - favorite and download creation paths later reject missing show/artwork data
  - problems:
    - malformed explore sessions can still render valid-looking affordances
    - the user can be offered favorite/download actions that later no-op or fail closed
    - UI eligibility and write-path requirements are still checking different contracts
  - risk: history surfaces continue to advertise actions for incomplete remote session rows, creating contract drift between what the UI permits and what persistence layers actually accept


### 51. Player download affordances are still URL-status-owned while the actual action requires canonical remote metadata

Priority: should fix

- the player-side download button/badge still decide visibility and status from a URL-owned lookup, but the actual download mutation only proceeds for canonical remote metadata.
  - affected:
    - `apps/cloud-ui/src/components/Player/PlayerDownloadAction.tsx`
    - `apps/cloud-ui/src/hooks/useEpisodeStatus.ts`
  - current behavior:
    - `PlayerDownloadAction` and `DownloadedBadge` derive `sourceIdentityUrl` from `originalAudioUrl || audioUrl`
    - both call `useEpisodeStatus(sourceIdentityUrl)`, which only looks up downloads by normalized URL
    - `PlayerDownloadAction.handleAction()` later hard-requires `isCanonicalRemoteEpisodeMetadata(episodeMetadata)` before it can actually download
  - problems:
    - the UI can expose download/downloaded state for playback contexts that are URL-identifiable but not canonically actionable
    - display state and mutation eligibility are still driven by two different contracts
    - the player surface continues to treat transport URL as the first-class status key even after canonical episode identity exists
  - risk: player affordances can look valid but no-op on click, and download state can drift from the true canonical actionability of the current episode

### 52. `ReadingContent` still splits one playback context across multiple incompatible side-channel key domains

Priority: should fix

- the transcript/reading surface still tracks adjacent side-channel state for the same playback object using different key strategies: normalized URL, raw URL, and `localTrackId::rawUrl`.
  - affected: `apps/cloud-ui/src/components/AppShell/ReadingContent.tsx`
  - current behavior:
    - download progress reads from `progressMap[normalizePodcastAudioUrl(targetAudioUrl)]`
    - stored transcript presence uses `storedTranscriptSourceLookupKey = ${localTrackId}::${targetAudioUrl}`
    - transcript-loading timeout uses a separate raw-string key built from `loadRequestId`, `targetAudioUrl`, transcript URL, and local track id
    - transcript lookup itself calls `hasStoredTranscriptSource(targetAudioUrl, localTrackId)`
  - problems:
    - one side-channel uses normalized URL while others use raw `targetAudioUrl`
    - local track id sometimes participates in identity and sometimes does not
    - the same canonical episode can fork or reset auxiliary reading state when URL form changes even if the episode identity did not
  - risk: transcript availability, loading timeout, and progress/download state can desynchronize inside the same screen because they are not all anchored to one canonical playback identity


### 53. Player core track equality and session reset are still URL-owned instead of canonical-identity-owned

Priority: should fix

- the central player store still decides whether a newly loaded item is “the same track” by comparing URL snapshots, even though the app already has a dedicated playback identity helper and canonical PI episode identity fields.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/player/playbackIdentity.ts`
  - current behavior:
    - `setAudioUrl()` derives `identityUrl = metadata?.originalAudioUrl || normalizedUrl`
    - it compares that value with `state.episodeMetadata?.originalAudioUrl || state.audioUrl`
    - `isSameTrack`, `isSameTrackButDifferentUrl`, and `shouldResetSession` all flow from that URL equality check
    - the store does not use `buildPlaybackIdentityKey()` or canonical `podcastItunesId + episodeGuid` to decide player identity boundaries
  - problems:
    - the app already defines a shared playback-identity layer, but the most central playback state transition still bypasses it
    - track equality, transcript reset, and session reset are all coupled to transport/source URL ownership
    - canonical remote identity fields exist on metadata, but they are not the authority for the store path that most needs a single authority
  - risk: source churn and identity churn are still partially conflated at the store boundary, so future fixes in playback/session/export code can keep drifting unless this equality decision is centralized

### 54. Remote playback session reuse is still resolved by URL lookup at runtime

Priority: should fix

- remote podcast playback still reattaches to prior sessions through `findLastSessionByUrl(...)`, even though the session rows already persist canonical episode identity fields.
  - affected:
    - `apps/cloud-ui/src/hooks/useSession.ts`
    - `apps/cloud-ui/src/lib/dexieDb.ts`
  - current behavior:
    - `useSession()` resolves `normalizedAudioUrl` from `resolveSessionAudioSnapshot(...)`
    - when there is no `localTrackId`, it calls `DB.findLastSessionByUrl(normalizedAudioUrl)`
    - playback session rows created for canonical remote episodes already persist `podcastItunesId` and `episodeGuid`
    - there is no corresponding canonical runtime lookup by `podcastItunesId + episodeGuid`
  - problems:
    - persistence already carries canonical episode identity, but the runtime reuse path ignores it
    - the same canonical episode can miss session reuse if its effective URL changes
    - different playback contexts can still collide if URL ownership remains the only remote lookup boundary
  - risk: remote progress restore/reuse continues to depend on transport continuity rather than the canonical PI episode contract the refactor is moving toward

### 55. Restore dedupe in `GlobalAudioController` uses a third playback identity shape that diverges from the session hook

Priority: cleanup

- the top-level audio controller adds its own restore-once key based on `sessionId::audioUrl`, which is not the same identity shape used by the session hook or the shared playback-identity helper.
  - affected:
    - `apps/cloud-ui/src/components/AppShell/GlobalAudioController.tsx`
    - `apps/cloud-ui/src/hooks/useSession.ts`
    - `apps/cloud-ui/src/lib/player/playbackIdentity.ts`
  - current behavior:
    - `GlobalAudioController` gates `restoreProgress()` with `requestKey = ${sessionId}::${audioUrl}`
    - `useSession.restoreProgress()` internally dedupes with `resolveSessionAudioSnapshot(state.audioUrl, state.episodeMetadata)`
    - the shared identity helper separately defines `local-track:...` / `remote-playback:...` playback keys
  - problems:
    - one restore path is now guarded by three subtly different identity shapes
    - the controller-level dedupe key is raw-`audioUrl`-owned, while the session hook prefers `originalAudioUrl`
    - this increases the maintenance burden whenever blob/proxy/original-source behavior changes
  - risk: restore-once behavior can become inconsistent or redundant across source-form changes because the outer and inner dedupe layers are not keyed by the same authority


### 70. Player-side metadata types are only partially separated; many critical entry points still accept the catch-all `EpisodeMetadata` union and then recover intent with runtime guards

Priority: should fix

- the code now has separate names for local metadata and canonical remote metadata, but the function signatures across player/download/transcript flows still often take the broad `EpisodeMetadata` union and sort it out dynamically inside the function body.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
    - `apps/cloud-ui/src/lib/player/remotePlayback.ts`
    - `apps/cloud-ui/src/lib/player/episodeMetadata.ts`
    - `apps/cloud-ui/src/lib/remoteTranscript.ts`
  - current behavior:
    - `playerStore.ts` defines `EpisodeMetadata = LocalEpisodeMetadata | CanonicalRemoteEpisodeMetadata`
    - critical APIs such as `setAudioUrl(...)`, `setEpisodeMetadata(...)`, `buildManagedPlaybackSessionCreateInput(...)`, and several remote playback helpers still receive `EpisodeMetadata`
    - those functions then branch with helpers like `isCanonicalRemoteEpisodeMetadata(...)` or by probing individual fields such as `countryAtSave`, `episodeGuid`, and `podcastItunesId`
    - remote-specific enrichment is often bolted on by decorators (`originalAudioUrl`, `playbackRequestMode`, country normalization) rather than expressed in the input contract up front
  - problems:
    - the type system is not fully carrying the semantic distinction the refactor intended; callers can still pass a broad mixed-shape payload into remote-sensitive code paths
    - more logic than necessary is spent on defensive narrowing and silent downgrading/upgrading inside helpers
    - the boundary between “local optional snapshot metadata” and “remote canonical metadata that is allowed to drive navigation/download/session restore” remains implicit instead of signature-enforced
  - risk: future playback/session/download changes will keep reintroducing soft fallback behavior because the main APIs still invite mixed metadata inputs, increasing the chance of subtle identity or state regressions

### 71. Player metadata snapshots are still conflated with playback transport/control context

Priority: should fix

- `EpisodeMetadataBase` currently carries fields that are not really episode metadata at all, which means durable content snapshot fields and request-scoped playback-control fields are traveling together as one object.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/player/remotePlayback.ts`
    - `apps/cloud-ui/src/lib/player/playbackIdentity.ts`
    - `apps/cloud-ui/src/lib/remoteTranscript.ts`
    - `apps/cloud-ui/src/lib/player/playerSessionRestore.ts`
  - current behavior:
    - `EpisodeMetadataBase` includes `originalAudioUrl` and `playbackRequestMode`
    - `remotePlayback.ts` decorates metadata objects by injecting those fields before playback starts
    - identity resolution, transcript logic, and export logic later read them back from `episodeMetadata`
    - this means the object named “metadata” doubles as both content snapshot and runtime playback envelope
  - problems:
    - the naming no longer matches the responsibility; callers cannot tell which fields are durable episode facts versus ephemeral player control state
    - canonical metadata types inherit runtime-only fields through the shared base, even though those fields are orthogonal to canonical content identity
    - downstream helpers become coupled to the accident that playback context was smuggled inside a metadata bag
  - risk: future cleanup of identity/session/export behavior will remain harder than necessary because playback control flow and content snapshot flow are not cleanly separable at the type level

### 72. `playerStore.setAudioUrl()` has become an overloaded catch-all mutation API for loading state, identity switching, metadata injection, blob cleanup, and session reset

Priority: should fix

- one store action is currently doing too many logically distinct jobs, and many playback entry points depend on its implicit branching behavior.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/lib/player/remotePlayback.ts`
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/components/AppShell/ReadingContent.tsx`
  - current behavior:
    - `setAudioUrl(url, title, coverArt, metadata, isPlayingOverride?)` accepts a very broad argument bag with several optional positional parameters
    - inside the store it decides whether the call means “same track metadata refresh”, “blob swap for same logical track”, or “brand new track”
    - the same method also revokes blob URLs, resets transcript state, increments `loadRequestId`, clears `sessionId/localTrackId/progress`, applies duration hints from metadata, and toggles loading/playback flags
    - callers use it for very different intents: remote preloading with `null` url, local download playback, history replay, transcript-mode mutation side effects, and ordinary source changes
  - problems:
    - the API surface does not communicate intent clearly; behavior depends on subtle combinations of `url`, `metadata.originalAudioUrl`, current store state, and the optional `isPlayingOverride`
    - playback identity management and presentational metadata updates are entangled inside one mutation path
    - the positional signature makes misuse easier and keeps call sites noisy and harder to audit
  - risk: future changes to playback identity/session semantics will remain fragile because too many workflows rely on implicit `setAudioUrl()` side effects instead of explicit command-shaped actions

### 73. Playback rehydration and resume assembly logic is still duplicated across multiple entry points instead of being owned by one playback command path

Priority: should fix

- local and history playback restoration are assembled in several places with very similar responsibilities, but not through one authoritative orchestration layer.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/hooks/useFilePlayback.ts`
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
    - `apps/cloud-ui/src/lib/player/playerSessionRestore.ts`
  - current behavior:
    - `playerStore.restoreSession()` restores last playback session, resolves blobs, rehydrates metadata, resets transcript/player surface state, and chooses local-vs-remote fallback behavior
    - `HistoryPage` has its own local-session replay path that loads blobs, maps playback-session metadata, restores subtitle cues, and reactivates the player
    - `localSearchActions` repeats similar local-history restore work with its own error handling and navigation fallback
    - `useFilePlayback` separately assembles local blob playback, subtitle resolution, metadata injection, and session creation
    - `DownloadsPage` independently reconstructs downloaded-track playback plus resume progress behavior
  - problems:
    - the same conceptual workflow is split across page/store/hook modules with slightly different helpers, error branches, and state side effects
    - cleanup of metadata boundaries or playback identity rules will require synchronized edits across several semi-duplicate call paths
    - it is harder to establish one authoritative contract for “what constitutes restored playback state” when multiple modules can assemble it
  - risk: subtle drift between playback entry points will continue to accumulate, increasing the chance that one path keeps stale identity or transcript behavior after another path is cleaned up

### 78. Download-page playback still drops persisted episode description when reconstructing canonical playback metadata

Priority: should fix

- downloaded tracks already persist a canonical episode description, but the downloads-page playback entry point does not carry that description back into player/session metadata.
  - affected:
    - `apps/cloud-ui/src/routeComponents/DownloadsPage.tsx`
    - `apps/cloud-ui/src/lib/player/playbackSessionFactory.ts`
    - `apps/cloud-ui/src/hooks/useSession.ts`
  - current behavior:
    - `PodcastDownload.sourceDescription` is persisted when a download is created
    - `DownloadsPage.buildPlaybackMetadata(track)` reconstructs playback metadata from the download row, but omits `description`
    - that metadata object is then passed into `setAudioUrl(...)` / remote-stream playback and later into session creation through `buildManagedPlaybackSessionCreateInput(...)`
    - as a result, a playback session started from the downloads page can lose episode description even though the underlying download row already had it
  - problems:
    - a canonical snapshot field that has already been persisted is silently discarded at one of the main playback entry points
    - playback/session metadata quality now depends on where playback was initiated rather than on the persisted download record alone
    - this undermines the goal of treating downloaded canonical episodes as stable local representations of PI episode data
  - risk: history rows, restored sessions, and playback-side episode context can drift from the download library snapshot, creating avoidable inconsistency across offline-first flows

### 80. Remote audio export still stages through the main download-persistence pipeline instead of a dedicated export path

Priority: should fix

- exporting audio for a remote playback context currently creates a real podcast-download row through the normal download machinery, then tries to clean it up afterward.
  - affected:
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/lib/downloadService.ts`
  - current behavior:
    - `resolveAudioExportAsset()` falls back to `downloadEpisode(...)` when the current playback context is remote and not already backed by a local track
    - that path persists a real `PodcastDownload` row and audio blob in the main downloads tables
    - the normal download path also calls `persistBuiltInTranscriptForTrack(...)`, so export staging can create transcript sidecars too
    - cleanup is attempted later with `removeDownloadedTrack(..., { suppressNotify: true })` only if the export flow reaches its cleanup branch
  - problems:
    - export is not isolated from library persistence; it borrows the production download pipeline as a temporary staging area
    - temporary-export semantics and user-owned-download semantics are not clearly separated at the storage level
    - interrupted flows can leave behind residues that look like ordinary downloads rather than explicit export scratch state
  - risk: audio export behavior remains coupled to download-library side effects, making export harder to reason about and increasing the chance of orphaned temporary rows or transcript artifacts after failures/interruption

### 81. `surfacePolicy` is currently a no-op abstraction layer that no longer encodes any real playback-surface policy

Priority: cleanup

- the player-surface policy helper still exists as if it were a meaningful strategy layer, but the current implementation no longer distinguishes between any of its supposed inputs.
  - affected:
    - `apps/cloud-ui/src/lib/player/surfacePolicy.ts`
    - `apps/cloud-ui/src/hooks/useEpisodePlayback.ts`
    - `apps/cloud-ui/src/lib/localSearchActions.ts`
    - `apps/cloud-ui/src/routeComponents/HistoryPage.tsx`
    - `apps/cloud-ui/src/lib/player/__tests__/surfacePolicy.test.ts`
  - current behavior:
    - `derivePolicyFromTranscriptUrl(...)` ignores its input and always returns `{ playableContext: true, mode: 'docked' }`
    - `deriveSurfacePolicyFromEpisode(...)`, `deriveSurfacePolicyFromFavorite(...)`, `deriveSurfacePolicyFromHistorySession(...)`, and `deriveSurfacePolicyFromSearchEpisode(...)` all collapse to that same result
    - multiple playback entry points still call `derive...` plus `applySurfacePolicy(...)` as if they were consulting a real policy engine
    - tests explicitly codify the “every input yields the same policy” behavior
  - problems:
    - the abstraction boundary is misleading; callers appear to be delegating a policy decision, but no actual decision is being made
    - the extra layer adds architectural noise while making it harder to see which playback-surface behavior is truly intentional versus leftover scaffolding
    - if surface behavior needs to diverge again later, the current API shape gives a false impression that this is already modeled and covered
  - risk: stale abstraction layers like this make playback flows harder to reason about and encourage further indirection without real semantics behind it

### 83. `MiniPlayerMoreMenu` still derives export-context invalidation from its own ad hoc playback key instead of the shared playback identity/export context

Priority: should fix

- the mini-player export/import menu is not reusing the existing playback identity snapshot as its invalidation boundary; it reconstructs a separate key from raw store fields.
  - affected:
    - `apps/cloud-ui/src/components/AppShell/MiniPlayerMoreMenu.tsx`
    - `apps/cloud-ui/src/lib/player/playbackIdentity.ts`
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
  - current behavior:
    - `useMiniPlayerMoreMenuController()` builds `playbackContextKey` from `localTrackId`, `originalAudioUrl || audioUrl`, `episodeTranscriptUrl`, `loadRequestId`, and subtitle count
    - an effect uses that key to decide when to re-query `resolveCurrentPlaybackExportContext()`
    - the rest of the player/export stack already has `resolveCurrentPlaybackIdentity()` and `playbackIdentityKey` as the shared notion of current playback identity
  - problems:
    - export-context invalidation is now owned by a menu-local compound key rather than by the canonical playback identity helper
    - store-field selection for the menu can drift from the fields the export layer itself considers identity-relevant
    - the code is maintaining two different “current playback changed” heuristics for nearby responsibilities
  - risk: mini-player export/import affordances can become stale or over-eager after future identity/export changes, because one consumer is no longer bound to the shared playback-context contract


### 98. `importTranscriptForCurrentPlayback()` captures one playback context, performs async work, then unconditionally writes transcript/player state without revalidating current playback identity

Priority: should fix

- transcript import is currently a capture-then-commit flow with no final identity check, so an import that started on track A can still mutate the global transcript/player state after the user has already switched to track B.
  - affected:
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/components/AppShell/MiniPlayerMoreMenu.tsx`
    - `apps/cloud-ui/src/lib/player/__tests__/playbackExport.test.ts`
  - current behavior:
    - `importTranscriptForCurrentPlayback()` resolves `context = resolveCurrentPlaybackExportContext()` once at the start
    - it then asynchronously reads the file, parses cues, and persists them either to local track storage or remote transcript cache
    - after that async chain succeeds, it unconditionally calls `useTranscriptStore.getState().setSubtitles(cues)`
    - it also unconditionally rewrites `usePlayerStore.getState().setEpisodeMetadata({ ...episodeMetadata, playbackRequestMode: default })`
    - the imported event is dispatched using the original captured `playbackIdentityKey`
    - existing tests only cover success/failure for a stable current track; there is no regression coverage for “user switched playback before import finished”
  - problems:
    - the function does not re-check whether the active playback identity still matches the one it started from before mutating global stores
    - transcript import side effects are therefore not scoped to the track that initiated the action
    - playback-mode cleanup (`stream_without_transcript` -> `default`) can be applied to the wrong track if the player changed during import
  - risk: a slow import can leak cues and metadata state across track boundaries, causing the newly selected track to display/import/export transcript state that actually belongs to the prior playback context

### 99. Transcript export/import still treats the global `transcriptStore` cue array as current-track truth even though the store carries no playback-identity ownership

Priority: should fix

- the export layer still assumes that “subtitles currently loaded in memory” automatically belong to the active playback identity, but the transcript store has no field that actually records which playback context those cues came from.
  - affected:
    - `apps/cloud-ui/src/store/transcriptStore.ts`
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/components/AppShell/MiniPlayerMoreMenu.tsx`
    - `apps/cloud-ui/src/lib/player/__tests__/playbackExport.test.ts`
  - current behavior:
    - `transcriptStore` persists `subtitles`, `subtitlesLoaded`, and ASR state, but no `playbackIdentityKey` or equivalent ownership marker
    - `resolveCurrentPlaybackExportContext()` sets `hasLoadedTranscript` solely from `useTranscriptStore.getState().subtitles.length > 0`
    - `resolveTranscriptExportAsset()` prefers `useTranscriptStore.getState().subtitles` before checking stored transcript sources or remote transcript cache
    - the mini-player export availability also re-checks subtitle presence through this same global cue buffer
    - tests frequently prime `useTranscriptStore.getState().setSubtitles(...)` directly and then assert export availability/success, without any ownership coupling to a specific playback identity
  - problems:
    - in-memory cue availability is being treated as if it were identity-bound state, but the store does not encode which track those cues belong to
    - export/import helpers therefore rely on reset timing and caller discipline instead of on an explicit ownership contract
    - any late async transcript write or stale cue residue can be mistaken for “current playback has an exportable transcript”
  - risk: transcript export and transcript availability UI can act on stale or foreign cues after playback changes, because the system has no authoritative way to prove that loaded transcript state still belongs to the active playback identity

### 100. `playerStore.restoreSession()` still has a stale-restore hole in the remote-session local-download probe path

Priority: should fix

- remote session restore now prefers a matching local download before falling back to the original remote URL, but the fallback branch still lacks a fresh cancellation/identity gate after the async download lookup finishes.
  - affected:
    - `apps/cloud-ui/src/store/playerStore.ts`
    - `apps/cloud-ui/src/store/__tests__/playerStore.restore-local-download.test.ts`
    - `apps/cloud-ui/src/store/__tests__/playerStore.test.ts`
  - current behavior:
    - for `lastSession.source === 'explore'`, `restoreSession()` awaits `DownloadsRepository.findTrackByUrl(normalizedUrl)`
    - if a matching downloaded track exists, the code later performs a guarded local-blob restore
    - if no track exists, or if the track exists but its audio blob is missing, control falls through to the fallback branch that restores `lastSession.audioUrl`
    - that fallback branch checks only `!get().audioLoaded || get().sessionId !== lastSession.id`; it does not first re-check `loadRequestId` / abort status after the awaited download probe
    - current tests cover the happy-path local preference and normal fallback cases, but do not exercise “restore request A is superseded while the local-download probe is still in flight”
  - problems:
    - a stale restore request can still reach the fallback remote-URL apply path after a newer load request has already taken ownership
    - this branch is inconsistent with the stronger request-id guards used elsewhere in `restoreSession()` and in remote transcript ingestion
    - the test suite currently makes the remote/local preference look race-safe without covering the superseded-request case
  - risk: startup or resume flows can briefly or permanently overwrite newer playback state with an older remote session when the local-download lookup resolves late

### 101. Startup session-restore trigger ownership is still split between `useSession` and `useAppInitialization`

Priority: cleanup

- boot-time playback restoration still has two independent trigger owners, each of which decides “if initialization is idle, call `restoreSession()`”.
  - affected:
    - `apps/cloud-ui/src/hooks/useSession.ts`
    - `apps/cloud-ui/src/hooks/useAppInitialization.ts`
    - `apps/cloud-ui/src/hooks/__tests__/useSession.test.ts`
    - `apps/cloud-ui/src/hooks/__tests__/useAppInitialization.test.ts`
  - current behavior:
    - `useSession()` runs an effect that calls `restoreSession()` when `initializationStatus === 'idle'`
    - `useAppInitialization()` runs a separate effect with the same policy
    - the store-level `restoreSession()` implementation returns early once status becomes `restoring` or `ready`, so duplicate calls are usually suppressed by runtime timing rather than by one clear caller contract
    - tests for the two hooks mock and reason about restore ownership independently, reinforcing the idea that both hooks may initiate startup restore
  - problems:
    - startup restore orchestration does not have one obvious owner; two hook layers are both allowed to initiate it
    - correctness currently depends on the store method’s internal status guard rather than on one explicit bootstrapping boundary
    - this makes future refactors harder because boot-time restore semantics are spread across app init and audio/session management concerns
  - risk: initialization behavior remains harder to reason about and test than necessary, and future changes to restore timing or status transitions may accidentally reintroduce duplicated startup restore work

### 102. Transcript follow-state recovery is still wired only to the manual import event, not to the normal subtitle load paths

Priority: cleanup

- the full-player follow/auto-scroll state currently re-enables itself only when a transcript-import event is dispatched, even though most subtitle availability paths do not go through transcript import at all.
  - affected:
    - `apps/cloud-ui/src/components/AppShell/PlayerSurfaceFrame.tsx`
    - `apps/cloud-ui/src/lib/player/playbackExport.ts`
    - `apps/cloud-ui/src/lib/remoteTranscript.ts`
    - `apps/cloud-ui/src/components/AppShell/__tests__/PlayerSurfaceFrame.follow.test.tsx`
  - current behavior:
    - `PlayerSurfaceFrame` owns `isAutoScrolling` in local component state
    - it sets that state back to `true` only when the user clicks the follow button, or when `TRANSCRIPT_IMPORTED_EVENT` fires for the current playback identity
    - `TRANSCRIPT_IMPORTED_EVENT` is dispatched only by `importTranscriptForCurrentPlayback()`
    - the ordinary subtitle load paths such as cached transcript apply, remote transcript fetch success, online ASR success, and download/file retranscribe success all call `setSubtitles(...)` directly without emitting that event
    - the dedicated follow-state test suite only verifies the manual import event path
  - problems:
    - follow-state recovery is coupled to one niche subtitle source path instead of to the broader “current playback gained new transcript content” state transition
    - the player has no unified policy for whether follow should reset on track change or on transcript replacement; it only reacts to one specific event source
    - tests currently reinforce the manual-import event as the only recovery contract, leaving the more common transcript-loading paths uncovered
  - risk: after a user disables follow, newly loaded subtitles from cache/network/ASR may appear without restoring follow behavior, leaving the reading surface in a stale interaction mode that depends on how the transcript arrived


### 103. Player/transcript tests still codify low-level coordination tokens as if they were stable public contract

Priority: cleanup

- several tests assert exact `loadRequestId` behavior, playback-identity string grammar, and manual event payload shape instead of focusing on user-visible playback/transcript outcomes.
  - affected:
    - `apps/cloud-ui/src/store/__tests__/playerStore.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/remoteTranscript.asr.test.ts`
    - `apps/cloud-ui/src/lib/__tests__/remoteTranscript.localInputRelay.test.ts`
    - `apps/cloud-ui/src/components/AppShell/__tests__/PlayerSurfaceFrame.follow.test.tsx`
    - `apps/cloud-ui/src/lib/player/__tests__/playbackIdentity.test.ts`
  - current behavior:
    - `playerStore.test` asserts that same-track refresh preserves `loadRequestId` and that new-track loads increment it monotonically
    - transcript/ASR tests seed specific numeric `loadRequestId` values directly into store state in order to drive staleness logic
    - `PlayerSurfaceFrame.follow.test.tsx` dispatches `TRANSCRIPT_IMPORTED_EVENT` with exact string payloads such as `playbackIdentityKey: 'local-track:track-1'`
    - `playbackIdentity.test` locks in the exact remote key grammar `remote-playback:${normalizedUrl}`
  - problems:
    - these counters and string tokens are coordination internals, not product-level behavior the UI actually promises
    - future cleanup toward explicit playback-identity objects or narrower playback commands will have to fight brittle tests that enshrine today’s implementation details
    - the suite is teaching future maintainers that `loadRequestId` and string-key grammar are first-class contract surface instead of replaceable implementation choices
  - risk: playback/transcript refactors remain artificially expensive because test coverage freezes incidental internals that should stay private
