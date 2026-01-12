// Unified fetch utilities with direct → proxy fallback
import { log } from './logger'
import { getAppConfig } from './runtimeConfig'

function parseBoolean(value: unknown, fallback: boolean = false): boolean {
  if (typeof value === 'boolean') return value
  const raw = String(value || '')
    .trim()
    .toLowerCase()
  if (!raw) return fallback
  if (['1', 'true', 'yes', 'y', 'on'].includes(raw)) return true
  if (['0', 'false', 'no', 'n', 'off'].includes(raw)) return false
  return fallback
}

/**
 * Normalize custom proxy URL: remove trailing slash
 */
function normalizeCustomProxyUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''
  return trimmed.replace(/\/+$/, '')
}

export function getCorsProxyConfig(): { proxyUrl: string; proxyPrimary: boolean } {
  const config = getAppConfig()

  const customUrl = normalizeCustomProxyUrl(config.READIO_CORS_PROXY_URL || '')
  const customPrimary = parseBoolean(config.READIO_CORS_PROXY_PRIMARY, false)

  return {
    proxyUrl: customUrl || config.DEFAULT_CORS_PROXY,
    proxyPrimary: customPrimary,
  }
}

export type ProxyHealthResult =
  | {
      ok: true
      proxyUrl: string
      proxyType: 'allorigins' | 'custom'
      targetUrl: string
      elapsedMs: number
      at: number
    }
  | {
      ok: false
      proxyUrl: string
      proxyType: 'allorigins' | 'custom'
      targetUrl: string
      elapsedMs: number
      at: number
      error: string
      status?: number
    }

/**
 * Build proxy URL supporting three formats:
 * 1. Template: contains `{url}` placeholder, e.g. `https://proxy.example.com/?target={url}`
 * 2. Prefix: ends with `?url=` or `&url=`, e.g. `https://proxy.example.com/get?url=`
 * 3. Base: auto-append `?url=` or `&url=`, e.g. `https://proxy.example.com/get`
 */
function buildProxyUrl(proxyBase: string, targetUrl: string): string {
  const base = String(proxyBase || '').trim()
  const encoded = encodeURIComponent(String(targetUrl || ''))

  if (!base) throw new Error('Missing proxy base URL')

  // Template format: contains {url}
  if (base.includes('{url}')) {
    return base.split('{url}').join(encoded)
  }

  // Prefix format: ends with ?url= or &url=
  if (/([?&])url=$/i.test(base)) {
    return `${base}${encoded}`
  }

  // Base format: auto-append
  if (base.includes('?')) {
    return `${base}&url=${encoded}`
  }
  return `${base}?url=${encoded}`
}

// For allorigins specifically, we use /get?url= format
function buildAlloriginsUrl(proxyBase: string, targetUrl: string): string {
  const encoded = encodeURIComponent(String(targetUrl || ''))
  // Ensure we don't double /get?url=
  const base = proxyBase.replace(/\/get\?url=$/i, '').replace(/\/+$/, '')
  return `${base}/get?url=${encoded}`
}

function isAllOriginsUrl(url: string): boolean {
  return String(url || '')
    .toLowerCase()
    .includes('allorigins.win')
}

async function fetchViaProxy(
  proxyBase: string,
  targetUrl: string,
  signal: AbortSignal
): Promise<{ proxyType: 'allorigins' | 'custom'; status?: number }> {
  const isAllorigins = isAllOriginsUrl(proxyBase)
  const finalUrl = isAllorigins
    ? buildAlloriginsUrl(proxyBase, targetUrl)
    : buildProxyUrl(proxyBase, targetUrl)

  const response = await fetch(finalUrl, { signal, credentials: 'omit' })
  if (!response.ok) {
    return { proxyType: isAllorigins ? 'allorigins' : 'custom', status: response.status }
  }

  // Allorigins /get returns JSON { contents } and we must ensure it's parseable.
  if (isAllorigins) {
    const data = await response.json()
    const contents = data?.contents
    if (typeof contents !== 'string' || contents.length === 0) {
      throw new Error('Invalid allorigins response')
    }
  } else {
    // Custom proxy: assume raw content; only check non-empty body.
    const text = await response.text()
    if (!text) throw new Error('Empty proxy response')
  }

  return { proxyType: isAllorigins ? 'allorigins' : 'custom' }
}

export async function checkCorsProxyHealth(options?: {
  targetUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
}): Promise<ProxyHealthResult> {
  const { proxyUrl } = getCorsProxyConfig()
  const targetUrl = options?.targetUrl || 'https://example.com/'
  const timeoutMs = options?.timeoutMs ?? 8000
  const at = Date.now()

  const controller = new AbortController()
  const externalSignal = options?.signal
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const onAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  const start = performance.now()
  try {
    const result = await fetchViaProxy(proxyUrl, targetUrl, controller.signal)
    const elapsedMs = Math.round(performance.now() - start)

    if (result.status && result.status >= 400) {
      return {
        ok: false,
        proxyUrl,
        proxyType: result.proxyType,
        targetUrl,
        elapsedMs,
        at,
        status: result.status,
        error: `HTTP ${result.status}`,
      }
    }

    return {
      ok: true,
      proxyUrl,
      proxyType: result.proxyType,
      targetUrl,
      elapsedMs,
      at,
    }
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - start)
    const message =
      err instanceof Error ? (err.name === 'AbortError' ? 'Timeout' : err.message) : 'Unknown error'

    const isAllorigins = isAllOriginsUrl(proxyUrl)
    return {
      ok: false,
      proxyUrl,
      proxyType: isAllorigins ? 'allorigins' : 'custom',
      targetUrl,
      elapsedMs,
      at,
      error: message,
    }
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

export interface FetchWithFallbackOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** If true, response is JSON; otherwise text */
  json?: boolean
}

/**
 * Fetch with direct → proxy fallback (or proxy → direct if proxyPrimary)
 * Returns the response as text or JSON based on options
 */
export async function fetchWithFallback<T = string>(
  url: string,
  options: FetchWithFallbackOptions = {}
): Promise<T> {
  const config = getAppConfig()
  const { signal, timeoutMs = config.DEFAULT_TIMEOUT_MS, json = false } = options
  const { proxyUrl, proxyPrimary } = getCorsProxyConfig()

  const controller = new AbortController()
  let didTimeout = false

  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  const internalSignal = controller.signal

  // 1. Direct Fetch
  const fetchDirect = async (): Promise<T> => {
    const response = await fetch(url, {
      signal: internalSignal,
      credentials: 'omit',
    })
    if (!response.ok) throw new Error(`Direct fetch failed: ${response.status}`)
    return json ? response.json() : (response.text() as unknown as T)
  }

  // 2. Proxy Fetch Generic
  const fetchViaProxy = async (baseProxyUrl: string): Promise<T> => {
    // More robust check for AllOrigins (supporting variations in URL)
    const isAllorigins = isAllOriginsUrl(baseProxyUrl)

    const finalProxyUrl = isAllorigins
      ? buildAlloriginsUrl(baseProxyUrl, url)
      : buildProxyUrl(baseProxyUrl, url)

    const response = await fetch(finalProxyUrl, {
      signal: internalSignal,
      credentials: 'omit',
    })
    if (!response.ok) throw new Error(`Proxy (${baseProxyUrl}) failed: ${response.status}`)

    // Allorigins returns JSON with contents field
    if (isAllorigins) {
      const data = await response.json()
      let contents = data?.contents

      // Base64 decoding for AllOrigins
      if (typeof contents === 'string' && contents.startsWith('data:')) {
        try {
          const decodedResponse = await fetch(contents)
          contents = await decodedResponse.text()
        } catch (e) {
          log('[fetchWithFallback] Failed to decode data: URI', e)
        }
      }

      if (json) {
        try {
          return JSON.parse(contents) as T
        } catch {
          if (!contents) throw new Error('Empty response from proxy')
          return contents as T
        }
      }
      return contents as T
    }

    // Custom proxy: assume it returns raw content
    return json ? response.json() : (response.text() as unknown as T)
  }

  try {
    // Detect if the provided proxy is actually AllOrigins
    const isProvidedAllOrigins = proxyUrl.toLowerCase().includes('allorigins.win')
    const customProxy = proxyUrl && !isProvidedAllOrigins ? proxyUrl : null

    /**
     * The Fetch Chain Strategy:
     * 1. Direct Fetch (Always first)
     * 2. Proxy A (Based on proxyPrimary setting)
     * 3. Proxy B (The remaining proxy)
     */
    const attempts: (() => Promise<T>)[] = [fetchDirect]

    if (proxyPrimary && customProxy) {
      // Priority: Direct -> Custom -> AllOrigins
      attempts.push(() => fetchViaProxy(customProxy))
      attempts.push(() => fetchViaProxy(config.DEFAULT_CORS_PROXY))
    } else {
      // Priority: Direct -> AllOrigins -> Custom (if exists)
      attempts.push(() => fetchViaProxy(config.DEFAULT_CORS_PROXY))
      if (customProxy) {
        attempts.push(() => fetchViaProxy(customProxy))
      }
    }

    let lastError: unknown
    for (let i = 0; i < attempts.length; i++) {
      try {
        const stepName = i === 0 ? 'Direct' : i === 1 ? 'Primary Proxy' : 'Secondary Proxy'
        log(`[fetchWithFallback] [${stepName}] Attempt ${i + 1}/${attempts.length} for: ${url}`)
        return await attempts[i]()
      } catch (error) {
        lastError = error
        // If it's a manual abort, don't try next steps
        if (error instanceof Error && error.name === 'AbortError' && !didTimeout) {
          throw error
        }
        log(`[fetchWithFallback] [${i + 1}] failed, trying next... error:`, error)
      }
    }

    if (lastError instanceof Error && lastError.name === 'AbortError' && didTimeout) {
      throw new Error('Request timeout')
    }
    throw lastError || new Error('All fetch attempts failed')
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fetch JSON with fallback (convenience wrapper)
 */
export async function fetchJsonWithFallback<T>(
  url: string,
  options: Omit<FetchWithFallbackOptions, 'json'> = {}
): Promise<T> {
  return fetchWithFallback<T>(url, { ...options, json: true })
}

/**
 * Fetch text (RSS/XML) with fallback
 */
export async function fetchTextWithFallback(
  url: string,
  options: Omit<FetchWithFallbackOptions, 'json'> = {}
): Promise<string> {
  return fetchWithFallback<string>(url, { ...options, json: false })
}
