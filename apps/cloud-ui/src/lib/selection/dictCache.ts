import { DB } from '../dexieDb'
import {
  highlightWordInSubtitles,
  initLookupHighlight,
  rebuildHighlights,
} from '../highlightManager'
import { error as logError } from '../logger'
import { getAppConfig } from '../runtimeConfig'
import type { DictEntry } from './types'

const DICT_CACHE_NAMESPACE = 'readioDictionaryCacheV1'
const dictCache = new Map<string, DictEntry>()
let highlightInitialized = false
let loadPromise: Promise<void> | null = null
let persistQueue: Promise<void> = Promise.resolve()
let persistEpoch = 0

async function hydrateDictCacheFromIndexedDb(): Promise<void> {
  const config = getAppConfig()
  try {
    const persisted = await DB.getRuntimeCacheEntry<Record<string, DictEntry>>(
      config.DICT_CACHE_KEY
    )
    if (persisted?.data) {
      Object.entries(persisted.data).forEach(([key, value]) => {
        if (!dictCache.has(key)) {
          dictCache.set(key, value as DictEntry)
        }
      })
    }
  } catch (err) {
    logError('[DictCache] Failed to load cache:', err)
  } finally {
    highlightInitialized = initLookupHighlight()
  }
}

export function loadDictCache(): void {
  if (!loadPromise) {
    loadPromise = hydrateDictCacheFromIndexedDb()
  }
}

export async function clearDictCacheMemory(): Promise<void> {
  const config = getAppConfig()
  persistEpoch += 1
  dictCache.clear()
  highlightInitialized = false
  loadPromise = null
  const pending = persistQueue
  persistQueue = Promise.resolve()
  try {
    await pending
  } catch {
    // Pending persistence failures are already logged in queuePersistSnapshot.
  }
  // Enforce strong clear semantics after pending tasks finish.
  dictCache.clear()
  highlightInitialized = false
  loadPromise = null
  try {
    await DB.deleteRuntimeCacheEntry(config.DICT_CACHE_KEY)
  } catch (err) {
    logError('[DictCache] Failed to delete persisted cache:', err)
  }
}

function ensureDictCacheHydrated(): Promise<void> {
  if (!loadPromise) {
    loadPromise = hydrateDictCacheFromIndexedDb()
  }
  return loadPromise
}

function queuePersistSnapshot(dictCacheKey: string): void {
  const enqueueEpoch = persistEpoch
  persistQueue = persistQueue
    .then(async () => {
      if (enqueueEpoch !== persistEpoch) {
        return
      }
      await ensureDictCacheHydrated()
      if (enqueueEpoch !== persistEpoch) {
        return
      }
      const snapshot = Object.fromEntries(dictCache.entries())
      if (enqueueEpoch !== persistEpoch) {
        return
      }
      await DB.setRuntimeCacheEntry({
        key: dictCacheKey,
        namespace: DICT_CACHE_NAMESPACE,
        data: snapshot,
        at: Date.now(),
      })
    })
    .catch((err) => {
      logError('[DictCache] Failed to save cache:', err)
    })
}

export function saveDictCache(): void {
  const config = getAppConfig()
  try {
    if (dictCache.size > config.DICT_CACHE_MAX_ENTRIES) {
      const keysToRemove = Array.from(dictCache.keys()).slice(
        0,
        dictCache.size - config.DICT_CACHE_MAX_ENTRIES
      )
      keysToRemove.forEach((key) => {
        dictCache.delete(key)
      })
    }
    queuePersistSnapshot(config.DICT_CACHE_KEY)
  } catch (err) {
    logError('[DictCache] Failed to save cache:', err)
  }
}

export function getCachedEntry(word: string): DictEntry | undefined {
  return dictCache.get(word.toLowerCase())
}

export function setCachedEntry(word: string, entry: DictEntry): void {
  dictCache.set(word.toLowerCase(), entry)
  saveDictCache()
}

export function applyLookupHighlightForWord(word: string): number {
  if (!highlightInitialized) return 0
  const normalizedWord = word.toLowerCase().trim()
  if (!normalizedWord) return 0
  return highlightWordInSubtitles(normalizedWord)
}

export function getCachedWords(): string[] {
  return Array.from(dictCache.keys())
}

export function refreshHighlights(): number {
  if (!highlightInitialized) return 0
  return rebuildHighlights(getCachedWords())
}
