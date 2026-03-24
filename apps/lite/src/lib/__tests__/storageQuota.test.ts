import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  QUOTA_BLOCK_THRESHOLD,
  QUOTA_HARD_BLOCK_THRESHOLD,
  QUOTA_WARNING_THRESHOLD,
} from '../../constants/storageQuota'
import { DB } from '../dexieDb'
import {
  checkStorageQuota,
  computeQuotaPercentage,
  evaluateUploadGuardrails,
  shouldBlockUpload,
  shouldWarnOnCrossing,
} from '../storageQuota'
import { toast } from '../toast'

vi.mock('../runtimeConfig', () => ({
  getAppConfig: () => ({ MAX_AUDIO_CACHE_GB: 1 }),
}))

vi.mock('../toast', () => ({
  toast: {
    warningKey: vi.fn(),
    infoKey: vi.fn(),
    errorKey: vi.fn(),
  },
}))

type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

const createDeferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('storage quota checks', () => {
  beforeEach(() => {
    sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('fires warning toast when crossing 80%', async () => {
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: {
        usage: 90,
        quota: 100,
        available: 10,
        percentage: 90,
      },
    })

    sessionStorage.setItem('readio-lite:quota-last-percent', JSON.stringify(79))
    sessionStorage.setItem('readio-lite:quota-warned', JSON.stringify(false))

    await checkStorageQuota()

    expect(toast.warningKey).toHaveBeenCalledWith('storageQuotaWarning')
  })

  it('does not emit warning toast in silent mode', async () => {
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: {
        usage: 90,
        quota: 100,
        available: 10,
        percentage: 90,
      },
    })

    sessionStorage.setItem('readio-lite:quota-last-percent', JSON.stringify(79))
    sessionStorage.setItem('readio-lite:quota-warned', JSON.stringify(false))

    await checkStorageQuota({ mode: 'silent' })

    expect(toast.warningKey).not.toHaveBeenCalledWith('storageQuotaWarning')
  })

  it('dedupes concurrent in-flight quota checks', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof DB.getStorageInfo>>>()
    const getStorageInfoSpy = vi.spyOn(DB, 'getStorageInfo').mockReturnValueOnce(deferred.promise)

    const check1 = checkStorageQuota()
    const check2 = checkStorageQuota()

    expect(getStorageInfoSpy).toHaveBeenCalledTimes(1)

    deferred.resolve({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: {
        usage: 20,
        quota: 100,
        available: 80,
        percentage: 20,
      },
    })

    await Promise.all([check1, check2])
    expect(getStorageInfoSpy).toHaveBeenCalledTimes(1)
  })

  it('keeps existing mode-mix semantics for in-flight checks', async () => {
    const deferred = createDeferred<Awaited<ReturnType<typeof DB.getStorageInfo>>>()
    const getStorageInfoSpy = vi.spyOn(DB, 'getStorageInfo').mockReturnValueOnce(deferred.promise)

    sessionStorage.setItem('readio-lite:quota-last-percent', JSON.stringify(79))
    sessionStorage.setItem('readio-lite:quota-warned', JSON.stringify(false))

    const silentFirst = checkStorageQuota({ mode: 'silent' })
    const userSecond = checkStorageQuota({ mode: 'user' })

    expect(getStorageInfoSpy).toHaveBeenCalledTimes(1)

    deferred.resolve({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: {
        usage: 90,
        quota: 100,
        available: 10,
        percentage: 90,
      },
    })

    await Promise.all([silentFirst, userSecond])

    expect(getStorageInfoSpy).toHaveBeenCalledTimes(1)
    expect(toast.warningKey).not.toHaveBeenCalledWith('storageQuotaWarning')
  })

  it('blocks upload when audio cache exceeds cap', async () => {
    const capBytes = 1 * 1024 * 1024 * 1024
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: capBytes - 5,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: capBytes - 5,
      },
      browser: null,
    })

    const file = new File([new ArrayBuffer(10)], 'test.mp3', { type: 'audio/mpeg' })
    const result = await evaluateUploadGuardrails([file])

    expect(result.blocked).toBe(true)
    expect(typeof result.blocked).toBe('boolean')
    expect(toast.errorKey).toHaveBeenCalledWith('storageQuotaUploadBlocked')
  })

  it('allows upload when quota is unavailable (best-effort mode)', async () => {
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: null,
    })

    const file = new File([new ArrayBuffer(10)], 'test.mp3', { type: 'audio/mpeg' })
    const result = await evaluateUploadGuardrails([file])

    expect(result.blocked).toBe(false)
    expect(typeof result.blocked).toBe('boolean')
    expect(toast.errorKey).not.toHaveBeenCalledWith('storageQuotaUploadBlocked')
  })
})

describe('storage quota constants', () => {
  it('uses expected thresholds', () => {
    expect(QUOTA_WARNING_THRESHOLD).toBe(0.8)
    expect(QUOTA_BLOCK_THRESHOLD).toBe(0.85)
    expect(QUOTA_HARD_BLOCK_THRESHOLD).toBe(0.95)
  })
})

describe('storage quota helpers', () => {
  it('computes percentage safely', () => {
    expect(computeQuotaPercentage(50, 100)).toBe(50)
    expect(computeQuotaPercentage(0, 0)).toBe(0)
  })

  it('warns only on first crossing', () => {
    expect(shouldWarnOnCrossing(81, 79, false)).toBe(true)
    expect(shouldWarnOnCrossing(81, 81, false)).toBe(false)
    expect(shouldWarnOnCrossing(81, 79, true)).toBe(false)
  })

  it('blocks upload based on thresholds', () => {
    expect(shouldBlockUpload(85, 100, 1)).toBe(true)
    expect(shouldBlockUpload(80, 100, 16)).toBe(true)
    expect(shouldBlockUpload(80, 100, 10)).toBe(false)
  })
})
