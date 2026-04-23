# Full Repo Review (6 Sub-Agents)

Date: 2026-03-17
Repo: `.`
Mode: Read-only code review across 6 disjoint scopes

## Scope Split

1. `apps/lite` store, repository, DB, files, networking, schemas
2. `apps/lite` player, transcript, app shell, layout, shared UI, route components
3. `apps/lite` routes, explore/files/downloads/search/settings, hooks, route helpers, discovery/player helpers
4. `apps/docs` runtime, app routes, metadata, i18n, source wiring, search API
5. `apps/docs/content/docs`, review prompts, instructions, review artifacts, repo READMEs
6. `packages/core`, repo scripts, test/config/deploy files, package manifests

## Verification Run

- `pnpm lint`: passed
- `pnpm typecheck`: passed at repo root
- One scoped pass additionally reported `pnpm -C apps/lite exec tsc -p tsconfig.app.json --noEmit` failures in test files that the default root pipeline is not catching

## Findings

### P1

#### 1. Client runtime config exposes self-host deployment keys to every browser session

Files:

- `apps/lite/public/env.js:28`
- `apps/lite/src/lib/runtimeConfig.ts:14`
- `apps/lite/src/lib/runtimeConfig.schema.ts:266`

Why it matters:

The current design makes `READIO_OPENAI_API_KEY` / `READIO_ASR_API_KEY` readable from `window.__READIO_ENV__` in the browser. Per user clarification, these keys are intended for self-host deployers, including Docker deployments. That deployment model is fine for public, browser-safe tokens, but it is not safe for real provider secrets because the values are exposed to every end user via DevTools and network responses. If a deployer supplies an actual upstream API secret here, the app will leak it by design.

Suggested follow-up:

- Document clearly that these must never be real provider secrets unless routed through a trusted server
- Add a deploy/config guard that rejects obviously secret-bearing vars in client runtime config

Missing coverage:

- Policy or deployment validation test that fails when secret-like keys are wired into client runtime config

#### 2. Async session restore can seek the wrong track after playback switches

Files:

- `apps/lite/src/components/AppShell/GlobalAudioController.tsx:139`
- `apps/lite/src/hooks/useSession.ts:207`

Why it matters:

`restoreProgress()` reads session state asynchronously and later writes `audioElement.currentTime` without re-checking that the audio/session identity is still current. Because the app reuses the same audio element, a fast track switch during the await can apply the old seek to the new track.

Missing coverage:

- Regression test that changes `sessionId` and `audioUrl` before the restore promise resolves and asserts stale seek is ignored

#### 3. Localized docs markdown export links are broken

Files:

- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx:26`
- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx:28`
- `apps/docs/next.config.mjs:13`

Why it matters:

`markdownUrl` is built from locale-prefixed page URLs, but the rewrite only matches `/docs/:path*.mdx`. For localized pages such as `/en/docs/...` and `/zh/docs/...`, markdown export and LLM-related actions can resolve to 404.

Missing coverage:

- Integration test asserting localized markdown URLs resolve for both English and Chinese docs

#### 4. Docs Open Graph image URLs are generated without locale

Files:

- `apps/docs/lib/source.ts:14`
- `apps/docs/lib/source.ts:19`
- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx:59`
- `apps/docs/app/[lang]/og/docs/[...slug]/route.tsx:8`

Why it matters:

Metadata publishes `/og/docs/...`, but the actual handler lives under `/{lang}/og/docs/...`. Social crawlers will request a non-existent OG image route for localized docs pages.

Missing coverage:

- Metadata test asserting the emitted OG image URL includes the current locale

#### 5. Library hydration failures become sticky and stop retrying on later opens

Files:

- `apps/lite/src/store/exploreStore.ts:378`
- `apps/lite/src/store/exploreStore.ts:529`

Why it matters:

`loadSubscriptions()` and `loadFavorites()` mark their data as loaded even when repository reads fail. Since `open()` relies on those lazy loaders, one transient IndexedDB failure can leave subscriptions/favorites permanently empty on future opens unless a separate refresh path happens to run.

Missing coverage:

- Regression test where the first load fails and a second open retries successfully

#### 6. Search result fallback drops active country for podcast lookup

Files:

- `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx:34`
- `apps/lite/src/components/GlobalSearch/SearchEpisodeItem.tsx:69`

Why it matters:

When a `SearchEpisode` lacks `feedUrl`, the code falls back to `discovery.getPodcast(String(providerPodcastId))` without passing the active country. On non-US catalogs, that can resolve the wrong podcast metadata or fail to resolve a valid result.

Missing coverage:

- Regression test for a non-US search result without `feedUrl`

#### 7. Local session restore drops `localTrackId`

Files:

- `apps/lite/src/store/playerStore.ts:644`
- `apps/lite/src/store/__tests__/playerStore.test.ts:33`

Why it matters:

`restoreSession()` restores session/audio state but not `localTrackId` for local playback. That breaks resumed local-track behavior keyed off track identity, including transcript/ASR flows and UI paths that distinguish local from remote playback.

Missing coverage:

- Restore-session test that asserts `localTrackId` survives restoration

### P2

#### 8. Docs metadata and “view source” output still ship scaffold placeholders

Files:

- `apps/docs/app/[lang]/layout.tsx:9`
- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx:15`
- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx:30`
- `apps/docs/app/[lang]/og/docs/[...slug]/route.tsx:17`

Why it matters:

The docs app still uses `http://localhost:3000`, `username/repo`, and `My App` in user-facing metadata/output. Canonical and OG metadata are invalid in production, and the GitHub source links are broken.

Missing coverage:

- Render or snapshot test for metadata and generated source links

#### 9. Docs search is hardcoded to English despite bilingual content

Files:

- `apps/docs/i18n.ts:3`
- `apps/docs/app/api/search/route.ts:4`

Why it matters:

Current docs support only Chinese and English, per user clarification. The search endpoint still hardcodes Orama language to `english`, which is a correctness risk for Chinese indexing and retrieval.

Missing coverage:

- Search integration test that indexes Chinese content and verifies Chinese queries can retrieve it

#### 10. Top-episode navigation depends on parsing formatted URLs

Files:

- `apps/lite/src/components/Explore/PodcastEpisodesGrid.tsx:88`
- `packages/core/src/schemas/discovery.ts:11`
- `apps/lite/src/lib/discovery/providers/apple.ts:875`

Why it matters:

The route builder extracts podcast IDs using a regex against `episode.url`, while the shared schema explicitly allows relative or otherwise non-canonical URL values. When the regex misses, links silently become inert.

Missing coverage:

- Test covering valid episode data whose URL does not match `/id123...`

#### 11. Transcript interactions are mouse-only

Files:

- `apps/lite/src/components/Transcript/SubtitleLine.tsx:66`
- `apps/lite/src/components/Transcript/Word.tsx:117`

Why it matters:

Core transcript interactions do not expose keyboard activation paths for cue jumps or word lookup/context actions. That makes the transcript inaccessible from keyboard despite the player shell trying to preserve focus behavior elsewhere.

Missing coverage:

- Keyboard interaction tests for cue activation and word-level actions

#### 12. Folder playback page does repeated filtering inside the render loop

Files:

- `apps/lite/src/routeComponents/files/FilesFolderPage.tsx:374`

Why it matters:

The component repeatedly runs `subtitles.filter(...)` per rendered track. On large local libraries, rerenders from density changes, drag state, rename state, or artwork updates can degrade noticeably.

Missing coverage:

- Perf regression or unit coverage around pre-grouped subtitle mapping by `trackId`

#### 13. Root lint/test pipeline misses project-specific guardrails and E2E

Files:

- `package.json:12`
- `package.json:15`
- `apps/lite/package.json:13`
- `apps/lite/package.json:14`
- `apps/lite/package.json:22`

Why it matters:

Root `pnpm lint` only runs Biome-based package lint tasks, not the repo’s DB/routing/selector/i18n guard scripts. Root `pnpm test` also excludes Playwright. The default green path therefore misses some of the highest-value correctness gates.

Missing coverage:

- CI should run `lint:all` or merge those checks into default `lint`
- CI should include Playwright or at least a required smoke subset

#### 14. DB guard script fails open when the scan command breaks

Files:

- `apps/lite/scripts/check-db-guard.js:36`
- `apps/lite/scripts/check-db-guard.js:49`

Why it matters:

If `rg` is missing or the scan command errors for another reason, the script logs the problem but still exits successfully. That turns a failed architecture check into a false clean result.

Missing coverage:

- Guard-script failure-mode test or CI smoke check

#### 15. `@readio/core` is not part of normal typecheck/build enforcement

Files:

- `packages/core/package.json:12`
- `package.json:13`

Why it matters:

The shared package defines no `typecheck` or `test` task, so root pipeline expectations do not actually validate it as a first-class shared boundary.

Missing coverage:

- Add `typecheck` and ideally `test`/`build` to `@readio/core`

#### 16. Bilingual docs and repo docs have SSOT drift

Files:

- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.mdx:172`
- `apps/docs/content/docs/apps/lite/handoff/features/audio-engine.zh.mdx:171`
- `README.md:12`
- `apps/docs/README.md:27`
- `apps/docs/content/docs/general/monorepo-strategy.mdx:56`
- `apps/docs/content/docs/general/monorepo-strategy.zh.mdx:56`

Why it matters:

There is live documentation drift in both bilingual handoff docs and repo-level structure docs. The most serious example is conflicting ASR persistence contracts between English and Chinese handoff docs. There are also stale claims about package layout and old docs routing structure.

Missing coverage:

- Doc consistency review checklist or targeted tests for route/path references

## Additional Notes

- One existing uncommitted change was present during review:
  - `apps/lite/src/components/Selection/SelectionUI.tsx`
- This review stayed read-only and did not modify code.

## Recommended Next Pass

1. Fix the browser-exposed key model or explicitly constrain it to public/self-host-only tokens
2. Fix session-restore race and sticky library hydration
3. Repair docs locale-aware markdown/OG routing and remove scaffold placeholders
4. Tighten default CI so repo guardrails and E2E are part of the required green path
5. Reconcile bilingual docs where contracts currently disagree
