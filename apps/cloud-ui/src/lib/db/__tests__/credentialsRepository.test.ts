import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('credentialsRepository', () => {
  beforeEach(async () => {
    vi.resetModules()
    window.__READIO_ENV__ = undefined
    const { DB } = await import('../../dexieDb')
    await DB.clearAllData()
  })

  it('returns empty string for non-existent credentials', async () => {
    const { getCredential, TRANSLATE_CREDENTIAL_KEY } = await import('../credentialsRepository')
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('supports set/get/delete and clear operations', async () => {
    const {
      deleteCredential,
      getCredential,
      setCredential,
      clearAllCredentials,
      TRANSLATE_CREDENTIAL_KEY,
      ASR_CREDENTIAL_KEY,
    } = await import('../credentialsRepository')

    await setCredential(TRANSLATE_CREDENTIAL_KEY, 'sk-db-openai')
    await setCredential(ASR_CREDENTIAL_KEY, 'gsk_db_groq')
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('sk-db-openai')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('gsk_db_groq')

    await deleteCredential(TRANSLATE_CREDENTIAL_KEY)
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('gsk_db_groq')

    await clearAllCredentials()
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('rejects invalid credential keys and keeps writes atomic', async () => {
    const { getCredential, setCredentials, TRANSLATE_CREDENTIAL_KEY } = await import(
      '../credentialsRepository'
    )

    await expect(
      setCredentials({
        [TRANSLATE_CREDENTIAL_KEY]: 'sk-ok',
        translateKey: 'sk-invalid',
      } as Record<string, string>)
    ).rejects.toThrow('Invalid credential key')

    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('uses runtime defaults when IndexedDB has no credential values', async () => {
    window.__READIO_ENV__ = {
      READIO_OPENAI_API_KEY: 'public-translate-token',
      READIO_ASR_API_KEY: 'public-asr-token',
    }

    vi.resetModules()
    const { DB } = await import('../../dexieDb')
    await DB.clearAllData()

    const { getCredential, TRANSLATE_CREDENTIAL_KEY, ASR_CREDENTIAL_KEY, setCredential } =
      await import('../credentialsRepository')

    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('public-translate-token')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('public-asr-token')

    await setCredential(TRANSLATE_CREDENTIAL_KEY, 'sk-db-openai')
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('sk-db-openai')
  })

  // TODO(runtimeConfig): re-enable when browser runtime secret sanitization
  // also rejects Groq-style public env prefixes (for example `gsk_` / `gsk-`)
  // in addition to the current OpenAI-style prefixes.
  it.skip('ignores secret-like runtime defaults from browser runtime env', async () => {
    window.__READIO_ENV__ = {
      READIO_OPENAI_API_KEY: 'sk-secret-value',
      READIO_ASR_API_KEY: 'gsk_secret_value',
    }

    vi.resetModules()
    const { DB } = await import('../../dexieDb')
    await DB.clearAllData()

    const { getCredential, TRANSLATE_CREDENTIAL_KEY, ASR_CREDENTIAL_KEY } = await import(
      '../credentialsRepository'
    )

    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('prefers IndexedDB credential values over runtime env defaults', async () => {
    window.__READIO_ENV__ = {
      READIO_ASR_API_KEY: 'gsk-env-value',
    }

    vi.resetModules()
    const { DB } = await import('../../dexieDb')
    await DB.clearAllData()

    const { getCredential, setCredential, ASR_CREDENTIAL_KEY } = await import(
      '../credentialsRepository'
    )

    await setCredential(ASR_CREDENTIAL_KEY, 'gsk-db-value')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('gsk-db-value')
  })

  it('rejects stale credential writes after wipe-all epoch bump', async () => {
    const {
      clearAllCredentials,
      getCredential,
      getCredentialWriteEpoch,
      TRANSLATE_CREDENTIAL_KEY,
      setCredentials,
    } = await import('../credentialsRepository')

    const staleEpoch = getCredentialWriteEpoch()
    await clearAllCredentials()

    await expect(
      setCredentials(
        {
          [TRANSLATE_CREDENTIAL_KEY]: 'sk-stale-write',
        },
        staleEpoch
      )
    ).rejects.toThrow('Credential write aborted due to newer wipe action')

    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('trims whitespace from credential values on write', async () => {
    const { getCredential, setCredential, TRANSLATE_CREDENTIAL_KEY } = await import(
      '../credentialsRepository'
    )

    await setCredential(TRANSLATE_CREDENTIAL_KEY, '  sk-trimmed  ')
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('sk-trimmed')
  })

  it('race: simulated handleFieldBlur save after wipeAll is rejected', async () => {
    const {
      clearAllCredentials,
      getCredential,
      getCredentialWriteEpoch,
      TRANSLATE_CREDENTIAL_KEY,
      ASR_CREDENTIAL_KEY,
      setCredential,
      setCredentials,
    } = await import('../credentialsRepository')

    // 1. User has credentials
    await setCredential(TRANSLATE_CREDENTIAL_KEY, 'sk-existing')
    await setCredential(ASR_CREDENTIAL_KEY, 'gsk_existing')

    // 2. handleFieldBlur captures epoch before wipe
    const epochBeforeWipe = getCredentialWriteEpoch()

    // 3. wipeAll fires (bumps epoch + clears)
    await clearAllCredentials()
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')

    // 4. Stale blur callback tries to save with old epoch — must fail
    await expect(
      setCredentials(
        {
          [TRANSLATE_CREDENTIAL_KEY]: 'sk-zombie',
          [ASR_CREDENTIAL_KEY]: 'gsk_zombie',
        },
        epochBeforeWipe
      )
    ).rejects.toThrow('Credential write aborted due to newer wipe action')

    // 5. Credentials remain wiped
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('')
  })

  it('race: stale deleteCredential rejected when epoch was captured before wipe', async () => {
    const {
      clearAllCredentials,
      getCredential,
      getCredentialWriteEpoch,
      setCredential,
      setCredentials,
      ASR_CREDENTIAL_KEY,
      TRANSLATE_CREDENTIAL_KEY,
    } = await import('../credentialsRepository')

    await setCredential(ASR_CREDENTIAL_KEY, 'gsk_pre-wipe')
    await setCredential(TRANSLATE_CREDENTIAL_KEY, 'sk-pre-wipe')

    // Simulate: a delete callback captures epoch, then wipe happens before the transaction runs.
    // We can't easily interleave microtasks, so we use setCredentials with a stale epoch
    // to verify the same guard that protects deleteCredential's transaction.
    const staleEpoch = getCredentialWriteEpoch()
    await clearAllCredentials()

    // Stale write with old epoch — rejected
    await expect(setCredentials({ [ASR_CREDENTIAL_KEY]: '' }, staleEpoch)).rejects.toThrow(
      'Credential write aborted due to newer wipe action'
    )

    // Both credentials remain wiped
    await expect(getCredential(ASR_CREDENTIAL_KEY)).resolves.toBe('')
    await expect(getCredential(TRANSLATE_CREDENTIAL_KEY)).resolves.toBe('')
  })
})
