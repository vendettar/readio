import { CircuitTripError } from './networking/circuitBreaker'
import {
  __resetCloudBackendBreakerForTests,
  CLOUD_BACKEND_FALLBACK_CLASSES,
  type CloudBackendFallbackClass,
  fetchCloudBackendWithFallback,
} from './networking/cloudBackendFallback'
import {
  FetchError,
  isAbortLikeError,
  NetworkError,
} from './networking/fetchErrors'
import { buildProxyAuthHeaders, type ProxyAuthConfig } from './networking/proxyAuth'
import { buildProxyUrl, getNetworkProxyConfig } from './networking/proxyUrl'
import { fetchStandardWithFallback } from './networking/standardFetchFallback'
import { createTimeoutController } from './networking/timeouts'

const DEFAULT_PROXY_HEALTH_CHECK_TIMEOUT_MS = 8000

export { buildProxyUrl }
export { CircuitTripError, getNetworkProxyConfig }
export {
  __resetCloudBackendBreakerForTests,
  CLOUD_BACKEND_FALLBACK_CLASSES,
  FetchError,
  isAbortLikeError,
  NetworkError,
}
export type { CloudBackendFallbackClass }

interface ProxyConfig extends ProxyAuthConfig {
  proxyUrl: string
}

interface ProxyConfigOverrides {
  proxyUrl?: string
  authHeader?: string
  authValue?: string
}

export type ProxyHealthResult =
  | {
      ok: true
      proxyUrl: string
      targetUrl: string
      elapsedMs: number
      at: number
    }
  | {
      ok: false
      proxyUrl: string
      targetUrl: string
      elapsedMs: number
      at: number
      error: string
      status?: number
    }

function normalizeProxyUrl(value: string): string {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
}

function resolveProxyConfig(overrides?: ProxyConfigOverrides): ProxyConfig {
  const stored = getNetworkProxyConfig()
  return {
    proxyUrl: normalizeProxyUrl(overrides?.proxyUrl ?? stored.proxyUrl),
    authHeader: String(overrides?.authHeader ?? stored.authHeader ?? '').trim(),
    authValue: String(overrides?.authValue ?? stored.authValue ?? '').trim(),
  }
}

async function fetchViaProxy(
  proxyBase: string,
  targetUrl: string,
  signal: AbortSignal,
  authConfig?: ProxyAuthConfig
): Promise<{ status?: number }> {
  const proxyAuthHeaders = buildProxyAuthHeaders(authConfig ?? getNetworkProxyConfig())
  const init: RequestInit = { signal, credentials: 'omit' }

  // Custom proxy: Always use POST JSON { url } contract (no GET fallback per 084)
  init.method = 'POST'
  init.headers = {
    'Content-Type': 'application/json',
    ...proxyAuthHeaders,
  }
  init.body = JSON.stringify({ url: targetUrl, method: 'GET' })

  const response = await fetch(proxyBase, init)

  if (!response.ok) {
    return { status: response.status }
  }

  const text = await response.text()
  if (!text) throw new Error('Empty proxy response')

  return {}
}

export async function checkNetworkProxyHealth(options?: {
  targetUrl?: string
  timeoutMs?: number
  signal?: AbortSignal
  proxyConfig?: ProxyConfigOverrides
}): Promise<ProxyHealthResult> {
  const { proxyUrl, authHeader, authValue } = resolveProxyConfig(options?.proxyConfig)
  const targetUrl = options?.targetUrl || 'https://example.com/'
  const timeoutMs = options?.timeoutMs ?? DEFAULT_PROXY_HEALTH_CHECK_TIMEOUT_MS
  const at = Date.now()

  if (!proxyUrl) {
    return {
      ok: false,
      proxyUrl: '',
      targetUrl,
      elapsedMs: 0,
      at,
      error: 'No proxy configured',
    }
  }

  const timeout = createTimeoutController(timeoutMs, options?.signal)

  const start = performance.now()
  try {
    const result = await fetchViaProxy(proxyUrl, targetUrl, timeout.controller.signal, {
      authHeader,
      authValue,
    })
    const elapsedMs = Math.round(performance.now() - start)

    if (result.status && result.status >= 400) {
      return {
        ok: false,
        proxyUrl,
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
      targetUrl,
      elapsedMs,
      at,
    }
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - start)
    const message =
      err instanceof Error ? (err.name === 'AbortError' ? 'Timeout' : err.message) : 'Unknown error'

    return {
      ok: false,
      proxyUrl,
      targetUrl,
      elapsedMs,
      at,
      error: message,
    }
  } finally {
    timeout.cleanup()
  }
}

interface FetchWithFallbackOptionsBase {
  signal?: AbortSignal
  timeoutMs?: number
  fetchImpl?: typeof fetch
  /** If true, response is JSON; otherwise text */
  json?: boolean
  /** When fetching text, validate structured markup content when appropriate. */
  expectXml?: boolean
  /** Optional request headers */
  headers?: Record<string, string>
  /** If true, skip proxy fallback if the direct fetch returns a 4xx error */
  skipProxyOn4xx?: boolean
  /** If true, skip direct fetch and use proxies only */
  forceProxy?: boolean
  /** If true, return the raw Response object instead of parsing as text/JSON */
  raw?: boolean
  /** HTTP method to use (defaults to GET) */
  method?: string
  /** Human readable purpose for logging (Instruction 124 refinement) */
  purpose?: string
}

export interface StandardFetchWithFallbackOptions extends FetchWithFallbackOptionsBase {
  /** Optional request body (string). Forwarded to both direct fetch and proxy. */
  body?: string
  /** Cloud-only fallback route for approved media request classes. */
  cloudBackendFallbackClass?: undefined
}

export interface CloudBackendFetchWithFallbackOptions extends FetchWithFallbackOptionsBase {
  /** Cloud backend fallback is restricted to body-less requests. */
  body?: never
  /** Cloud-only fallback route for approved media request classes. */
  cloudBackendFallbackClass: CloudBackendFallbackClass
}

export type FetchWithFallbackOptions =
  | StandardFetchWithFallbackOptions
  | CloudBackendFetchWithFallbackOptions

type FetchJsonWithFallbackOptions =
  | Omit<StandardFetchWithFallbackOptions, 'json'>
  | Omit<CloudBackendFetchWithFallbackOptions, 'json'>

type FetchTextWithFallbackOptions =
  | Omit<StandardFetchWithFallbackOptions, 'json'>
  | Omit<CloudBackendFetchWithFallbackOptions, 'json'>

/**
 * Fetch with direct → proxy fallback
 * Returns the response as text or JSON based on options
 */
export async function fetchWithFallback<T = string>(
  url: string,
  options: FetchWithFallbackOptions = {}
): Promise<T> {
  if (options.cloudBackendFallbackClass) {
    return fetchCloudBackendWithFallback<T>(url, options)
  }
  return fetchStandardWithFallback<T>(url, options)
}

/**
 * Fetch JSON with fallback (convenience wrapper)
 */
export async function fetchJsonWithFallback<T>(
  url: string,
  options: FetchJsonWithFallbackOptions = {}
): Promise<T> {
  return fetchWithFallback<T>(url, { ...options, json: true })
}

/**
 * Fetch text with fallback.
 */
export async function fetchTextWithFallback(
  url: string,
  options: FetchTextWithFallbackOptions = {}
): Promise<string> {
  return fetchWithFallback<string>(url, {
    ...options,
    json: false,
    expectXml: options.expectXml ?? true,
  })
}
