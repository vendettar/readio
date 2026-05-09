# 141: VaultRepository Owner Convergence (VaultRepository owner 收口) [COMPLETED]

## Objective
Decouple `vault.ts` from database-level persistence details and record normalization. Shift the responsibility of record-shaping and persistence-specific normalization to `VaultRepository.ts`.

## Context
Current `vault.ts` orchestrates the normalization of database records (favorites, sessions, subscriptions) before passing them to the repository. This leaks table-level persistence details into the vault orchestration layer. The goal is to move these details into `VaultRepository.ts` so `vault.ts` only focuses on the Vault Wire Format (import/export orchestration).

## Decision Log
- **Required**: Recorded as Task 141.

## Bilingual Sync
- **Not applicable**: Internal architectural refactor.

## Proposed Changes

### 1. Refactor `apps/cloud-ui/src/lib/repositories/VaultRepository.ts`
- Import `normalizeFavoriteRecord`, `normalizePlaybackSessionRecord`, and `normalizeSubscriptionRecord` from `../db/recordNormalizers`.
- Update `replaceMetadata` to accept the "raw" records from the vault structure.
- Apply normalization inside the `rw` transaction before `bulkAdd`.

### 2. Refactor `apps/cloud-ui/src/lib/vault.ts`
- Remove imports of `normalizeFavoriteRecord`, `normalizePlaybackSessionRecord`, and `normalizeSubscriptionRecord`.
- Simplify `importVault` to pass `vault.data` fields directly to `VaultRepository.replaceMetadata`.
- Maintain Zod schemas and `isCredentialLikeSettingKey` as they define the wire format.

## Affected Modules
- `apps/cloud-ui/src/lib/vault.ts`
- `apps/cloud-ui/src/lib/repositories/VaultRepository.ts`

## Verification & Testing
- **Lint & Typecheck**: `pnpm --filter @readio/cloud-ui lint` and `pnpm --filter @readio/cloud-ui typecheck`.
- **Behavioral Assertion**:
  - Perform a vault export and import.
  - Verify that records are still correctly normalized in the database (e.g., identity keys built, fields trimmed).

## Forbidden Outcomes
- DO NOT bypass normalization; it must happen in the Repository.
- DO NOT break transaction atomicity.

## Completion Section
- **Completed by**:
- **Commands**:
- **Date**:
- **Reviewed by**:
 && pnpm --filter @readio/cloud-ui typecheck`
- **Date**: 2026-05-09
- **Reviewed by**:
