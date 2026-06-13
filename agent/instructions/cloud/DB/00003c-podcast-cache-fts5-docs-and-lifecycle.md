# Instruction 00003c: Podcast Cache FTS5 Docs And Lifecycle

Discuss and approve this document before implementation.

This instruction updates Cloud handoff docs after backend and frontend cached FTS search have landed.

Do not start until `00003a` and `00003b` are implemented and verified.

## Execution Metadata

- Decision Log: Required
- Bilingual Sync: Required
- Pre-Implementation 8-Scope Scan: Required
- Reviewer Evidence Surface: Required

## 1. Goal

Document the final Cloud cache-search contract and lifecycle boundaries in English and Chinese.

## 2. Required Docs

Update:

- `apps/docs/content/docs/apps/cloud/handoff/database.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/database.zh.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/discovery.mdx`
- `apps/docs/content/docs/apps/cloud/handoff/features/discovery.zh.mdx`

## 3. Required Content

Database docs must state:

- FTS tables are derived search indexes over `podcast_shows` and `podcast_episodes`
- canonical data remains in the base tables
- backend SQLite cache is not the user's private browser library
- FTS does not expose `podcast_cache_state` freshness/access/eviction fields
- schema changes remain goose-managed and sqlc-generated where applicable

Discovery docs must state:

- Apple Search remains first-hop global discovery
- cached FTS search is local-cache search only
- FTS miss does not trigger PodcastIndex fetch
- cached search route and result source
- cached results are distinct from subscriptions, favorites, history, files, and downloads

## 4. Lifecycle Status

After docs land, update the instruction lifecycle if the repo convention requires it:

- mark `00003a` completed if implementation landed
- mark `00003b` completed if implementation landed
- keep this parent `00003` as the active series record or move completed children according to existing cloud instruction conventions

Do not mark docs complete before both English and Chinese files are synchronized.

## 5. Verification

Run the relevant docs validation command if one exists in the repository.

At minimum run:

```bash
rg -n "FTS|cache search|cached search|缓存搜索|全文" apps/docs/content/docs/apps/cloud/handoff
```

Implementation report must include:

1. docs files updated
2. English/Chinese sync notes
3. lifecycle updates made or intentionally deferred
4. verification command results

## 6. Pre-Implementation 8-Scope Scan

Before editing docs, scan and report the exact intended touch points for:

1. English database handoff
2. Chinese database handoff
3. English discovery handoff
4. Chinese discovery handoff
5. instruction lifecycle location for `00003a`
6. instruction lifecycle location for `00003b`
7. parent `00003` lifecycle status
8. docs validation command availability

If the scan predicts more than 10 files for 00003c, stop and split 00003c further before implementation.

## 7. Reviewer Evidence Surface

Reviewers must inspect:

- English and Chinese database docs describe the same persistence boundary
- English and Chinese discovery docs describe the same search boundary
- backend cache is not described as user private library state
- Apple Search remains documented as global first-hop discovery
- FTS miss does not imply PodcastIndex fetch
- lifecycle movements match existing cloud instruction convention
- verification command output
