import { db } from '../dexieDb'
import { getAppConfig } from '../runtimeConfig'

export const CREDENTIAL_KEY_PATTERN = /^provider_[a-z0-9_]+_key$/

export const TRANSLATE_CREDENTIAL_KEY = 'provider_translate_key'
export const ASR_CREDENTIAL_KEY = 'provider_asr_key'

// In-memory epoch counter — bumped on clearAllCredentials() to invalidate
// stale async writes captured before the wipe. This is per-tab only; other
// tabs are not notified. In practice this is safe because wipeAll() calls
// reload() which resets all module state. If strict cross-tab consistency
// becomes necessary, use BroadcastChannel or an IDB meta-row.
let credentialWriteEpoch = 0

export function getCredentialWriteEpoch(): number {
  return credentialWriteEpoch
}

function assertCredentialKey(key: string): void {
  if (!CREDENTIAL_KEY_PATTERN.test(key)) {
    throw new Error(`Invalid credential key: ${key}`)
  }
}

function normalizeCredentialValue(value: string): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

function getRuntimeCredentialDefaults(): Record<string, string> {
  const config = getAppConfig()
  const defaults: Record<string, string> = {}

  if (config.ASR_API_KEY) {
    defaults[ASR_CREDENTIAL_KEY] = config.ASR_API_KEY
  }
  if (config.OPENAI_API_KEY) {
    defaults[TRANSLATE_CREDENTIAL_KEY] = config.OPENAI_API_KEY
  }

  return defaults
}

function coerceCredentialEntries(
  entries: Record<string, string>
): Array<{ key: string; value: string }> {
  return Object.entries(entries).map(([key, value]) => {
    assertCredentialKey(key)
    return {
      key,
      value: normalizeCredentialValue(value),
    }
  })
}

/** Read a single credential. Returns empty string if not found. */
export async function getCredential(key: string): Promise<string> {
  assertCredentialKey(key)
  const credentials = await getAllCredentials()
  return credentials[key] ?? ''
}

/** Write a single credential. */
export async function setCredential(key: string, value: string): Promise<void> {
  await setCredentials({ [key]: value })
}

/** Write multiple credentials atomically (all-or-nothing). */
export async function setCredentials(
  entries: Record<string, string>,
  expectedEpoch: number = credentialWriteEpoch
): Promise<void> {
  const normalizedEntries = coerceCredentialEntries(entries)

  await db.transaction('rw', [db.credentials], async () => {
    if (expectedEpoch !== credentialWriteEpoch) {
      throw new Error('Credential write aborted due to newer wipe action')
    }

    for (const entry of normalizedEntries) {
      if (!entry.value) {
        await db.credentials.delete(entry.key)
        continue
      }

      await db.credentials.put({
        key: entry.key,
        value: entry.value,
        updatedAt: Date.now(),
      })
    }
  })
}

/** Read all credentials as a key-value record. */
export async function getAllCredentials(): Promise<Record<string, string>> {
  const runtimeDefaults = getRuntimeCredentialDefaults()
  let records: Array<{ key: string; value: string }> = []

  try {
    records = await db.credentials.toArray()
  } catch {
    return runtimeDefaults
  }
  const persisted: Record<string, string> = {}

  for (const record of records) {
    if (!CREDENTIAL_KEY_PATTERN.test(record.key)) continue
    if (typeof record.value !== 'string' || !record.value) continue
    persisted[record.key] = record.value
  }

  return {
    ...runtimeDefaults,
    ...persisted,
  }
}

/** Delete a single credential. */
export async function deleteCredential(key: string): Promise<void> {
  assertCredentialKey(key)
  const startedAtEpoch = credentialWriteEpoch

  await db.transaction('rw', [db.credentials], async () => {
    if (startedAtEpoch !== credentialWriteEpoch) {
      throw new Error('Credential delete aborted due to newer wipe action')
    }
    await db.credentials.delete(key)
  })
}

/** Delete ALL credentials (used by "Wipe All"). */
export async function clearAllCredentials(): Promise<void> {
  credentialWriteEpoch += 1
  await db.transaction('rw', [db.credentials], async () => {
    await db.credentials.clear()
  })
}
/** Get the appropriate credential key for a given ASR provider. */
export function getAsrCredentialKey(_provider: string): string {
  return ASR_CREDENTIAL_KEY
}
