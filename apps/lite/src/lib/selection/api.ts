import { FetchError, fetchJsonWithFallback } from '../fetchUtils'
import { getAppConfig } from '../runtimeConfig'
import { getCachedEntry, setCachedEntry } from './dictCache'
import type { DictEntry } from './types'

interface ApiMeaning {
  partOfSpeech?: string
  definitions?: Array<{ definition?: string; example?: string }>
}

interface ApiEntry {
  word?: string
  phonetic?: string
  phonetics?: Array<{ text?: string }>
  meanings?: ApiMeaning[]
}

export async function fetchDefinition(word: string, signal?: AbortSignal): Promise<DictEntry> {
  const config = getAppConfig()
  const cached = getCachedEntry(word)
  if (cached) return cached

  const baseUrl = config.DICT_API_URL.endsWith('/')
    ? config.DICT_API_URL
    : `${config.DICT_API_URL}/`
  const lookupUrl = new URL(encodeURIComponent(word.toLowerCase()), baseUrl).toString()
  try {
    const data = await fetchJsonWithFallback<unknown>(lookupUrl, {
      signal,
      timeoutMs: config.TIMEOUT_MS,
      headers: { Accept: 'application/json' },
      skipProxyOn4xx: true,
    })
    const entry = Array.isArray(data) ? data[0] : data

    const apiEntry = entry && typeof entry === 'object' ? (entry as ApiEntry) : ({} as ApiEntry)

    const result: DictEntry = {
      word: apiEntry.word || word,
      phonetic: apiEntry.phonetic || apiEntry.phonetics?.[0]?.text || '',
      meanings: (apiEntry.meanings || []).map((m: ApiMeaning) => ({
        partOfSpeech: m.partOfSpeech || '',
        definitions: (m.definitions || []).slice(0, 3).map((d) => ({
          definition: d.definition || '',
          example: d.example,
        })),
      })),
    }

    setCachedEntry(word, result)
    return result
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err

    // Only map 4xx errors to "Word not found"
    if (err instanceof FetchError && err.status && err.status >= 400 && err.status < 500) {
      throw new Error('Word not found')
    }

    // Propagate other errors (5xx, network, etc.) for diagnostics
    throw err
  }
}
