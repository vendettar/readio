import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as runtimeConfig from '../runtimeConfig'

// Mock runtimeConfig BEFORE importing downloadCapacity or dexieDb
vi.mock('../runtimeConfig', () => ({
  getAppConfig: vi.fn(() => ({
    DB_NAME: 'test-db',
    MAX_AUDIO_CACHE_GB: 10,
  })),
  isRuntimeConfigReady: vi.fn(() => true),
}))

import { db } from '../dexieDb'
import { checkDownloadCapacity } from '../downloadCapacity'

describe('downloadCapacity', () => {
  beforeAll(() => {
    // Mock navigator.storage
    Object.defineProperty(global.navigator, 'storage', {
      value: {
        estimate: vi.fn(),
      },
      configurable: true,
    })
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await db.audioBlobs.clear()
    vi.mocked(runtimeConfig.getAppConfig).mockReturnValue({
      DB_NAME: 'test-db',
      MAX_AUDIO_CACHE_GB: 10,
    } as ReturnType<typeof runtimeConfig.getAppConfig>)
  })

  it('allows when within cap and space is sufficient', async () => {
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: 1000,
      usage: 100,
    })

    const result = await checkDownloadCapacity(50)
    expect(result.allowed).toBe(true)
  })

  it('blocks when remaining physical space is zero or negative (P2 fix)', async () => {
    // Case 1: Exactly zero
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: 100,
      usage: 100,
    })
    let result = await checkDownloadCapacity(50)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('physical_quota_insufficient')

    // Case 2: Negative (some browsers might report weird numbers)
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: 100,
      usage: 110,
    })
    result = await checkDownloadCapacity(1)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('physical_quota_insufficient')
  })

  it('blocks unknown size when space is critically low (P2 fix)', async () => {
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: 1024 * 1024 * 10, // 10MB total
      usage: 1024 * 1024 * 6, // 4MB remaining (< 5MB threshold)
    })

    const result = await checkDownloadCapacity(null)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('physical_quota_insufficient')
  })

  it('allows unknown size when space is above critical threshold', async () => {
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: 1024 * 1024 * 10, // 10MB total
      usage: 1024 * 1024 * 4, // 6MB remaining (> 5MB threshold)
    })

    const result = await checkDownloadCapacity(null)
    expect(result.allowed).toBe(true)
  })

  it('blocks when current usage exceeds MAX_AUDIO_CACHE_GB', async () => {
    vi.mocked(runtimeConfig.getAppConfig).mockReturnValue({
      DB_NAME: 'test-db',
      MAX_AUDIO_CACHE_GB: 0.000001, // ~1KB
    } as ReturnType<typeof runtimeConfig.getAppConfig>)

    await db.audioBlobs.add({
      id: 'blob1',
      size: 2048,
      blob: new Blob(['a'.repeat(2048)]),
      filename: 'test.mp3',
      storedAt: Date.now(),
      type: 'audio/mpeg',
    })

    const result = await checkDownloadCapacity(10)
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('over_cap')
  })

  it('allows download if physical estimate fields are missing or non-finite', async () => {
    // Missing fields
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: undefined,
      usage: 100,
    })
    let result = await checkDownloadCapacity(50)
    expect(result.allowed).toBe(true)

    // Non-finite fields
    vi.mocked(navigator.storage.estimate).mockResolvedValue({
      quota: Number.POSITIVE_INFINITY,
      usage: 100,
    })
    result = await checkDownloadCapacity(50)
    expect(result.allowed).toBe(true)
  })
})
