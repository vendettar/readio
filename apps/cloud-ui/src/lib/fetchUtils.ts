import { log } from './logger'
import { CircuitBreaker, CircuitTripError } from './networking/circuitBreaker'
import { buildProxyUrl, getCorsProxyConfig } from './networking/proxyUrl'
import { createTimeoutController, sleepWithAbort } from './networking/timeouts'
import { getAppConfig, isRuntimeConfigReady } from './runtimeConfig'

const DEFAULT_PROXY_HEALTH_CHECK_TIMEOUT_MS = 8000

export { buildProxyUrl }
export { CircuitTripError, getCorsProxyConfig }

interface ProxyAuthConfig {
  authHeader: string
  authValue: string
}

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
  const stored = getCorsProxyConfig()
  return {
    proxyUrl: normalizeProxyUrl(overrides?.proxyUrl ?? stored.proxyUrl),
    authHeader: String(overrides?.authHeader ?? stored.authHeader ?? '').trim(),
    authValue: String(overrides?.authValue ?? stored.authValue ?? '').trim(),
  }
}

function buildProxyAuthHeaders({ authHeader, authValue }: ProxyAuthConfig): Record<string, string> {
  if (!authValue) return {}
  if (!authHeader) {
    if (import.meta.env.DEV) {
      log('[fetchUtils] Skipping proxy auth header because authHeader is empty.')
    }
    return {}
  }

  try {
    const validationHeaders = new Headers()
    validationHeaders.set(authHeader, authValue)
    return { [authHeader]: authValue }
  } catch {
    if (import.meta.env.DEV) {
      log(`[fetchUtils] Skipping invalid proxy auth header name: "${authHeader}".`)
    }
    return {}
  }
}

async function fetchViaProxy(
  proxyBase: string,
  targetUrl: string,
  signal: AbortSignal,
  authConfig?: ProxyAuthConfig
): Promise<{ status?: number }> {
  const proxyAuthHeaders = buildProxyAuthHeaders(authConfig ?? getCorsProxyConfig())
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

export async function checkCorsProxyHealth(options?: {
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
  /** When fetching text, validate XML-like content (enabled by default for RSS/XML use cases) */
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

export const CLOUD_BACKEND_FALLBACK_CLASSES = {
  AUDIO_PREFETCH_RANGE: 'audio-prefetch-range',
  DOWNLOAD_HEAD: 'download-head',
  DOWNLOAD_GET: 'download-get',
  TRANSCRIPT: 'transcript',
  ASR_AUDIO: 'asr-audio',
} as const

export type CloudBackendFallbackClass =
  (typeof CLOUD_BACKEND_FALLBACK_CLASSES)[keyof typeof CLOUD_BACKEND_FALLBACK_CLASSES]

export type FetchWithFallbackOptions =
  | StandardFetchWithFallbackOptions
  | CloudBackendFetchWithFallbackOptions

type FetchJsonWithFallbackOptions =
  | Omit<StandardFetchWithFallbackOptions, 'json'>
  | Omit<CloudBackendFetchWithFallbackOptions, 'json'>

type FetchTextWithFallbackOptions =
  | Omit<StandardFetchWithFallbackOptions, 'json'>
  | Omit<CloudBackendFetchWithFallbackOptions, 'json'>

type FetchSource = 'direct' | 'customProxy' | 'cloudBackend'

const CLOUD_BACKEND_BREAKER_THRESHOLD = 2
const CLOUD_BACKEND_BREAKER_WINDOW_MS = 60_000
const CLOUD_BACKEND_BREAKER_BYPASS_MS = 30_000

type CloudBackendBreakerState = {
  failures: number
  firstFailureAt: number
  bypassUntil: number
}

const cloudBackendBreaker = new Map<string, CloudBackendBreakerState>()

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
  code?: string
  requestId?: string

  constructor(
    message: string,
    url: string,
    status: number | undefined,
    source: FetchSource,
    options?: {
      code?: string
      requestId?: string
    }
  ) {
    super(message)
    this.name = 'FetchError'
    this.url = url
    this.status = status
    this.source = source
    this.code = options?.code
    this.requestId = options?.requestId
  }
}

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

export function isAbortLikeError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (!!error && typeof error === 'object' && 'name' in error && error.name === 'AbortError')
  )
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

/**
 * Helper to execute a function with exponential backoff retry logic
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries: number; signal?: AbortSignal; name?: string }
): Promise<T> {
  const { maxRetries, signal, name = 'Request' } = options
  let lastError: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (signal?.aborted) throw error

      // Only retry on actual 5xx server errors.
      // We skip retry for NetworkError (CORS/Offline) and timeouts to trigger immediate fallback.
      const is5xx = error instanceof FetchError && error.status && error.status >= 500

      if (attempt < maxRetries && is5xx) {
        // Exponential backoff: 1s, 2s, 4s, 8s... with jitter
        const delay = 2 ** attempt * 1000 + Math.random() * 500
        log(
          `[withRetry] ${name} attempt ${attempt + 1}/${maxRetries + 1} failed with 5xx. Retrying in ${Math.round(delay)}ms...`
        )

        await new Promise((resolve, reject) => {
          const timer = setTimeout(() => {
            signal?.removeEventListener('abort', onAbort)
            resolve(true)
          }, delay)

          function onAbort() {
            clearTimeout(timer)
            const abortErr = new Error('AbortError')
            abortErr.name = 'AbortError'
            reject(signal?.reason || abortErr)
          }

          signal?.addEventListener('abort', onAbort, { once: true })
        })
        continue
      }
      throw error
    }
  }
  throw lastError
}

function parseFetchedResponse<T>(
  response: Response,
  options: { raw: boolean; json: boolean }
): Promise<T> | T {
  if (options.raw) return response as unknown as T
  if (options.json) return response.json() as Promise<T>
  return response.text() as Promise<T>
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
  const response = await backendFetch('/api/proxy', {
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

  return response
}

async function fetchCloudBackendWithFallback<T>(
  url: string,
  options: CloudBackendFetchWithFallbackOptions
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
        ...(requestBody !== undefined ? { body: requestBody } : {}),
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
        source === 'direct' ? 'direct' : 'cloudBackend'
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

  return await executeAttempt('CloudBackend')
}

/**
 * Fetch with direct → proxy fallback
 * Returns the response as text or JSON based on options
 */
export async function fetchWithFallback<T = string>(
  url: string,
  options: FetchWithFallbackOptions = {}
): Promise<T> {
  // Automatically abort previous request for the same resource
  // abortPrevious(url) <- REMOVED: Global deduplication causes race conditions in concurrent fetches

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
  } = options
  let lastError: unknown

  // Track if the PARENT signal is aborted
  const isParentAborted = () => !!signal?.aborted

  const correlationId = Math.random().toString(16).slice(2, 6)
  if (options.cloudBackendFallbackClass) {
    return fetchCloudBackendWithFallback<T>(url, options)
  }

  // 1. Direct Fetch
  const fetchDirect = async (attemptSignal: AbortSignal): Promise<T> => {
    try {
      const response = await fetch(url, {
        signal: attemptSignal,
        credentials: 'omit',
        headers,
        method,
        ...(requestBody !== undefined ? { body: requestBody } : {}),
      })
      if (!response.ok) {
        throw new FetchError(
          `Direct fetch failed: ${response.status}`,
          url,
          response.status,
          'direct'
        )
      }
      if (raw) return response as unknown as T
      return json ? await response.json() : ((await response.text()) as unknown as T)
    } catch (e) {
      if (e instanceof TypeError) {
        throw new NetworkError('Network failure during direct fetch')
      }
      throw e
    }
  }

  // 2. Proxy Fetch Generic
  const fetchViaProxyFallback = async (
    baseProxyUrl: string,
    source: FetchSource,
    attemptSignal: AbortSignal
  ): Promise<T> => {
    const proxyAuthHeaders = buildProxyAuthHeaders(getCorsProxyConfig())
    const init: RequestInit = { signal: attemptSignal, credentials: 'omit' }

    // Custom proxy: POST JSON { url } (no GET fallback per 084)
    // Custom proxy supports arbitrary methods if passed, otherwise fallback to POST for GET requests
    init.method = 'POST'
    // Only proxy-level headers go here (Content-Type for the proxy contract + proxy auth).
    // Caller headers are forwarded inside the JSON body for the proxy to set on the upstream request.
    init.headers = {
      'Content-Type': 'application/json',
      ...proxyAuthHeaders,
    }
    init.body = JSON.stringify({
      url,
      method,
      ...(requestBody !== undefined ? { body: requestBody } : {}),
      ...(Object.keys(headers).length > 0 ? { headers } : {}),
    })

    try {
      const response = await fetch(baseProxyUrl, init)

      if (!response.ok) {
        throw new FetchError(
          `Proxy (${baseProxyUrl}) failed: ${response.status}`,
          url,
          response.status,
          source
        )
      }

      if (raw) return response as unknown as T

      if (json) {
        return await response.json()
      }

      return (await response.text()) as unknown as T
    } catch (e) {
      if (e instanceof TypeError) {
        throw new NetworkError(`Network failure during proxy fetch (${source})`)
      }
      throw e
    }
  }

  try {
    const runtimeConfigReady = isRuntimeConfigReady()
    const { proxyUrl, authHeader, authValue } = getCorsProxyConfig()
    const isProxyConfigured = !!proxyUrl && runtimeConfigReady && (!authHeader || !!authValue)
    if (import.meta.env.DEV && proxyUrl && !isProxyConfigured) {
      log(
        `[fetchWithFallback] Skip custom proxy: runtimeReady=${runtimeConfigReady}, authHeaderSet=${!!authHeader}, authValueSet=${!!authValue}`
      )
    }

    /**
     * The Fetch Chain Strategy:
     * 1. Direct Fetch (Always try first, unless forceProxy)
     * 2. Then Custom Proxy (if available)
     *
     * 5xx Upstream Retry (only when custom proxy is configured):
     * If all attempts fail with 5xx errors, wait 3 seconds and retry
     * proxy-only fetches once. This handles transient upstream failures
     * (e.g., Apple API momentary outages) gracefully.
     */
    type Attempt = {
      name: string
      fn: (attemptSignal: AbortSignal) => Promise<T>
    }

    const buildAttempts = (includeDirectFetch: boolean): Attempt[] => {
      const attemptList: Attempt[] = []

      if (includeDirectFetch && !forceProxy) {
        attemptList.push({ name: 'Direct', fn: fetchDirect })
      }

      if (isProxyConfigured && proxyUrl) {
        attemptList.push({
          name: 'CustomProxy',
          fn: (s) => fetchViaProxyFallback(proxyUrl, 'customProxy', s),
        })
      }

      return attemptList
    }

    /**
     * Execute a list of attempts sequentially until one succeeds.
     * Returns the result on success, or throws the last error.
     */
    const executeAttempts = async (
      attempts: Attempt[],
      retryLabel = ''
    ): Promise<{ result?: T; all5xx: boolean }> => {
      let attemptLastError: unknown
      let all5xx = true // Track if ALL failures were 5xx

      for (let i = 0; i < attempts.length; i++) {
        const { name, fn } = attempts[i]
        let result: T | undefined
        const timeout = createTimeoutController(
          name === 'Direct' ? getAppConfig().DIRECT_TIMEOUT_MS : timeoutMs,
          signal
        )

        // Identify the proxy URL if this attempt uses one
        const currentProxyUrl = name === 'CustomProxy' ? proxyUrl : null

        // Circuit breaker short-circuit is intentionally disabled.
        // Policy: always try every configured attempt in this fetch chain.
        // We still record success/failure counters for observability.

        const purposeLabel = purpose ? ` [${purpose}]` : ''

        try {
          log(
            `[fetchWithFallback][${correlationId}]${retryLabel}${purposeLabel} [${name}] Attempt ${i + 1}/${attempts.length} for: ${url}`
          )

          try {
            // Intentional policy: single attempt per chain step (maxRetries=0).
            // Failures move to the next fallback step instead of local retries.
            result = await withRetry(() => fn(timeout.controller.signal), {
              maxRetries: 0,
              signal: timeout.controller.signal,
              name: `[${name}]`,
            })
          } finally {
            timeout.cleanup()
          }

          // Success: Record success for proxy if applicable
          if (currentProxyUrl) {
            CircuitBreaker.recordSuccess(currentProxyUrl)
          }

          // Validation: If we expect XML text but got non-XML content, treat it as an error page.
          const shouldValidateXml = !json && options.expectXml !== false
          if (shouldValidateXml && typeof result === 'string') {
            const trimmed = result.trim()
            if (
              trimmed.length > 0 &&
              trimmed.startsWith('<') &&
              !trimmed.toLowerCase().startsWith('<!doctype html')
            ) {
              // Looks like valid XML/RSS
              if (result !== undefined) {
                return { result, all5xx: false }
              }
            }
            if (trimmed.length > 0) {
              // If it looks like HTML but we wanted RSS, this is likely a proxy error page
              log(
                `[fetchWithFallback]${retryLabel} [${name}] Success but invalid content (HTML instead of XML). Snippet: ${trimmed.slice(0, 100)}`
              )
              throw new Error('Received HTML instead of expected XML content')
            }
          }

          if (result !== undefined) {
            return { result, all5xx: false }
          }

          throw new Error('Attempt finished without result or error')
        } catch (error) {
          attemptLastError = error

          // Check if this failure is NOT a 5xx error -> breaks the "all5xx" status
          const is5xx = error instanceof FetchError && error.status && error.status >= 500
          if (!is5xx) {
            all5xx = false
          }

          // Short-circuit on 4xx if requested (typically for Dictionary 404s)
          if (
            options.skipProxyOn4xx &&
            name === 'Direct' &&
            error instanceof FetchError &&
            error.status &&
            error.status >= 400 &&
            error.status < 500
          ) {
            log(
              `[fetchWithFallback][${correlationId}]${retryLabel} [Direct] 4xx status received (${error.status}), skipping proxies as requested.`
            )
            throw error
          }

          // If it's a proxy error, record failure
          if (currentProxyUrl) {
            CircuitBreaker.recordFailure(currentProxyUrl)
          }

          if (isParentAborted()) {
            throw error || new Error('AbortError')
          }

          const errorType =
            error instanceof NetworkError
              ? 'Network Error/CORS'
              : error instanceof FetchError
                ? `HTTP ${error.status}`
                : error instanceof Error
                  ? error.message
                  : 'Unknown'

          log(
            `[fetchWithFallback][${correlationId}]${retryLabel} [${name}] Attempt ${
              i + 1
            } failed (${errorType})${
              timeout.wasTimedOut() ? ' (Timeout)' : ''
            }. Proceeding to next...`
          )
        }
      }

      // All attempts failed
      lastError = attemptLastError
      return { all5xx }
    }

    // ===== FIRST PASS: Normal attempt chain =====
    const initialAttempts = buildAttempts(true) // Include direct fetch
    const firstPassResult = await executeAttempts(initialAttempts)

    if (firstPassResult.result !== undefined) {
      return firstPassResult.result
    }

    // ===== 5xx UPSTREAM RETRY (only if custom proxy is configured) =====
    // If all attempts failed with 5xx errors and we have a custom proxy,
    // wait 3 seconds and retry proxy-only fetches once.
    // This handles transient upstream failures (e.g., Apple API momentary outages).
    const UPSTREAM_RETRY_DELAY_MS = 3000

    if (firstPassResult.all5xx && isProxyConfigured && proxyUrl && !isParentAborted()) {
      log(
        `[fetchWithFallback][${correlationId}] All attempts failed with 5xx. Custom proxy configured. Waiting ${UPSTREAM_RETRY_DELAY_MS}ms before retry...`
      )

      // Wait 3 seconds (or until parent signal aborts)
      await sleepWithAbort(UPSTREAM_RETRY_DELAY_MS, signal)

      // Retry: Proxy-only (skip direct fetch)
      const retryAttempts = buildAttempts(false) // Exclude direct fetch
      const retryPassResult = await executeAttempts(retryAttempts, ' [RETRY]')

      if (retryPassResult.result !== undefined) {
        return retryPassResult.result
      }
    }

    throw lastError || new Error('All fetch attempts failed')
  } finally {
    // Global finally cleanup if needed
  }
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
 * Fetch text (RSS/XML) with fallback
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
