import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  abortAllRequests,
  deduplicatedFetchWithCallerAbort,
  getRequestKey,
} from '../requestManager'

describe('requestManager caller-abort helpers', () => {
  afterEach(() => {
    abortAllRequests()
  })

  it('keeps shared request alive when one caller aborts', async () => {
    const firstCaller = new AbortController()
    const secondCaller = new AbortController()
    let fetchCount = 0

    const key = getRequestKey('https://example.com/resource')
    const fetcher = (_signal: AbortSignal) => {
      fetchCount += 1
      return new Promise<string>((resolve) => {
        setTimeout(() => resolve('ok'), 20)
      })
    }

    const firstPromise = deduplicatedFetchWithCallerAbort(key, firstCaller.signal, fetcher)
    const secondPromise = deduplicatedFetchWithCallerAbort(key, secondCaller.signal, fetcher)

    firstCaller.abort()

    await expect(firstPromise).rejects.toMatchObject({ name: 'AbortError' })
    await expect(secondPromise).resolves.toBe('ok')
    expect(fetchCount).toBe(1)
  })

  it('rejects immediately when caller signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn((_signal: AbortSignal) => Promise.resolve('ok'))

    await expect(
      deduplicatedFetchWithCallerAbort(
        'GET:https://example.com/already-aborted',
        controller.signal,
        fetcher
      )
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })
})
