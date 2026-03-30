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

type DictionaryTransport = 'direct' | 'go-proxy'

interface DictionaryApiNotFoundPayload {
  title?: unknown
  message?: unknown
  resolution?: unknown
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function isDictionaryApiNotFoundPayload(payload: Record<string, unknown> | null): boolean {
  if (!payload) return false
  const body = payload as DictionaryApiNotFoundPayload
  return (
    body.title === 'No Definitions Found' &&
    typeof body.message === 'string' &&
    typeof body.resolution === 'string'
  )
}

function toProxyErrorMessage(payload: Record<string, unknown> | null, fallback: string): string {
  const message = payload?.message
  return typeof message === 'string' && message.trim() ? message : fallback
}

async function fetchDictionaryJSON(
  lookupUrl: string,
  options: {
    transport: DictionaryTransport
    signal?: AbortSignal
    timeoutMs: number
  }
): Promise<unknown> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const abort = () => controller.abort()
  options.signal?.addEventListener('abort', abort, { once: true })

  try {
    const response =
      options.transport === 'go-proxy'
        ? await fetch('/api/proxy', {
            method: 'POST',
            signal: controller.signal,
            credentials: 'omit',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: lookupUrl,
              method: 'GET',
              headers: {
                Accept: 'application/json',
              },
            }),
          })
        : await fetch(lookupUrl, {
            method: 'GET',
            signal: controller.signal,
            credentials: 'omit',
            headers: {
              Accept: 'application/json',
            },
          })

    const text = await response.text()
    if (!response.ok) {
      const payload = parseJsonObject(text)
      if (response.status === 404 && isDictionaryApiNotFoundPayload(payload)) {
        throw new Error('Word not found')
      }

      let message = `Dictionary request failed with ${response.status}`
      if (payload) {
        message = toProxyErrorMessage(payload, message)
      } else if (text) {
        message = text
      }
      throw new Error(message)
    }

    return text ? JSON.parse(text) : null
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abort)
  }
}

export async function fetchDefinition(word: string, signal?: AbortSignal): Promise<DictEntry> {
  const config = getAppConfig()
  const cached = getCachedEntry(word)
  if (cached) return cached

  const baseUrl = config.EN_DICTIONARY_API_URL.endsWith('/')
    ? config.EN_DICTIONARY_API_URL
    : `${config.EN_DICTIONARY_API_URL}/`
  const lookupUrl = new URL(encodeURIComponent(word.toLowerCase()), baseUrl).toString()
  try {
    const data = await fetchDictionaryJSON(lookupUrl, {
      transport: config.EN_DICTIONARY_API_TRANSPORT,
      signal,
      timeoutMs: config.PROXY_TIMEOUT_MS,
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
    throw err
  }
}
