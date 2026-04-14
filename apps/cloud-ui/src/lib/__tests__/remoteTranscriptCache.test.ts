import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../dexieDb'
import {
  __resetRemoteTranscriptStateForTests,
  deriveRemoteTranscriptCacheId,
  loadRemoteTranscriptWithCache,
  normalizeTranscriptUrl,
  readRemoteTranscriptCache,
} from '../remoteTranscript'
import { parseSubtitles } from '../subtitles'

const { fetchTextWithFallbackMock } = vi.hoisted(() => ({
  fetchTextWithFallbackMock: vi.fn(),
}))

vi.mock('../fetchUtils', () => ({
  CLOUD_BACKEND_FALLBACK_CLASSES: {
    TRANSCRIPT: 'transcript',
  },
  fetchTextWithFallback: fetchTextWithFallbackMock,
}))

vi.mock('../logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

const DAY_MS = 24 * 60 * 60 * 1000

function makeSrt(text: string): string {
  return `1
00:00:00,000 --> 00:00:02,000
${text}
`
}

async function seedTranscript(url: string, content: string, fetchedAt: number): Promise<void> {
  const normalizedUrl = normalizeTranscriptUrl(url)
  await DB.upsertRemoteTranscript({
    id: deriveRemoteTranscriptCacheId(normalizedUrl),
    url: normalizedUrl,
    cues: parseSubtitles(content),
    cueSchemaVersion: 1,
    fetchedAt,
    cueCount: 1,
    source: 'podcast-transcript',
  })
}

async function flushBackgroundWork(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 20))
}

describe('remoteTranscript cache behavior', () => {
  beforeEach(async () => {
    fetchTextWithFallbackMock.mockReset()
    __resetRemoteTranscriptStateForTests()
    await DB.clearAllData()
  })

  it('returns miss when no cache exists', async () => {
    const result = await readRemoteTranscriptCache('https://example.com/miss.srt')
    expect(result.status).toBe('miss')
    expect(result.cues).toEqual([])
  })

  it('returns fresh cache and skips network fetch', async () => {
    const url = 'https://example.com/fresh.srt'
    await seedTranscript(url, makeSrt('Fresh cue'), Date.now())

    const result = await loadRemoteTranscriptWithCache(url)

    expect(result.ok).toBe(true)
    expect(result.status).toBe('fresh')
    expect(result.source).toBe('cache')
    expect(result.cues[0]?.text).toBe('Fresh cue')
    expect(fetchTextWithFallbackMock).not.toHaveBeenCalled()
  })

  it('serves from memory cache without touching DB or network', async () => {
    const url = 'https://example.com/memory-hit.srt'
    fetchTextWithFallbackMock.mockResolvedValueOnce(makeSrt('Memory cue'))

    const first = await loadRemoteTranscriptWithCache(url)
    expect(first.ok).toBe(true)
    expect(first.source).toBe('network')

    const dbGetSpy = vi.spyOn(DB, 'getRemoteTranscriptByUrl')
    fetchTextWithFallbackMock.mockReset()

    const second = await loadRemoteTranscriptWithCache(url)
    expect(second.ok).toBe(true)
    expect(second.source).toBe('cache')
    expect(second.cues[0]?.text).toBe('Memory cue')
    expect(dbGetSpy).not.toHaveBeenCalled()
    expect(fetchTextWithFallbackMock).not.toHaveBeenCalled()

    dbGetSpy.mockRestore()
  })

  it('hydrates memory on DB hit and uses memory on next read', async () => {
    const url = 'https://example.com/db-then-memory.srt'
    await seedTranscript(url, makeSrt('DB cue'), Date.now())

    const dbGetSpy = vi.spyOn(DB, 'getRemoteTranscriptByUrl')

    const first = await loadRemoteTranscriptWithCache(url)
    expect(first.ok).toBe(true)
    expect(first.source).toBe('cache')
    expect(dbGetSpy).toHaveBeenCalledTimes(1)
    expect(fetchTextWithFallbackMock).not.toHaveBeenCalled()

    dbGetSpy.mockClear()
    fetchTextWithFallbackMock.mockReset()

    const second = await loadRemoteTranscriptWithCache(url)
    expect(second.ok).toBe(true)
    expect(second.source).toBe('cache')
    expect(second.cues[0]?.text).toBe('DB cue')
    expect(dbGetSpy).not.toHaveBeenCalled()
    expect(fetchTextWithFallbackMock).not.toHaveBeenCalled()

    dbGetSpy.mockRestore()
  })

  it('returns stale cache immediately and revalidates in background', async () => {
    const url = 'https://example.com/stale.srt'
    await seedTranscript(url, makeSrt('Old cue'), Date.now() - (DAY_MS + 1))
    fetchTextWithFallbackMock.mockResolvedValueOnce(makeSrt('Fresh cue'))

    const result = await loadRemoteTranscriptWithCache(url)

    expect(result.ok).toBe(true)
    expect(result.status).toBe('stale')
    expect(result.source).toBe('cache')
    expect(result.cues[0]?.text).toBe('Old cue')

    await flushBackgroundWork()
    expect(fetchTextWithFallbackMock).toHaveBeenCalledTimes(1)

    const cached = await DB.getRemoteTranscriptByUrl(normalizeTranscriptUrl(url))
    expect(cached?.cues[0].text).toContain('Fresh cue')
  })

  it('keeps stale cache when background revalidation fails', async () => {
    const url = 'https://example.com/stale-fail.srt'
    await seedTranscript(url, makeSrt('Old cue'), Date.now() - (DAY_MS + 1))
    fetchTextWithFallbackMock.mockRejectedValueOnce(new Error('network down'))

    const result = await loadRemoteTranscriptWithCache(url)
    expect(result.ok).toBe(true)
    expect(result.status).toBe('stale')
    expect(result.cues[0]?.text).toBe('Old cue')

    await flushBackgroundWork()
    const cached = await DB.getRemoteTranscriptByUrl(normalizeTranscriptUrl(url))
    expect(cached?.cues[0].text).toContain('Old cue')
  })

  it('writes parsed network payload on cache miss', async () => {
    const url = 'https://example.com/network.srt'
    fetchTextWithFallbackMock.mockResolvedValueOnce(makeSrt('Network cue'))

    const result = await loadRemoteTranscriptWithCache(url)
    expect(result.ok).toBe(true)
    expect(result.source).toBe('network')
    expect(result.cues[0]?.text).toBe('Network cue')
    expect(fetchTextWithFallbackMock).toHaveBeenCalledWith(normalizeTranscriptUrl(url), {
      signal: undefined,
      expectXml: false,
      cloudBackendFallbackClass: 'transcript',
    })

    const cached = await DB.getRemoteTranscriptByUrl(normalizeTranscriptUrl(url))
    expect(cached).toBeDefined()
    expect(cached?.cues[0].text).toContain('Network cue')
  })

  it('evicts over-age entries only on write path, not read path', async () => {
    const oldUrl = 'https://example.com/old.srt'
    await seedTranscript(oldUrl, makeSrt('Old transcript'), Date.now() - 31 * DAY_MS)

    const staleRead = await readRemoteTranscriptCache(oldUrl)
    expect(staleRead.status).toBe('stale')
    expect(await DB.getRemoteTranscriptByUrl(normalizeTranscriptUrl(oldUrl))).toBeDefined()

    fetchTextWithFallbackMock.mockResolvedValueOnce(makeSrt('Fresh transcript'))
    await loadRemoteTranscriptWithCache('https://example.com/new.srt')

    expect(await DB.getRemoteTranscriptByUrl(normalizeTranscriptUrl(oldUrl))).toBeUndefined()
  })
})
