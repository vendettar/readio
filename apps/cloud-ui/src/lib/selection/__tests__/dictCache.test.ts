import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DictEntry } from '../types'

type PersistedPayload = {
  key: string
  data: Record<string, DictEntry>
}

const {
  getRuntimeCacheEntryMock,
  setRuntimeCacheEntryMock,
  deleteRuntimeCacheEntryMock,
  initLookupHighlightMock,
} = vi.hoisted(() => ({
  getRuntimeCacheEntryMock: vi.fn(),
  setRuntimeCacheEntryMock: vi.fn(async () => {}),
  deleteRuntimeCacheEntryMock: vi.fn(async () => {}),
  initLookupHighlightMock: vi.fn(() => true),
}))

vi.mock('../../dexieDb', () => ({
  DB: {
    getRuntimeCacheEntry: getRuntimeCacheEntryMock,
    setRuntimeCacheEntry: setRuntimeCacheEntryMock,
    deleteRuntimeCacheEntry: deleteRuntimeCacheEntryMock,
  },
}))

vi.mock('../../runtimeConfig', () => ({
  getAppConfig: () =>
    ({
      DICT_CACHE_KEY: 'readio:dict-cache',
      DICT_CACHE_MAX_ENTRIES: 100,
    }) as unknown,
}))

vi.mock('../../highlightManager', () => ({
  initLookupHighlight: initLookupHighlightMock,
  highlightWordInSubtitles: vi.fn(),
  rebuildHighlights: vi.fn(() => 0),
}))

vi.mock('../../logger', () => ({
  error: vi.fn(),
}))

function makeEntry(word: string): DictEntry {
  return {
    word,
    phonetic: `/${word}/`,
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [{ definition: `${word} definition` }],
      },
    ],
  }
}

describe('dictCache startup write safety', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('waits for initial hydrate before first persist to avoid overwriting existing cache', async () => {
    let resolveHydrate: (value: unknown) => void = () => {}
    const hydratePromise = new Promise((resolve) => {
      resolveHydrate = resolve
    })
    getRuntimeCacheEntryMock.mockReturnValueOnce(hydratePromise)

    const dictCache = await import('../dictCache')
    dictCache.loadDictCache()
    dictCache.setCachedEntry('new-word', makeEntry('new-word'))

    expect(setRuntimeCacheEntryMock).not.toHaveBeenCalled()

    resolveHydrate({
      key: 'readio:dict-cache',
      namespace: 'readioDictionaryCacheV1',
      at: Date.now() - 1000,
      data: {
        'existing-word': makeEntry('existing-word'),
      },
    })

    await vi.waitFor(() => {
      expect(setRuntimeCacheEntryMock).toHaveBeenCalledTimes(1)
    })

    const calls = setRuntimeCacheEntryMock.mock.calls as unknown[][]
    expect(calls.length).toBeGreaterThan(0)
    const persistedPayload = calls[0][0] as PersistedPayload
    expect(persistedPayload.key).toBe('readio:dict-cache')
    expect(Object.keys(persistedPayload.data).sort()).toEqual(['existing-word', 'new-word'])
  })

  it('cancels queued stale writes after clear and removes persisted cache key', async () => {
    let resolveHydrate: (value: unknown) => void = () => {}
    const hydratePromise = new Promise((resolve) => {
      resolveHydrate = resolve
    })
    getRuntimeCacheEntryMock.mockReturnValueOnce(hydratePromise)

    const dictCache = await import('../dictCache')
    dictCache.loadDictCache()
    dictCache.setCachedEntry('new-word', makeEntry('new-word'))

    const clearPromise = dictCache.clearDictCacheMemory()
    expect(setRuntimeCacheEntryMock).not.toHaveBeenCalled()

    resolveHydrate({
      key: 'readio:dict-cache',
      namespace: 'readioDictionaryCacheV1',
      at: Date.now() - 1000,
      data: {
        'existing-word': makeEntry('existing-word'),
      },
    })

    await clearPromise

    expect(setRuntimeCacheEntryMock).not.toHaveBeenCalled()
    expect(deleteRuntimeCacheEntryMock).toHaveBeenCalledWith('readio:dict-cache')
    expect(dictCache.getCachedEntry('existing-word')).toBeUndefined()
    expect(dictCache.getCachedEntry('new-word')).toBeUndefined()
  })
})
