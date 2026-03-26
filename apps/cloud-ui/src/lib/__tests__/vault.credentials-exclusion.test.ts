import { beforeEach, describe, expect, it } from 'vitest'
import { DB, db } from '../dexieDb'
import { exportVault, importVault } from '../vault'

describe('vault credential exclusion', () => {
  beforeEach(async () => {
    await DB.clearAllData()
  })

  it('excludes credentials table content from exported vault payload', async () => {
    await db.credentials.put({
      key: 'provider_openai_key',
      value: 'sk-secret-export',
      updatedAt: Date.now(),
    })

    const vault = await exportVault()
    const serialized = JSON.stringify(vault)

    expect(serialized).not.toContain('provider_openai_key')
    expect(serialized).not.toContain('sk-secret-export')
    expect(serialized).not.toMatch(/provider_[a-z0-9_]+_key/)
  })

  it('does not import or overwrite credentials table from vault input', async () => {
    await db.credentials.put({
      key: 'provider_groq_key',
      value: 'gsk_existing',
      updatedAt: Date.now(),
    })

    const vault = await exportVault()
    const withCredentialPayload = {
      ...vault,
      data: {
        ...vault.data,
        credentials: [
          {
            key: 'provider_groq_key',
            value: 'gsk_imported',
            updatedAt: Date.now(),
          },
        ],
      },
    }

    await importVault(withCredentialPayload)
    const credential = await db.credentials.get('provider_groq_key')
    expect(credential?.value).toBe('gsk_existing')
  })
})
