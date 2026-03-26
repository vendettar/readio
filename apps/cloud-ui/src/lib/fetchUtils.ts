import { log } from './logger'
import { CircuitBreaker, CircuitTripError } from './networking/circuitBreaker'
import { buildProxyUrl, getCorsProxyConfig } from './networking/proxyUrl'
import { createTimeoutController, sleepWithAbort } from './networking/timeouts'
import { getAppConfig, isRuntimeConfigReady } from './runtimeConfig'

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
  const timeoutMs = options?.timeoutMs ?? 8000
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

export interface FetchWithFallbackOptions {
  signal?: AbortSignal
  timeoutMs?: number
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
  /** Optional request body (string). Forwarded to both direct fetch and proxy. */
  body?: string
}

type FetchSource = 'direct' | 'customProxy'

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
            `[fetchWithFallback]${retryLabel}${purposeLabel} [${name}] Attempt ${i + 1}/${attempts.length} for: ${url}`
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
              `[fetchWithFallback]${retryLabel} [Direct] 4xx status received (${error.status}), skipping proxies as requested.`
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

          log(
            `[fetchWithFallback]${retryLabel} [${name}] Attempt ${i + 1} failed ${
              timeout.wasTimedOut() ? '(Timeout)' : ''
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
        `[fetchWithFallback] All attempts failed with 5xx. Custom proxy configured. Waiting ${UPSTREAM_RETRY_DELAY_MS}ms before retry...`
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
  return fetchWithFallback<string>(url, {
    ...options,
    json: false,
    expectXml: options.expectXml ?? true,
  })
}
