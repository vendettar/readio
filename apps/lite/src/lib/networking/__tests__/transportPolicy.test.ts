import { describe, expect, it, vi } from 'vitest'
import { executeWithRetry } from '../transportPolicy'

describe('executeWithRetry', () => {
  it('returns result on success', async () => {
    const fn = vi.fn().mockResolvedValue('success')
    const classifyError = vi.fn()

    const result = await executeWithRetry(fn, { classifyError })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries when classifyError returns retry: true', async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('success')

    const classifyError = vi.fn().mockReturnValue({ retry: true, delayMs: 1 })

    const result = await executeWithRetry(fn, { classifyError })

    expect(result).toBe('success')
    expect(fn).toHaveBeenCalledTimes(2)
    expect(classifyError).toHaveBeenCalledTimes(1)
  })

  it('respects Retry-After or custom delay', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('rate_limit'))
      .mockResolvedValueOnce('success')

    const classifyError = vi.fn((err) => {
      if (err.message === 'rate_limit') {
        return { retry: true, delayMs: 10, reason: '429' }
      }
      return { retry: false, delayMs: 0 }
    })

    const start = Date.now()
    await executeWithRetry(fn, { classifyError })
    const elapsed = Date.now() - start

    expect(fn).toHaveBeenCalledTimes(2)
    // Node.js setTimeout is imprecise, and might resolve slightly earlier than exact target
    expect(elapsed).toBeGreaterThanOrEqual(8)
  })

  it('aborts when classifyError returns retry: false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent'))
    const classifyError = vi.fn().mockReturnValue({ retry: false, delayMs: 0 })

    await expect(executeWithRetry(fn, { classifyError })).rejects.toThrow('permanent')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('respects AbortSignal', async () => {
    const controller = new AbortController()
    const fn = vi.fn().mockImplementation(async (signal) => {
      return new Promise((_, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('Aborted')), { once: true })
      })
    })

    const promise = executeWithRetry(fn, {
      signal: controller.signal,
      classifyError: () => ({ retry: true, delayMs: 1000 }),
    })

    controller.abort()
    await expect(promise).rejects.toThrow(/Aborted|AbortError/)
  })

  it('stops retrying if reached limit in classifier', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const classifyError = vi.fn((_err, { attempt }) => {
      return { retry: attempt < 2, delayMs: 1 }
    })

    await expect(executeWithRetry(fn, { classifyError })).rejects.toThrow('fail')
    expect(fn).toHaveBeenCalledTimes(3) // 0, 1, 2
  })
})
