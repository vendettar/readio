# Task: 122 - Split Settings and Credentials Storage Strategy [COMPLETED]

## Read First (Required)
- `apps/docs/content/docs/general/charter.mdx`
- `apps/docs/content/docs/apps/lite/coding-standards/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/index.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`

## Goal
Separate persistence for user settings and credentials so that non-sensitive preferences and sensitive API credentials follow different storage and lifecycle rules.

## Dependents
- **Instruction 123 (Online ASR API Integration)** depends on this task. It requires the `credentials` table and `CredentialsRepository` API to securely store Groq/OpenAI API keys.

## Scope
- `apps/lite/src/lib/dexieDb.ts`
- `apps/lite/src/lib/db/types.ts`
- `apps/lite/src/lib/db/credentialsRepository.ts` (NEW – repository module)
- `apps/lite/src/hooks/useSettingsForm.ts`
- `apps/lite/src/lib/schemas/settings.ts`
- `apps/lite/src/store/*` (only modules reading/writing settings or API keys)
- `apps/lite/src/lib/runtimeConfig*` (if key-loading contract requires adjustment)
- `apps/lite/src/lib/storage.ts` (remove credential JSON from localStorage)
- `apps/lite/src/hooks/useStorageMaintenance.ts` (update wipe policies)
- `apps/docs/content/docs/apps/lite/handoff/database.mdx`
- `apps/docs/content/docs/apps/lite/handoff/database.zh.mdx`

## Scope Scan (8 Scopes)
- Config: keep existing runtime env contract; no new mandatory envs.
- Persistence: split settings and credentials storage path; one-time silent migration.
- Routing: no route changes.
- Logging: no credential values in logs. The `devWarnStorageFailure` function in `storage.ts` must NOT log credential key content.
- Network: no API contract changes.
- Storage: add credential-specific repository boundary and clear policy.
- UI state: keep current settings UX and form behavior.
- Tests: add repository-boundary coverage for settings vs credentials read/write/clear.

## Current State Analysis

### Where credentials live today
Credentials (`openAiKey`, `groqKey`) are currently stored as **plain JSON in localStorage** under the key `readio-user-credentials`:

| Layer | File | What it does |
|:---|:---|:---|
| Schema | `lib/schemas/settings.ts` | Defines `SettingsCredentialValues = Pick<SettingsFormValues, 'openAiKey' \| 'groqKey'>` and `SETTINGS_CREDENTIALS_STORAGE_KEY` |
| Form | `hooks/useSettingsForm.ts` | Reads credentials from `localStorage` via `getJson()` on mount, writes back via `setJson()` on blur/submit |
| Wipe | `hooks/useStorageMaintenance.ts` | `wipeAll()` removes both `SETTINGS_STORAGE_KEY` and `SETTINGS_CREDENTIALS_STORAGE_KEY` from localStorage |
| DB | `lib/dexieDb.ts` | No `credentials` table exists. No IndexedDB involvement for credentials today |

### Problems with current approach
1. **localStorage is synchronous and unencrypted** – API keys are trivially readable from DevTools.
2. **No isolation** – credentials share the same `getJson`/`setJson` utility as non-sensitive data, making accidental logging easy.
3. **No table-level wipe granularity** – "Wipe Cache" vs "Wipe All" cannot differentiate because both are localStorage operations.
4. **Export risk** – any `localStorage` dump or backup feature could accidentally include keys.

## Hidden Risk Sweep
- Security:
  - Credentials must never be mirrored to localStorage/sessionStorage logs.
  - Export/backup flows (Vault/OPML) must strictly exclude the `credentials` table.
  - `devWarnStorageFailure` in `storage.ts` currently logs `{ key }` on failure. If credentials move to IndexedDB this is less risky, but verify no credential values reach console output.
- Reliability:
  - Settings writes and credentials writes must not block each other.
  - Credential read precedence must be deterministic and stable across startup/render paths.
  - Startup defaults: DB stored credentials must always override Environment Variable (VITE_*) defaults.
  - The migration (localStorage → IndexedDB) must tolerate: (a) empty localStorage (new user), (b) valid JSON, (c) corrupted/malformed JSON. In all cases, the app must boot without error.
  - Wipe flows must be strong-consistent: after wipe completes, no stale async task may re-write credentials.
- Maintainability:
  - Call sites must not depend on a mixed object shape containing sensitive + non-sensitive fields.
  - Runtime config behavior must be explicit: credential changes are either immediate-effect or next-startup-effect (no ambiguous mixed behavior).

## Security Boundaries (Hard Constraint)

### Deployment Modes
- **Public Lite**: Strictly **BYOK** (Bring Your Own Key). Platform API keys must NEVER be pre-configured in build artifacts.
- **Self-host Docker**: Allows key injection via server-side environment variables (`env.js`), strictly for **Single-Tenant / Private Instance** use.
- **Constraint**: Keys injected into frontend runtime config are visible to any visitor. This method is strictly prohibited for public multi-tenant deployments.

## Implicit Write Rules

### Startup Persistence Policy
- **Rule**: If IndexedDB is empty but runtime env has a value (Self-host mode), the app uses the env value in memory but **MUST NOT** silently write it to IndexedDB.
- **Reasoning**: Automatic persistence creates "zombie keys" that persist even after the server env var is removed.
- **Trigger**: Persistence only happens when the user explicitly clicks "Save" in Settings.

## Contract

### Credential Source Precedence (Required)
On startup and settings hydration, credential sources must be resolved in this fixed order:

1. IndexedDB `credentials` table (authoritative after migration)
2. Legacy localStorage credentials key (`readio-user-credentials`) only for one-time migration path
3. Runtime env defaults (if any)
4. Empty string

No long-term dual-source reads are allowed after migration finalizes.
Do not keep a permanent fallback that checks both IndexedDB and localStorage after migration.

### Storage Topology (After)
```text
┌─────────────────────────────────────────────┐
│ localStorage                                │
│  readio-user-settings → { proxyUrl: "..." } │
│  (credentials REMOVED after migration)      │
└─────────────────────────────────────────────┘
         ↕ non-sensitive only

┌─────────────────────────────────────────────┐
│ IndexedDB (Dexie)                           │
│  credentials table                          │
│    { key: "provider_openai_key", value: "sk-...",     │
│      updatedAt: 1708000000 }                │
│    { key: "provider_groq_key", value: "gsk_...",      │
│      updatedAt: 1708000000 }                │
└─────────────────────────────────────────────┘
         ↕ sensitive only
```

### CredentialsRepository API

```typescript
// apps/lite/src/lib/db/credentialsRepository.ts

export const CREDENTIAL_KEY_PATTERN = /^provider_[a-z0-9_]+_key$/

export interface CredentialEntry {
  key: string        // Extensible provider key. Examples: 'provider_openai_key', 'provider_groq_key'
                     // Must satisfy CREDENTIAL_KEY_PATTERN
  value: string      // The actual secret
  updatedAt: number  // Timestamp
}

/** Read a single credential. Returns empty string if not found. */
export async function getCredential(key: string): Promise<string>

/** Write a single credential. Value is trimmed before storage. */
export async function setCredential(key: string, value: string): Promise<void>

/** Write multiple credentials atomically (all-or-nothing). Values are trimmed before storage. */
export async function setCredentials(entries: Record<string, string>): Promise<void>

/** Read all credentials as a key-value record. */
export async function getAllCredentials(): Promise<Record<string, string>>

/** Delete a single credential. */
export async function deleteCredential(key: string): Promise<void>

/** Delete ALL credentials (used by "Wipe All"). */
export async function clearAllCredentials(): Promise<void>
```

### Credential Key Naming Convention (Required)
- Use snake_case provider keys in the form `provider_<vendor>_key`.
- Examples:
  - `provider_openai_key`
  - `provider_groq_key`
  - `provider_anthropic_key`
- Disallow ambiguous generic keys (e.g., `apiKey`, `token`, `openAiKey`) in new writes.

### Security Constraints (Required)

#### Import/Export & Backup
- **Vault/OPML Export**: Must strictly **EXCLUDE** the `credentials` table.
- **Import Flow**: Must **NEVER** overwrite or write to the `credentials` table.
- **Verification**: Add test cases to verify exported JSON does not contain keys matching `CREDENTIAL_KEY_PATTERN`.

#### Log & Error Sanitization
- **Rule**: No log, toast, or error telemetry may contain API key values or reversible fragments.
- **Allowed**: Provider name (`groq`, `openai`) and status code (`401`, `429`).
- **Forbidden**: `sk-proj-...`, `gsk_...`.

### Migration Contract
- **Trigger**: On app initialization (before first form render), run `migrateCredentialsFromLocalStorage()`.
- **Logic**:
  1. Read `SETTINGS_CREDENTIALS_STORAGE_KEY` from localStorage.
  2. If present and valid JSON:
     - map legacy keys to canonical provider keys (`openAiKey` → `provider_openai_key`, `groqKey` → `provider_groq_key`)
     - then extract entries that satisfy `CREDENTIAL_KEY_PATTERN`.
  3. Write all non-empty values in a single atomic operation (`setCredentials()` / DB transaction).
  4. Remove `SETTINGS_CREDENTIALS_STORAGE_KEY` from localStorage **only after** write succeeds.
  5. If JSON is malformed, remove the key and log a warning (no user-facing error).
- **Idempotency**: If `SETTINGS_CREDENTIALS_STORAGE_KEY` does not exist in localStorage, skip silently.
- **Concurrency (Required)**:
  - Migration must be safe if multiple tabs run it at the same time.
  - Re-running migration must never erase newer IndexedDB values with empty/invalid payloads.
- **Cleanup Rule (Required)**:
  - After a successful migration write, remove `SETTINGS_CREDENTIALS_STORAGE_KEY` immediately.
  - If JSON is malformed, remove the legacy key anyway (do not keep corrupted payload around).
  - If IndexedDB write fails, keep the legacy key for retry on next startup.
  - Do not keep a long-lived fallback that reads both localStorage and IndexedDB on every startup.

### IndexedDB Unavailable Policy (Required)
- App must boot even if IndexedDB is blocked/unavailable.
- Credential persistence must **not** fall back to localStorage/sessionStorage.
- Save failure must be explicit to the user (no silent success state).
- In-memory draft may exist for current session, but must be treated as non-persisted and reset-safe.

### Wipe Policy (Updated)

| Action | Settings (localStorage) | Credentials (IndexedDB) | Audio Cache | Sessions | Runtime Cache |
|:---|:---|:---|:---|:---|:---|
| **Wipe Audio Cache** | ✅ Preserve | ✅ Preserve | ❌ Clear | ✅ Preserve | ✅ Preserve |
| **Wipe All (Reset)** | ❌ Clear | ❌ Clear | ❌ Clear | ❌ Clear | ❌ Clear |

#### Double-Clear Design Decision
`wipeAll()` calls `clearAllCredentials()` (bumps epoch) then `DB.clearAllData()` (clears all tables including credentials again). The second clear is intentionally redundant for table-wipe completeness; the epoch bump is what provides stale-write safety.

#### Epoch Scope Limitation
The `credentialWriteEpoch` counter is in-memory (per-tab). Other tabs are not notified of a wipe. This is acceptable because `wipeAll()` triggers `reload()`, resetting all module state. If strict cross-tab consistency becomes necessary, a `BroadcastChannel` or IDB meta-row approach should be added.

Additional consistency requirement:
- After **Wipe All**, credentials must be absent from both persistent storage and in-memory state.
- Pending async writes from pre-wipe state must not reinsert credentials after wipe completion.

### useSettingsForm Refactor
- **Mount**: Read preferences from localStorage (sync) + read credentials from IndexedDB via `getAllCredentials()` (async).
- **Save**: Write preferences to localStorage (sync) + write credentials to IndexedDB via `setCredentials()` (async).
- **Write Strategy (Required)**:
  - Save all credential fields present in the form model in one deterministic operation path.
  - If partial write failure is possible, surface an explicit error and keep prior persisted values intact (no silent partial commit behavior).
- **Impact**: `form.reset()` call must wait for async credentials read. Either:
  - (a) Show the form immediately with empty key fields, then populate async, or
  - (b) Gate the form render behind a `credentialsLoaded` state.
  - **Recommendation**: Option (b) – gate with a brief loading state. Avoids the visual flash of empty-then-filled key fields.

## Non-Goals
- No new encryption subsystem in this task.
- No UI redesign of Settings page.
- No server-side credential vault integration.
- No changes to the `settings` Dexie table (the non-sensitive KV store). Preferences like `files.viewDensity` continue to use the existing `settings` table.

## Plan

### Step 1: Dexie Schema & Types
- Add `credentials` table to `dexieDb.ts` (bump Dexie version).
- Add `CredentialEntry` interface to `lib/db/types.ts`.
- Schema: `credentials: 'key'` (primary key only, no indexes needed).

### Step 2: CredentialsRepository
- Create `lib/db/credentialsRepository.ts` with the API defined above.
- All IndexedDB access for credentials goes through this module – no direct `db.credentials` access from hooks or stores.
- Enforce deterministic read precedence contract in repository or migration boundary (not spread across callers).
- Enforce key validation via `CREDENTIAL_KEY_PATTERN` in write paths.

### Step 3: Migration
- Create `lib/db/migrateCredentials.ts`:
  - `migrateCredentialsFromLocalStorage()` – one-time silent migration.
- Call this function early in app boot (e.g., in `main.tsx` or the Dexie `on('ready')` hook).

### Step 4: Refactor useSettingsForm
- Replace `getJson<SettingsCredentialValues>(SETTINGS_CREDENTIALS_STORAGE_KEY)` with `getAllCredentials()`.
- Replace `setJson(SETTINGS_CREDENTIALS_STORAGE_KEY, credentials)` with `setCredentials()` in one operation path.
- Add `credentialsLoaded` state to gate form rendering.
- Remove `SETTINGS_CREDENTIALS_STORAGE_KEY` import from this file after migration is in place.

### Step 5: Refactor useStorageMaintenance
- `wipeAll()`: Replace `localStorage.removeItem(SETTINGS_CREDENTIALS_STORAGE_KEY)` with `clearAllCredentials()`.
- `wipeAudioCache()`: Ensure it does NOT touch credentials (already correct today).
- Add post-wipe guard to prevent stale async credential writes from repopulating storage.

### Step 6: Schema Cleanup
- Remove `SETTINGS_CREDENTIALS_STORAGE_KEY` export from `lib/schemas/settings.ts` (after migration runs once, no more localStorage usage for credentials).
- Update `SettingsCredentialValues` type to remain as a type-only export (the shape doesn't change, only the storage backend).

### Step 7: Tests
- **credentialsRepository.test.ts**: CRUD operations, `setCredentials` atomic behavior, `clearAllCredentials`, read non-existent key returns empty string, invalid key rejection, **value trim on write**, **wipe+save race rejection via epoch**, **stale delete rejection via epoch**.
- **migrateCredentials.test.ts**: Valid migration, empty localStorage (no-op), malformed JSON (graceful), already-migrated (idempotent), concurrent migration safety.
- **useSettingsForm.test.ts**: Update existing tests to mock `credentialsRepository` instead of localStorage.
- **useStorageMaintenance.test.ts**: Verify wipe policies per the updated table. **Verify wipeAudioCache does not touch credentials.**
- **idb-unavailable behavior tests**: save error is surfaced; no fallback credential write to localStorage/sessionStorage.

### Step 8: Documentation
- Update `database.mdx` and `database.zh.mdx` to document the `credentials` table and its lifecycle rules.

## Verification Commands
- `pnpm -C apps/lite lint`
- `pnpm -C apps/lite typecheck`
- `pnpm -C apps/lite test:run`
- `rg -n "readio-user-credentials|SETTINGS_CREDENTIALS_STORAGE_KEY" apps/lite/src --glob '!**/lib/db/migrateCredentials.ts'`
- `rg -n "localStorage\\.(getItem|setItem|removeItem).*?(openAiKey|groqKey|provider_[a-z0-9_]+_key|credentials|apiKey)" apps/lite/src`

## Impact Checklist
- Affected modules:
  - settings schema + form persistence
  - DB/repository boundary for settings/credentials
  - storage maintenance (wipe policies)
  - docs for storage contract
- Regression risks:
  - credential loss on reload due to wrong key mapping.
  - accidental exposure of credential fields in settings export.
  - stale state due to mixed cache of old and new storage reads.
  - migration failure on malformed localStorage data causing boot crash.
  - form flash (empty → filled) if async credential load isn't gated.
- Required verification:
  - validate settings persist unchanged.
  - validate credentials persist/read independently via IndexedDB.
  - validate one-time migration: keys move from localStorage → IndexedDB, localStorage entry removed.
  - validate migration is idempotent (re-running after completion is a no-op).
  - validate migration concurrency safety (multi-tab startup).
  - validate source precedence order: DB > migration source > env defaults > empty.
  - validate wipe behaviors match policy (Wipe Audio Cache vs Wipe All).
  - validate wipe behaviors match policy (Wipe Audio Cache vs Wipe All).
  - validate wipe strong-consistency: after Wipe All, no delayed async write restores credential values (intercepted by epoch/version check).
  - validate race condition: concurrent "Wipe All" and "Save Settings" does not result in zombie credentials.
  - validate IndexedDB-unavailable behavior: app boots, save failure surfaced, no credential localStorage fallback.
  - validate export security: ensure exported Vault/JSON payload does not contain credential keys or secret-like values (`sk-`, `gsk_`, provider keys).
  - validate that `devWarnStorageFailure` does not log credential values.

## Decision Log
- **Value Trim**: Credential values are trimmed on write (`normalizeCredentialValue`) to prevent accidental whitespace in API keys.
- **Double-Clear**: `wipeAll` calls `clearAllCredentials` (epoch bump) then `clearAllData` (table sweep). The redundant clear is by design for table-completeness; epoch is the safety mechanism.
- **Epoch Scope**: Write epoch is per-tab in-memory. Cross-tab consistency relies on `reload()` after wipe. BroadcastChannel deferred as YAGNI for single-user PWA.

## Bilingual Sync
- Required (when implemented): update EN/ZH handoff database docs together.

## Completion
- Completed by: Readio Worker (Codex GPT-5)
- Commands:
  - `pnpm -C apps/lite lint`
  - `pnpm -C apps/lite typecheck`
  - `pnpm -C apps/lite test:run`
  - `rg -n "readio-user-credentials|SETTINGS_CREDENTIALS_STORAGE_KEY" apps/lite/src --glob '!**/lib/db/migrateCredentials.ts'`
  - `rg -n "localStorage\\.(getItem|setItem|removeItem).*?(openAiKey|groqKey|provider_[a-z0-9_]+_key|credentials|apiKey)" apps/lite/src`
- Date: 2026-02-18
