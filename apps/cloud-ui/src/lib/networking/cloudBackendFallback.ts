import { log } from '../logger'
import { getAppConfig } from '../runtimeConfig'
import { FetchError, isAbortLikeError, NetworkError, parseFetchedResponse } from './fetchErrors'
import { createTimeoutController } from './timeouts'

export const CLOUD_BACKEND_FALLBACK_CLASSES = {
  AUDIO_PREFETCH_RANGE: 'audio-prefetch-range',
  DOWNLOAD_HEAD: 'download-head',
  DOWNLOAD_GET: 'download-get',
  TRANSCRIPT: 'transcript',
  ASR_AUDIO: 'asr-audio',
} as const

export type CloudBackendFallbackClass =
  (typeof CLOUD_BACKEND_FALLBACK_CLASSES)[keyof typeof CLOUD_BACKEND_FALLBACK_CLASSES]

export interface CloudBackendFetchRequestOptions {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
  json?: boolean
  headers?: Record<string, string>
  forceProxy?: boolean
  raw?: boolean
  method?: string
  purpose?: string
  body?: never
  cloudBackendFallbackClass: CloudBackendFallbackClass
}

const CLOUD_BACKEND_BREAKER_THRESHOLD = 2
const CLOUD_BACKEND_BREAKER_WINDOW_MS = 60_000
const CLOUD_BACKEND_BREAKER_BYPASS_MS = 30_000

type CloudBackendBreakerState = {
  failures: number
  firstFailureAt: number
  bypassUntil: number
}

const cloudBackendBreaker = new Map<string, CloudBackendBreakerState>()

function getCloudBackendBreakerKey(
  fallbackClass: CloudBackendFallbackClass,
  targetUrl: string
): string {
  try {
    const parsed = new URL(targetUrl)
    return `${fallbackClass}:${parsed.host.toLowerCase()}`
  } catch {
    return `${fallbackClass}:${targetUrl}`
  }
}

function shouldBypassCloudBackendDirect(
  fallbackClass: CloudBackendFallbackClass,
  targetUrl: string
): boolean {
  const state = cloudBackendBreaker.get(getCloudBackendBreakerKey(fallbackClass, targetUrl))
  if (!state) return false
  return state.bypassUntil > Date.now()
}

function clearCloudBackendBreaker(fallbackClass: CloudBackendFallbackClass, targetUrl: string) {
  cloudBackendBreaker.delete(getCloudBackendBreakerKey(fallbackClass, targetUrl))
}

function recordCloudBackendDirectFailure(
  fallbackClass: CloudBackendFallbackClass,
  targetUrl: string
): void {
  const now = Date.now()
  const key = getCloudBackendBreakerKey(fallbackClass, targetUrl)
  const existing = cloudBackendBreaker.get(key)

  if (!existing || now - existing.firstFailureAt > CLOUD_BACKEND_BREAKER_WINDOW_MS) {
    cloudBackendBreaker.set(key, {
      failures: 1,
      firstFailureAt: now,
      bypassUntil: 0,
    })
    return
  }

  const failures = existing.failures + 1
  cloudBackendBreaker.set(key, {
    failures,
    firstFailureAt: existing.firstFailureAt,
    bypassUntil:
      failures >= CLOUD_BACKEND_BREAKER_THRESHOLD ? now + CLOUD_BACKEND_BREAKER_BYPASS_MS : 0,
  })
}

export function __resetCloudBackendBreakerForTests(): void {
  cloudBackendBreaker.clear()
}

function buildCloudBackendProxyBody(options: {
  url: string
  method: string
  headers: Record<string, string>
}): string {
  return JSON.stringify({
    url: options.url,
    method: options.method,
    ...(Object.keys(options.headers).length > 0 ? { headers: options.headers } : {}),
  })
}

async function fetchCloudBackendResponse(
  targetUrl: string,
  options: {
    method: string
    headers: Record<string, string>
    signal?: AbortSignal
    fetchImpl?: typeof fetch
  }
): Promise<Response> {
  const backendFetch = options.fetchImpl ?? fetch
  return backendFetch('/api/proxy', {
    signal: options.signal,
    credentials: 'omit',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: buildCloudBackendProxyBody({
      url: targetUrl,
      method: options.method,
      headers: options.headers,
    }),
  })
}

export async function fetchCloudBackendWithFallback<T>(
  url: string,
  options: CloudBackendFetchRequestOptions
): Promise<T> {
  const {
    signal,
    timeoutMs = getAppConfig().PROXY_TIMEOUT_MS,
    json = false,
    headers = {},
    forceProxy,
    raw = false,
    method = 'GET',
    purpose = '',
    body: requestBody,
    fetchImpl,
    cloudBackendFallbackClass,
  } = options

  const attemptFetch = fetchImpl ?? fetch
  const purposeLabel = purpose ? ` [${purpose}]` : ''
  const shouldTryDirect =
    !forceProxy && !shouldBypassCloudBackendDirect(cloudBackendFallbackClass, url)

  if (requestBody !== undefined) {
    throw new Error('Cloud backend fallback does not support request bodies')
  }

  const runDirectAttempt = async (attemptSignal: AbortSignal): Promise<Response> => {
    try {
      return await attemptFetch(url, {
        signal: attemptSignal,
        credentials: 'omit',
        headers,
        method,
      })
    } catch (error) {
      if (error instanceof TypeError) {
        throw new NetworkError('Network failure during direct fetch')
      }
      throw error
    }
  }

  const runBackendAttempt = async (attemptSignal: AbortSignal): Promise<Response> => {
    try {
      return await fetchCloudBackendResponse(url, {
        method,
        headers,
        signal: attemptSignal,
        fetchImpl: attemptFetch,
      })
    } catch (error) {
      if (error instanceof TypeError) {
        throw new NetworkError('Network failure during Cloud backend fallback fetch')
      }
      throw error
    }
  }

  const parseResult = async (response: Response, source: 'direct' | 'cloudBackend'): Promise<T> => {
    if (!response.ok) {
      throw new FetchError(
        `${source === 'direct' ? 'Direct fetch' : 'Cloud backend fallback'} failed: ${response.status}`,
        url,
        response.status,
        source
      )
    }
    if (raw) return response as unknown as T
    return (await parseFetchedResponse(response, { raw, json })) as T
  }

  const executeAttempt = async (sourceLabel: 'Direct' | 'CloudBackend'): Promise<T> => {
    const timeout = createTimeoutController(
      sourceLabel === 'Direct' ? getAppConfig().DIRECT_TIMEOUT_MS : timeoutMs,
      signal
    )

    try {
      log(`[fetchWithFallback]${purposeLabel} [${sourceLabel}] Cloud media fallback for: ${url}`)
      const response =
        sourceLabel === 'Direct'
          ? await runDirectAttempt(timeout.controller.signal)
          : await runBackendAttempt(timeout.controller.signal)

      if (sourceLabel === 'Direct' && response.ok) {
        clearCloudBackendBreaker(cloudBackendFallbackClass, url)
        return (await parseFetchedResponse(response, { raw, json })) as T
      }

      return await parseResult(response, sourceLabel === 'Direct' ? 'direct' : 'cloudBackend')
    } catch (error) {
      if (sourceLabel === 'Direct' && timeout.wasTimedOut() && isAbortLikeError(error)) {
        throw new NetworkError('Timeout during direct fetch')
      }
      throw error
    } finally {
      timeout.cleanup()
    }
  }

  if (shouldTryDirect) {
    try {
      return await executeAttempt('Direct')
    } catch (error) {
      const shouldFallback =
        error instanceof NetworkError || (error instanceof FetchError && (error.status ?? 0) >= 500)

      if (!shouldFallback) {
        throw error
      }
      recordCloudBackendDirectFailure(cloudBackendFallbackClass, url)
    }
  }

  return executeAttempt('CloudBackend')
}
