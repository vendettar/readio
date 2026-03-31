import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AudioPrefetchScheduler,
  PREFETCH_BASE_INTERVAL_MS,
  PREFETCH_DEFAULT_WINDOW_SECONDS,
  PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC,
  PREFETCH_MAX_BACKOFF_MS,
  PREFETCH_SLOW3G_WINDOW_SECONDS,
} from '../audioPrefetch'
import { __resetCloudBackendBreakerForTests } from '../fetchUtils'

function createAudio(currentTime: number, rangeStart: number, rangeEnd: number, duration = 600) {
  const buffered = {
    length: 1,
    start: vi.fn(() => rangeStart),
    end: vi.fn(() => rangeEnd),
  } as unknown as TimeRanges

  return {
    currentTime,
    duration,
    buffered,
  } as HTMLAudioElement
}

function getRangeHeader(init: RequestInit | undefined): string {
  const headers = init?.headers
  if (!headers) return ''
  if (headers instanceof Headers) {
    return headers.get('Range') ?? headers.get('range') ?? ''
  }
  if (Array.isArray(headers)) {
    const found = headers.find(([key]) => key.toLowerCase() === 'range')
    return found?.[1] ?? ''
  }
  return (
    (headers as Record<string, string>).Range ?? (headers as Record<string, string>).range ?? ''
  )
}

describe('AudioPrefetchScheduler', () => {
  beforeEach(() => {
    __resetCloudBackendBreakerForTests()
  })

  it('prefetches only remote http sources and requests forward range', async () => {
    const now = 1_000
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(getRangeHeader(init)).toMatch(/^bytes=\d+-\d+$/)
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 900001-1200000/12000000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)

    await scheduler.maybePrefetch({
      sourceId: 'blob:local-audio',
      sourceUrl: 'blob:local-audio',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('disables prefetch on saveData/2g and degrades to 15s window on 3g', async () => {
    const now = 1_000
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const range = getRangeHeader(init)
      expect(range).toContain('bytes=')
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 960001-1943039/12000000',
        },
      })
    })

    const schedulerDisabled = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ saveData: true, effectiveType: '4g' }),
    })

    await schedulerDisabled.maybePrefetch({
      sourceId: 'https://example.com/a.mp3',
      sourceUrl: 'https://example.com/a.mp3',
      audio: createAudio(8, 0, 12),
    })
    expect(fetchMock).toHaveBeenCalledTimes(0)

    const scheduler3g = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '3g' }),
    })

    await scheduler3g.maybePrefetch({
      sourceId: 'https://example.com/b.mp3',
      sourceUrl: 'https://example.com/b.mp3',
      audio: createAudio(8, 0, 14),
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const range = getRangeHeader(init)
    const [, values] = range.split('=')
    const [startRaw, endRaw] = values.split('-')
    const requestedBytes = Number(endRaw) - Number(startRaw) + 1

    // 3g uses 15s window before clamp. Fallback bitrate is 64KB/s => 983,040 bytes.
    expect(requestedBytes).toBe(
      PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC * PREFETCH_SLOW3G_WINDOW_SECONDS
    )
  })

  it('enforces hysteresis and interval floor between attempts', async () => {
    let now = 10_000
    const fetchMock = vi.fn(
      async (_url?: string, _init?: RequestInit) =>
        new Response('', {
          status: 206,
          headers: {
            'content-range': 'bytes 900001-1200000/12000000',
          },
        })
    )

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(8, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Still below threshold and not re-armed => no repeat.
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(9, 0, 15),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Re-arm only after >= 25s.
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(9, 0, 40),
    })

    now += PREFETCH_BASE_INTERVAL_MS - 1
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(20, 0, 24),
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    now += 1
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/episode.mp3',
      sourceUrl: 'https://example.com/episode.mp3',
      audio: createAudio(20, 0, 24),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('applies capped failure backoff 9s -> 18s -> 36s and resets on success', async () => {
    let now = 1_000
    let shouldFail = true

    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
      if (shouldFail) {
        if (input === 'https://example.com/e.mp3') {
          return new Response('', { status: 500 })
        }
        if (input === '/api/proxy') {
          return new Response('', { status: 502 })
        }
      }
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 900001-1200000/12000000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    const rearm = async () => {
      await scheduler.maybePrefetch({
        sourceId: 'https://example.com/e.mp3',
        sourceUrl: 'https://example.com/e.mp3',
        audio: createAudio(10, 0, 40),
      })
    }

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/e.mp3',
      sourceUrl: 'https://example.com/e.mp3',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://example.com/e.mp3')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/proxy')
    expect(scheduler.getState().consecutiveFailures).toBe(1)

    await rearm()
    now += PREFETCH_BASE_INTERVAL_MS
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/e.mp3',
      sourceUrl: 'https://example.com/e.mp3',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    now += PREFETCH_BASE_INTERVAL_MS
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/e.mp3',
      sourceUrl: 'https://example.com/e.mp3',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(fetchMock.mock.calls[2]?.[0]).toBe('https://example.com/e.mp3')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('/api/proxy')
    expect(scheduler.getState().consecutiveFailures).toBe(2)

    await rearm()
    now += PREFETCH_BASE_INTERVAL_MS
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/e.mp3',
      sourceUrl: 'https://example.com/e.mp3',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(4)

    now += PREFETCH_MAX_BACKOFF_MS - PREFETCH_BASE_INTERVAL_MS
    shouldFail = false
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/e.mp3',
      sourceUrl: 'https://example.com/e.mp3',
      audio: createAudio(10, 0, 14),
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(fetchMock.mock.calls[4]?.[0]).toBe('/api/proxy')
    expect(scheduler.getState().consecutiveFailures).toBe(0)
  })

  it('aborts inflight prefetch on source switch and treats non-206 as silent failure', async () => {
    const now = 1_000

    const pendingFetch = new Promise<Response>(() => {})
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      () => pendingFetch
    )

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    void scheduler.maybePrefetch({
      sourceId: 'https://example.com/old.mp3',
      sourceUrl: 'https://example.com/old.mp3',
      audio: createAudio(10, 0, 14),
    })

    scheduler.resetForSource('https://example.com/new.mp3')
    const inflightInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined
    expect(inflightInit?.signal).toBeTruthy()
    expect((inflightInit?.signal as AbortSignal).aborted).toBe(true)

    const fetchNonRange = vi.fn(async () => new Response('', { status: 200 }))
    const schedulerNoRange = new AudioPrefetchScheduler({
      fetchImpl: fetchNonRange as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await schedulerNoRange.maybePrefetch({
      sourceId: 'https://example.com/no-range.mp3',
      sourceUrl: 'https://example.com/no-range.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(schedulerNoRange.getState().consecutiveFailures).toBe(1)
  })

  it('falls back to Cloud backend proxy for direct range fetch failures', async () => {
    const now = 1_000
    const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === 'https://example.com/fallback.mp3') {
        throw new TypeError('Failed to fetch')
      }

      if (input === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          url: string
          method: string
          headers?: Record<string, string>
        }
        expect(body.url).toBe('https://example.com/fallback.mp3')
        expect(body.method).toBe('GET')
        expect(body.headers?.Range).toMatch(/^bytes=\d+-\d+$/)
        return new Response('', {
          status: 206,
          headers: {
            'content-range': 'bytes 100-599/12000000',
          },
        })
      }

      throw new Error(`unexpected fetch target: ${input}`)
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/fallback.mp3',
      sourceUrl: 'https://example.com/fallback.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(scheduler.getState().consecutiveFailures).toBe(0)
  })

  it('treats proxied 416 as EOF and stops further prefetch attempts for the source', async () => {
    let now = 1_000
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
      if (input === 'https://example.com/eof.mp3') {
        throw new TypeError('Failed to fetch')
      }

      if (input === '/api/proxy') {
        return new Response('', {
          status: 416,
          headers: {
            'content-range': 'bytes */1000',
          },
        })
      }

      throw new Error(`unexpected fetch target: ${input}`)
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/eof.mp3',
      sourceUrl: 'https://example.com/eof.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(scheduler.getState().consecutiveFailures).toBe(0)

    now += PREFETCH_MAX_BACKOFF_MS
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/eof.mp3',
      sourceUrl: 'https://example.com/eof.mp3',
      audio: createAudio(10, 0, 40),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('clamps rangeEnd to knownTotalBytes on short files to prevent 416', async () => {
    let now = 1_000
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => {
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 0-262143/400000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    // First fetch: returns 206 with total=400000, sets knownTotalBytes
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(3, 0, 5),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Re-arm (>= 25s ahead) and advance past interval
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(10, 0, 40),
    })
    now += PREFETCH_MAX_BACKOFF_MS

    // Third call: buffered tail at 6s → rangeStart = 393216 (still < 400000)
    // bytesTarget = 1966080 → without clamp: rangeEnd = 2359295 >> 400000 (would 416)
    // With clamp: rangeEnd = 399999
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(5, 0, 6),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    const range = getRangeHeader(init)
    expect(range).toBe('bytes=393217-399999')
  })

  it('uses x-total-bytes URL hint to bound the first near-EOF prefetch', async () => {
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => {
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 393217-399999/400000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => 1_000,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3?x-total-bytes=400000',
      sourceUrl: 'https://example.com/short.mp3?x-total-bytes=400000',
      audio: createAudio(5, 0, 6),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const range = getRangeHeader(init)
    expect(range).toBe('bytes=393217-399999')
  })

  it('clamps after learning total from 206 to prevent future overshoot', async () => {
    let now = 1_000
    let callCount = 0

    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => {
      callCount++
      if (callCount === 1) {
        // First fetch: partial content, learn total=400000
        return new Response('', {
          status: 206,
          headers: {
            'content-range': 'bytes 0-262143/400000',
          },
        })
      }
      // Second fetch: should be clamped, return content
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 393217-399999/400000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    // First fetch: learns total=400000
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(3, 0, 5),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(scheduler.getState().consecutiveFailures).toBe(0)

    // Re-arm (>= 25s ahead) and advance past interval
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(10, 0, 40),
    })
    now += PREFETCH_MAX_BACKOFF_MS

    // Third call: tail at 6s, would overshoot without clamp
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/short.mp3',
      sourceUrl: 'https://example.com/short.mp3',
      audio: createAudio(5, 0, 6),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    // Verify it was clamped, not a 416
    expect(scheduler.getState().consecutiveFailures).toBe(0)
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    const range = getRangeHeader(init)
    expect(range).toBe('bytes=393217-399999')
  })

  it('does not clamp rangeEnd for large files', async () => {
    const now = 1_000
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => {
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 0-262143/12000000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/large.mp3',
      sourceUrl: 'https://example.com/large.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    // For large files, rangeEnd should not be clamped — full window used
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const range = getRangeHeader(init)
    const [, values] = range.split('=')
    const [startRaw, endRaw] = values.split('-')
    const requestedBytes = Number(endRaw) - Number(startRaw) + 1
    expect(requestedBytes).toBe(
      PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC * PREFETCH_DEFAULT_WINDOW_SECONDS
    )
  })

  it('skips prefetch once known total size proves the next range would be out of bounds', async () => {
    let now = 1_000
    const fetchMock = vi.fn(async (_url?: string, _init?: RequestInit) => {
      return new Response('', {
        status: 206,
        headers: {
          'content-range': 'bytes 900-999/1000',
        },
      })
    })

    const scheduler = new AudioPrefetchScheduler({
      fetchImpl: fetchMock as unknown as typeof fetch,
      now: () => now,
      getConnection: () => ({ effectiveType: '4g' }),
    })

    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/bounded.mp3',
      sourceUrl: 'https://example.com/bounded.mp3',
      audio: createAudio(10, 0, 14),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)

    now += PREFETCH_MAX_BACKOFF_MS
    await scheduler.maybePrefetch({
      sourceId: 'https://example.com/bounded.mp3',
      sourceUrl: 'https://example.com/bounded.mp3',
      audio: createAudio(10, 0, 40),
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
