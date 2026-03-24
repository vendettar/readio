---
description: Repair docs locale-aware markdown, OG metadata, scaffold placeholders, and bilingual search correctness
---

# Instruction 137d: Docs Locale + Metadata Hardening

Goal: Make the docs app emit valid locale-aware markdown, OG, source links, and search behavior for the current bilingual deployment.

## Scope
- `apps/docs/app/[lang]/docs/[[...slug]]/page.tsx`
- `apps/docs/lib/source.ts`
- `apps/docs/next.config.mjs`
- `apps/docs/app/[lang]/layout.tsx`
- `apps/docs/app/[lang]/og/docs/[...slug]/route.tsx`
- `apps/docs/app/api/search/route.ts`
- `apps/docs/README.md` and related docs only if directly needed for accuracy

## Read First (Required)
- `apps/docs/content/docs/general/technical-roadmap.mdx`
- `apps/docs/content/docs/general/technical-roadmap.zh.mdx`
- `apps/docs/content/docs/general/decision-log.mdx`
- `apps/docs/content/docs/general/decision-log.zh.mdx`
- `agent/reviews/lite/20260317-full-repo-6-agent-review.md`

## Scope Scan (Required Before Coding)
Check and report risks across:
1. Config & env parsing
2. Persistence & data integrity
3. Routing & param validation
4. Logging & error handling
5. Network & caching
6. Storage & serialization
7. UI state & hooks
8. Tests & mocks

Also perform a hidden-risk sweep for:
- locale loss between route generation and metadata emission
- placeholder production metadata creating invalid external links

## Required Changes
1. Fix locale-aware markdown export links and the matching rewrite path.
2. Fix OG image URL generation so metadata points to the locale-aware route.
3. Remove scaffold placeholders from metadata, OG generation, and source links using repository-accurate values.
4. Reassess docs search language behavior for bilingual content and implement the most defensible in-repo improvement without inventing unsupported Orama behavior.
5. Add/update tests for locale-aware metadata/link generation where the app already has a fitting test surface.
6. Update affected docs/readmes for accuracy.

## Forbidden Dependencies / Required Patterns
- Forbidden: shipping localhost or placeholder repo metadata in production paths
- Required: file paths, URLs, and repo references must match repository reality
- Required: if full bilingual search is not technically supported by the current dependency, document the limitation explicitly instead of pretending it is solved

## Acceptance Criteria
- Localized docs pages produce working markdown URLs.
- Metadata emits locale-aware OG URLs.
- Source links and site metadata no longer use scaffold placeholders.
- Search-language decision is technically justified and documented.

## Required Tests
- Locale-aware markdown URL regression coverage
- Locale-aware OG metadata coverage
- Any search-route coverage justified by the chosen implementation

## Verification Commands
- `pnpm -C apps/docs lint`
- `pnpm -C apps/docs typecheck`
- `pnpm -C apps/docs build`

## Decision Log
- Required if search behavior or metadata policy changes materially

## Bilingual Sync
- Required

## Review Notes
- Reviewer: Codex
- Date: 2026-03-18
- Verified:
  - `pnpm -C apps/docs lint`
  - `pnpm -C apps/docs typecheck`
- Blocking verification gap:
  - `pnpm -C apps/docs build` still hangs during `next build` / Turbopack optimized production compile and does not produce a passing completion signal.
- Status:
  - Functional/doc fixes landed, but this instruction remains open until the required production build verification passes.
