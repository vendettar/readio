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

  const customUrl = normalizeCustomProxyUrl(config.CORS_PROXY_URL || '')
  const customPrimary = parseBoolean(config.CORS_PROXY_PRIMARY, false)

  return {
    proxyUrl: customUrl || config.DEFAULT_CORS_PROXY,
    proxyPrimary: customPrimary,
  }
}

export type ProxyHealthResult =
  | {
      ok: true
      proxyUrl: string
      proxyType: 'default' | 'custom'
      targetUrl: string
      elapsedMs: number
      at: number
    }
  | {
      ok: false
      proxyUrl: string
      proxyType: 'default' | 'custom'
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

// For JSON-wrapped proxies (like AllOrigins) specifically, we use /get?url= format
function buildJsonWrappedProxyUrl(proxyBase: string, targetUrl: string): string {
  const encoded = encodeURIComponent(String(targetUrl || ''))
  // Ensure we don't double /get?url=
  const base = proxyBase.replace(/\/get\?url=$/i, '').replace(/\/+$/, '')
  return `${base}/get?url=${encoded}`
}

function isJsonWrappedProxyUrl(url: string): boolean {
  return String(url || '')
    .toLowerCase()
    .includes('allorigins.win')
}

async function fetchViaProxy(
  proxyBase: string,
  targetUrl: string,
  signal: AbortSignal
): Promise<{ proxyType: 'default' | 'custom'; status?: number }> {
  const isJsonWrapped = isJsonWrappedProxyUrl(proxyBase)
  const finalUrl = isJsonWrapped
    ? buildJsonWrappedProxyUrl(proxyBase, targetUrl)
    : buildProxyUrl(proxyBase, targetUrl)

  const response = await fetch(finalUrl, { signal, credentials: 'omit' })
  if (!response.ok) {
    return { proxyType: isJsonWrapped ? 'default' : 'custom', status: response.status }
  }

  // JSON-wrapped proxies (e.g. AllOrigins) return JSON { contents } and we must ensure it's parseable.
  if (isJsonWrapped) {
    const data = await response.json()
    const contents = data?.contents
    if (typeof contents !== 'string' || contents.length === 0) {
      throw new Error('Invalid proxy response (empty contents)')
    }
  } else {
    // Custom proxy: assume raw content; only check non-empty body.
    const text = await response.text()
    if (!text) throw new Error('Empty proxy response')
  }

  return { proxyType: isJsonWrapped ? 'default' : 'custom' }
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

    const isJsonWrapped = isJsonWrappedProxyUrl(proxyUrl)
    return {
      ok: false,
      proxyUrl,
      proxyType: isJsonWrapped ? 'default' : 'custom',
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
  /** Optional request headers */
  headers?: Record<string, string>
  /** If true, skip proxy fallback if the direct fetch returns a 4xx error */
  skipProxyOn4xx?: boolean
}

type FetchSource = 'direct' | 'customProxy' | 'defaultProxy'

export class NetworkError extends Error {
  constructor(message = 'No internet connection') {
    super(message)
    this.name = 'NetworkError'
  }
}

export class FetchError extends Error {
  status?: number
  url: string
  source: FetchSource

  constructor(message: string, url: string, status: number | undefined, source: FetchSource) {
    super(message)
    this.name = 'FetchError'
    this.url = url
    this.status = status
    this.source = source
  }
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
  const { signal, timeoutMs = config.TIMEOUT_MS, json = false, headers = {} } = options
  const { proxyUrl, proxyPrimary } = getCorsProxyConfig()

  // Pre-fetch network check: if we are known to be offline, throw immediately.
  // We allow localhost/127.0.0.1 to bypass this for development purposes.
  const isLocal =
    url.startsWith('http://localhost') ||
    url.startsWith('http://127.0.0.1') ||
    url.startsWith('http://0.0.0.0')

  if (typeof window !== 'undefined' && !window.navigator.onLine && !isLocal) {
    throw new NetworkError()
  }

  const controller = new AbortController()
  let didTimeout = false

  const timeoutId = setTimeout(() => {
    didTimeout = true
    controller.abort()
  }, timeoutMs)

  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }

  const internalSignal = controller.signal

  // 1. Direct Fetch
  const fetchDirect = async (): Promise<T> => {
    try {
      const response = await fetch(url, {
        signal: internalSignal,
        credentials: 'omit',
        headers,
      })
      if (!response.ok) {
        throw new FetchError(
          `Direct fetch failed: ${response.status}`,
          url,
          response.status,
          'direct'
        )
      }
      return json ? response.json() : (response.text() as unknown as T)
    } catch (e) {
      if (e instanceof TypeError) {
        throw new NetworkError('Network failure during direct fetch')
      }
      throw e
    }
  }

  // 2. Proxy Fetch Generic
  const fetchViaProxy = async (baseProxyUrl: string, source: FetchSource): Promise<T> => {
    // More robust check for JSON-wrapped proxies (supporting variations in URL)
    const isJsonWrapped = isJsonWrappedProxyUrl(baseProxyUrl)

    const finalProxyUrl = isJsonWrapped
      ? buildJsonWrappedProxyUrl(baseProxyUrl, url)
      : buildProxyUrl(baseProxyUrl, url)

    let response: Response
    try {
      response = await fetch(finalProxyUrl, {
        signal: internalSignal,
        credentials: 'omit',
        // We don't typically pass client headers to generic proxies like AllOrigins
        // but some custom proxies might need them.
        headers,
      })
      if (!response.ok) {
        throw new FetchError(
          `Proxy (${baseProxyUrl}) failed: ${response.status}`,
          url,
          response.status,
          source
        )
      }
    } catch (e) {
      if (e instanceof TypeError) {
        throw new NetworkError(`Network failure during proxy fetch (${baseProxyUrl})`)
      }
      throw e
    }

    // JSON-wrapped proxies return JSON with contents field
    if (isJsonWrapped) {
      const data = await response.json()
      let contents = data?.contents

      if (contents === null || contents === undefined) {
        throw new Error('Proxy returned empty contents (target might be blocked or too large)')
      }

      // Base64 decoding (used for some encodings)
      if (typeof contents === 'string' && contents.startsWith('data:')) {
        try {
          const decodedResponse = await fetch(contents)
          contents = await decodedResponse.text()
        } catch (e) {
          if (e instanceof TypeError) {
            throw new NetworkError('Network failure during data decoding')
          }
          log('[fetchWithFallback] Failed to decode data: URI', e)
        }
      }

      if (json) {
        try {
          return (typeof contents === 'string' ? JSON.parse(contents) : contents) as T
        } catch {
          if (!contents) throw new Error('Empty response from proxy')
          return contents as T
        }
      }
      return contents as T
    }

    // Custom proxy: assume it returns raw content
    if (json) {
      return response.json()
    }

    const textResult = await response.text()
    if (!textResult) throw new Error(`Custom proxy (${baseProxyUrl}) returned empty response`)

    // Heuristic: If we expect text (XML) but get something starting with { it might be a JSON error from proxy
    if (!json && textResult.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(textResult)
        if (parsed && (parsed.error || parsed.message)) {
          throw new Error(`Proxy error: ${parsed.error || parsed.message}`)
        }
      } catch {
        // Not valid JSON, continue
      }
    }

    return textResult as unknown as T
  }

  try {
    // Detect if the provided proxy is actually the default/JSON-wrapped one
    const isProvidedDefault = isJsonWrappedProxyUrl(proxyUrl)
    const customProxy = proxyUrl && !isProvidedDefault ? proxyUrl : null

    /**
     * The Fetch Chain Strategy:
     * 1. Direct Fetch (Always try first)
     * 2. Then toggle order of Custom vs Default based on proxyPrimary flag.
     *    - If proxyPrimary=true: Custom -> Default
     *    - If proxyPrimary=false: Default -> Custom
     */
    type Attempt = { name: string; fn: () => Promise<T> }
    const attempts: Attempt[] = []

    // 1. Direct
    attempts.push({ name: 'Direct', fn: fetchDirect })

    const addCustomProxyAttempt = () => {
      if (customProxy) {
        attempts.push({ name: 'CustomProxy', fn: () => fetchViaProxy(customProxy, 'customProxy') })
      }
    }

    const addDefaultProxyAttempt = () => {
      attempts.push({
        name: 'DefaultProxy',
        fn: () => fetchViaProxy(config.DEFAULT_CORS_PROXY, 'defaultProxy'),
      })
    }

    if (proxyPrimary) {
      // Priority: Custom -> Default
      addCustomProxyAttempt()
      addDefaultProxyAttempt()
    } else {
      // Priority: Default -> Custom
      addDefaultProxyAttempt()
      addCustomProxyAttempt()
    }

    let lastError: unknown
    for (let i = 0; i < attempts.length; i++) {
      try {
        const { name, fn } = attempts[i]
        log(`[fetchWithFallback] [${name}] Attempt ${i + 1}/${attempts.length} for: ${url}`)
        const result = await fn()

        // Validation: If we expect text (not JSON) but it's not XML-like, it might be an error page
        if (!json && typeof result === 'string') {
          const trimmed = result.trim()
          if (
            trimmed.length > 0 &&
            trimmed.startsWith('<') &&
            !trimmed.toLowerCase().startsWith('<!doctype html')
          ) {
            // Looks like valid XML/RSS
            return result as T
          }
          if (trimmed.length > 0) {
            // If it looks like HTML but we wanted RSS, this is likely a proxy error page
            log(
              `[fetchWithFallback] [${name}] Success but invalid content (HTML instead of XML). Snippet: ${trimmed.slice(0, 100)}`
            )
            throw new Error('Received HTML instead of expected XML content')
          }
        }

        return result
      } catch (error) {
        lastError = error

        // Short-circuit on 4xx if requested (typically for Dictionary 404s)
        if (
          options.skipProxyOn4xx &&
          attempts[i].name === 'Direct' &&
          error instanceof FetchError &&
          error.status &&
          error.status >= 400 &&
          error.status < 500
        ) {
          log(
            `[fetchWithFallback] [Direct] 4xx status received (${error.status}), skipping proxies as requested.`
          )
          throw error
        }

        // If it's a NetworkError, short-circuit immediately
        if (
          error instanceof NetworkError ||
          (error instanceof Error && error.name === 'NetworkError')
        ) {
          throw error
        }

        // If it's a manual abort, don't try next steps
        if (error instanceof Error && error.name === 'AbortError' && !didTimeout) {
          throw error
        }
        log(
          `[fetchWithFallback] [Attempt ${i + 1}] failed:`,
          error instanceof Error ? error.message : error
        )
      }
    }

    if (lastError instanceof Error && lastError.name === 'AbortError' && didTimeout) {
      throw new Error('Request timeout')
    }
    throw lastError || new Error('All fetch attempts failed')
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
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
