# Cloud Basic Instructions Index

This directory is the active basic instruction set for Readio Cloud. It replaces the old early frontend-only prototype instruction history with concise, final-state contracts.

## Source consolidation

- Consolidated source set: 245 historical prototype instruction files plus the current `apps/docs/content/docs` tree and live code under `apps/cloud-ui` and `apps/cloud-api`.
- Historical intermediate instructions are not copied forward unless they still describe current code.
- Superseded transition notes, abandoned alternatives, and temporary migration steps are intentionally omitted.

## Active documents

- `010-product-scope.md` — product scope and non-goals.
- `020-cloud-ui-contract.md` — frontend structure, ownership, routes, and UI behavior rules.
- `030-cloud-api-contract.md` — Go backend, API surfaces, SQLite, discovery, ASR, proxy, and observability.
- `040-data-media-asr-contract.md` — local data, downloads, transcripts, media fallback, ASR, and language-learning flows.
- `050-quality-security-ops-contract.md` — verification, security, documentation, and operations rules.

## Editing rules

1. Document the current contract, not the implementation journey.
2. Verify against code before updating a requirement.
3. If a later decision supersedes an earlier one, keep only the latest effective rule.
4. Put frontend-only rules under `apps/cloud-ui`; put backend-owned rules under `apps/cloud-api`.
5. Keep future directions clearly marked and separate from implemented behavior.
