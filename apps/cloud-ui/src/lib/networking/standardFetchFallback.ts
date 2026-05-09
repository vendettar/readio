import { log } from '../logger'
import { getAppConfig, isRuntimeConfigReady } from '../runtimeConfig'
import { CircuitBreaker } from './circuitBreaker'
import { FetchError, type FetchSource, NetworkError } from './fetchErrors'
import { buildProxyAuthHeaders } from './proxyAuth'
import { getNetworkProxyConfig } from './proxyUrl'
import { createTimeoutController, sleepWithAbort } from './timeouts'

export interface StandardFetchFallbackOptions {
  signal?: AbortSignal
  timeoutMs?: number
  json?: boolean
  expectXml?: boolean
  headers?: Record<string, string>
  skipProxyOn4xx?: boolean
  forceProxy?: boolean
  raw?: boolean
  method?: string
  purpose?: string
  body?: string
}

interface StructuredErrorPayload {
  code?: unknown
  message?: unknown
  request_id?: unknown
}

function parseStructuredErrorPayload(text: string): StructuredErrorPayload | null {
  if (!text.trim()) return null

  try {
    const value = JSON.parse(text) as unknown
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as StructuredErrorPayload)
      : null
  } catch {
    return null
  }
}

async function toFetchErrorFromResponse(
  response: Response,
  options: {
    url: string
    source: FetchSource
    defaultMessage: string
  }
): Promise<FetchError> {
  const text = await response.text()
  const payload = parseStructuredErrorPayload(text)
  const message =
    typeof payload?.message === 'string' && payload.message.trim()
      ? payload.message
      : text.trim() || options.defaultMessage

  return new FetchError(message, options.url, response.status, options.source, {
    code: typeof payload?.code === 'string' ? payload.code : undefined,
    requestId: typeof payload?.request_id === 'string' ? payload.request_id : undefined,
  })
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

      const is5xx = error instanceof FetchError && error.status && error.status >= 500
      if (attempt < maxRetries && is5xx) {
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

export async function fetchStandardWithFallback<T = string>(
  url: string,
  options: StandardFetchFallbackOptions = {}
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
  } = options
  let lastError: unknown

  const isParentAborted = () => !!signal?.aborted
  const correlationId = Math.random().toString(16).slice(2, 6)

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
        throw await toFetchErrorFromResponse(response, {
          url,
          source: 'direct',
          defaultMessage: `Direct fetch failed: ${response.status}`,
        })
      }
      if (raw) return response as unknown as T
      return json ? await response.json() : ((await response.text()) as unknown as T)
    } catch (error) {
      if (error instanceof TypeError) {
        throw new NetworkError('Network failure during direct fetch')
      }
      throw error
    }
  }

  const fetchViaProxyFallback = async (
    baseProxyUrl: string,
    source: FetchSource,
    attemptSignal: AbortSignal
  ): Promise<T> => {
    const proxyAuthHeaders = buildProxyAuthHeaders(getNetworkProxyConfig())
    const init: RequestInit = { signal: attemptSignal, credentials: 'omit' }

    init.method = 'POST'
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
        throw await toFetchErrorFromResponse(response, {
          url,
          source,
          defaultMessage: `Proxy (${baseProxyUrl}) failed: ${response.status}`,
        })
      }
      if (raw) return response as unknown as T
      if (json) return await response.json()
      return (await response.text()) as unknown as T
    } catch (error) {
      if (error instanceof TypeError) {
        throw new NetworkError(`Network failure during proxy fetch (${source})`)
      }
      throw error
    }
  }

  const runtimeConfigReady = isRuntimeConfigReady()
  const { proxyUrl, authHeader, authValue } = getNetworkProxyConfig()
  const isProxyConfigured = !!proxyUrl && runtimeConfigReady && (!authHeader || !!authValue)
  if (import.meta.env.DEV && proxyUrl && !isProxyConfigured) {
    log(
      `[fetchWithFallback] Skip custom proxy: runtimeReady=${runtimeConfigReady}, authHeaderSet=${!!authHeader}, authValueSet=${!!authValue}`
    )
  }

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
        fn: (attemptSignal) => fetchViaProxyFallback(proxyUrl, 'customProxy', attemptSignal),
      })
    }

    return attemptList
  }

  const executeAttempts = async (
    attempts: Attempt[],
    retryLabel = ''
  ): Promise<{ result?: T; all5xx: boolean }> => {
    let attemptLastError: unknown
    let all5xx = true

    for (let index = 0; index < attempts.length; index++) {
      const { name, fn } = attempts[index]
      let result: T | undefined
      const timeout = createTimeoutController(
        name === 'Direct' ? getAppConfig().DIRECT_TIMEOUT_MS : timeoutMs,
        signal
      )
      const currentProxyUrl = name === 'CustomProxy' ? proxyUrl : null
      const purposeLabel = purpose ? ` [${purpose}]` : ''

      try {
        log(
          `[fetchWithFallback][${correlationId}]${retryLabel}${purposeLabel} [${name}] Attempt ${index + 1}/${attempts.length} for: ${url}`
        )

        try {
          result = await withRetry(() => fn(timeout.controller.signal), {
            maxRetries: 0,
            signal: timeout.controller.signal,
            name: `[${name}]`,
          })
        } finally {
          timeout.cleanup()
        }

        if (currentProxyUrl) {
          CircuitBreaker.recordSuccess(currentProxyUrl)
        }

        const shouldValidateXml = !json && options.expectXml !== false
        if (shouldValidateXml && typeof result === 'string') {
          const trimmed = result.trim()
          if (
            trimmed.length > 0 &&
            trimmed.startsWith('<') &&
            !trimmed.toLowerCase().startsWith('<!doctype html')
          ) {
            if (result !== undefined) {
              return { result, all5xx: false }
            }
          }
          if (trimmed.length > 0) {
            log(
              `[fetchWithFallback]${retryLabel} [${name}] Success but invalid content (HTML instead of structured markup). Snippet: ${trimmed.slice(0, 100)}`
            )
            throw new FetchError(
              'Received HTML instead of expected structured markup content',
              url,
              undefined,
              name === 'Direct' ? 'direct' : 'customProxy',
              { code: 'invalid_structured_markup' }
            )
          }
        }

        if (result !== undefined) {
          return { result, all5xx: false }
        }

        throw new Error('Attempt finished without result or error')
      } catch (error) {
        attemptLastError = error

        const is5xx = error instanceof FetchError && error.status && error.status >= 500
        if (!is5xx) {
          all5xx = false
        }

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
              ? error.status !== undefined
                ? `HTTP ${error.status}`
                : error.message
              : error instanceof Error
                ? error.message
                : 'Unknown'

        log(
          `[fetchWithFallback][${correlationId}]${retryLabel} [${name}] Attempt ${
            index + 1
          } failed (${errorType})${timeout.wasTimedOut() ? ' (Timeout)' : ''}. Proceeding to next...`
        )
      }
    }

    lastError = attemptLastError
    return { all5xx }
  }

  const initialAttempts = buildAttempts(true)
  const firstPassResult = await executeAttempts(initialAttempts)
  if (firstPassResult.result !== undefined) {
    return firstPassResult.result
  }

  const UPSTREAM_RETRY_DELAY_MS = 3000
  if (firstPassResult.all5xx && isProxyConfigured && proxyUrl && !isParentAborted()) {
    log(
      `[fetchWithFallback][${correlationId}] All attempts failed with 5xx. Custom proxy configured. Waiting ${UPSTREAM_RETRY_DELAY_MS}ms before retry...`
    )

    await sleepWithAbort(UPSTREAM_RETRY_DELAY_MS, signal)

    const retryAttempts = buildAttempts(false)
    const retryPassResult = await executeAttempts(retryAttempts, ' [RETRY]')
    if (retryPassResult.result !== undefined) {
      return retryPassResult.result
    }
  }

  throw lastError || new Error('All fetch attempts failed')
}
