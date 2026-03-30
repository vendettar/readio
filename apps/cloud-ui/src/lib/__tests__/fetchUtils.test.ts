import { delay, HttpResponse, http } from 'msw'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/__tests__/setup'
import {
  CLOUD_BACKEND_FALLBACK_CLASSES,
  __resetCloudBackendBreakerForTests,
  buildProxyUrl,
  checkCorsProxyHealth,
  fetchWithFallback,
} from '../fetchUtils'
import type { AppConfig } from '../runtimeConfig'
import * as runtimeConfig from '../runtimeConfig'

// Mock runtimeConfig but preserve DEFAULTS
vi.mock('../runtimeConfig', async (importActual) => {
  const actual = await importActual<typeof import('../runtimeConfig')>()
  return {
    ...actual,
    getAppConfig: vi.fn(),
    isRuntimeConfigReady: vi.fn(() => true),
  }
})

describe('fetchUtils: buildProxyUrl', () => {
  const TARGET_URL = 'https://example.com/feed.xml'
  const ENCODED_TARGET = encodeURIComponent(TARGET_URL)

  it('Mode 1: Template (Recommended) - replaces {url}', () => {
    const proxyBase = 'https://mock-proxy.com/api?url={url}'
    const result = buildProxyUrl(proxyBase, TARGET_URL)
    expect(result).toBe(`https://mock-proxy.com/api?url=${ENCODED_TARGET}`)
  })

  it('Mode 2: Prefix logic (Explicit ?url=)', () => {
    const proxyBase = 'https://cf-worker.dev/?url='
    const result = buildProxyUrl(proxyBase, TARGET_URL)
    expect(result).toBe(`https://cf-worker.dev/?url=${ENCODED_TARGET}`)
  })
})

describe('fetchUtils: fetchWithFallback', () => {
  const url = 'https://internal.test/rss'

  const setupConfig = (overrides: Partial<AppConfig> = {}) => {
    vi.mocked(runtimeConfig.getAppConfig).mockReturnValue({
      PROXY_TIMEOUT_MS: 100,
      DIRECT_TIMEOUT_MS: 50,
      CORS_PROXY_URL: '',
      ...overrides,
    } as AppConfig)
    vi.mocked(runtimeConfig.isRuntimeConfigReady).mockReturnValue(true)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    server.resetHandlers()
    __resetCloudBackendBreakerForTests()
  })

  it('Scenario 1: Direct fetch success', async () => {
    setupConfig()
    server.use(
      http.get(url, () => {
        return new HttpResponse('<rss>Direct Success</rss>')
      })
    )

    const result = await fetchWithFallback(url)
    expect(result).toBe('<rss>Direct Success</rss>')
  })

  it('Scenario 2: Direct fails (CORS) and NO proxy configured', async () => {
    setupConfig({ CORS_PROXY_URL: '' })
    server.use(http.get(url, () => HttpResponse.error()))

    await expect(fetchWithFallback(url)).rejects.toThrow(/Network failure/)
  })

  it('Scenario 3: Custom Proxy priority (POST-only contract)', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({
      CORS_PROXY_URL: customProxy,
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: 'test-token',
    })

    server.use(
      // Direct fails
      http.get(url, () => HttpResponse.error()),
      // Custom Proxy success - POST contract with JSON body
      http.post(customProxy, async ({ request }) => {
        const body = (await request.json()) as { url: string; method: string }
        expect(body).toEqual({ url, method: 'GET' })
        expect(request.headers.get('x-proxy-token')).toBe('test-token')
        return new HttpResponse('<rss>Custom Success</rss>')
      })
    )

    const result = await fetchWithFallback(url)
    expect(result).toBe('<rss>Custom Success</rss>')
  })

  it('Scenario 3b: HEAD request via Custom Proxy (POST transport)', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({
      CORS_PROXY_URL: customProxy,
    })

    server.use(
      http.head(url, () => HttpResponse.error()),
      http.post(customProxy, async ({ request }) => {
        const body = (await request.json()) as { url: string; method: string }
        // Upstream wanted HEAD, but we transport as POST to proxy
        expect(body).toEqual({ url, method: 'HEAD' })
        return new HttpResponse(null, { status: 200, headers: { 'Content-Length': '123' } })
      })
    )

    const res = await fetchWithFallback<Response>(url, { method: 'HEAD', raw: true })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Length')).toBe('123')
  })

  it('Scenario 3c: POST with body and custom headers via Custom Proxy', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({ CORS_PROXY_URL: customProxy })

    server.use(
      http.post(url, () => HttpResponse.error()),
      http.post(customProxy, async ({ request }) => {
        const body = (await request.json()) as {
          url: string
          method: string
          body?: string
          headers?: Record<string, string>
        }
        // Verify contract: Proxy payload contains original method, body and headers
        expect(body.url).toBe(url)
        expect(body.method).toBe('POST')
        expect(body.body).toBe('{"foo":"bar"}')
        expect(body.headers?.['X-Auth']).toBe('secret')
        return new HttpResponse('Forwarded Success')
      })
    )

    const result = (await fetchWithFallback(url, {
      method: 'POST',
      headers: { 'X-Auth': 'secret' },
      body: '{"foo":"bar"}',
      raw: true,
    })) as Response
    const text = await result.text()
    expect(text).toBe('Forwarded Success')
  })

  it('skips invalid dynamic auth header when auth value exists but header name is empty', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({
      CORS_PROXY_URL: customProxy,
      CORS_PROXY_AUTH_HEADER: '',
      CORS_PROXY_AUTH_VALUE: 'test-token',
    })

    server.use(
      http.get(url, () => HttpResponse.error()),
      http.post(customProxy, ({ request }) => {
        expect(request.headers.get('x-proxy-token')).toBeNull()
        return new HttpResponse('<rss>Custom Success</rss>')
      })
    )

    const result = await fetchWithFallback(url)
    expect(result).toBe('<rss>Custom Success</rss>')
  })

  it('Scenario 4: Abort signal stops the chain', async () => {
    setupConfig()
    const controller = new AbortController()

    server.use(
      http.get(url, async () => {
        controller.abort()
        await delay(10)
        return new HttpResponse('Late Success')
      })
    )

    await expect(fetchWithFallback(url, { signal: controller.signal })).rejects.toThrow(/abort/i)
  })

  it('Scenario 5: Timeout skips to next in chain', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({
      CORS_PROXY_URL: customProxy,
      DIRECT_TIMEOUT_MS: 50,
      PROXY_TIMEOUT_MS: 100,
    })

    server.use(
      // Direct timeouts
      http.get(url, async () => {
        await delay(200)
        return new HttpResponse('Too Late')
      }),
      // Custom Proxy success (POST)
      http.post(customProxy, () => {
        return new HttpResponse('<rss>Custom OK</rss>')
      })
    )

    const result = await fetchWithFallback(url)
    expect(result).toBe('<rss>Custom OK</rss>')
  }, 10000)

  it('skips custom proxy when runtime config is not ready', async () => {
    const customProxy = 'https://my-proxy.com'
    setupConfig({
      CORS_PROXY_URL: customProxy,
    })
    vi.mocked(runtimeConfig.isRuntimeConfigReady).mockReturnValue(false)

    server.use(
      // Direct fails
      http.get(url, () => HttpResponse.error()),
      // Must not be called
      http.post(customProxy, () => {
        return new HttpResponse('<rss>Custom Should Not Be Used</rss>')
      })
    )

    await expect(fetchWithFallback(url)).rejects.toThrow()
  })

  it('Scenario: 5xx Upstream Retry (wait and retry proxy-only)', async () => {
    vi.useFakeTimers()
    setupConfig({
      CORS_PROXY_URL: 'https://my-proxy.com/',
      PROXY_TIMEOUT_MS: 100,
    })

    const customProxyBase = 'https://my-proxy.com/'
    let customProxyCalls = 0

    server.use(
      // 1. Direct fetch fails (500)
      http.get(url, () => {
        return new HttpResponse(null, { status: 500 })
      }),
      // 2. Custom Proxy (POST)
      http.post(customProxyBase, () => {
        customProxyCalls++
        // First attempt fails (502)
        if (customProxyCalls === 1) {
          return new HttpResponse(null, { status: 502 })
        }
        // Retry attempt succeeds
        return new HttpResponse('<rss>Retry Success</rss>', { status: 200 })
      })
    )

    try {
      const promise = fetchWithFallback(url)

      // Fast-forward passed the 3000ms delay
      await vi.advanceTimersByTimeAsync(3500)

      const result = await promise
      expect(result).toBe('<rss>Retry Success</rss>')
      expect(customProxyCalls).toBe(2) // 1 initial + 1 retry
    } finally {
      vi.useRealTimers()
    }
  })

  it('Cloud backend media fallback keeps direct success direct', async () => {
    setupConfig()
    const fetchImpl = vi.fn(async (input: string) => {
      if (input === url) {
        return new Response('<rss>Cloud Direct Success</rss>')
      }
      throw new Error(`unexpected fetch target: ${input}`)
    })

    const result = await fetchWithFallback(url, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.TRANSCRIPT,
    })

    expect(result).toBe('<rss>Cloud Direct Success</rss>')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith(url, expect.objectContaining({ method: 'GET' }))
  })

  it('Cloud backend media fallback routes direct network failure to /api/proxy', async () => {
    setupConfig()
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === url) {
        throw new TypeError('Failed to fetch')
      }

      if (input === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          url: string
          method: string
          headers?: Record<string, string>
        }
        expect(body.url).toBe(url)
        expect(body.method).toBe('GET')
        expect(body.headers?.Range).toBe('bytes=10-99')
        return new Response('', {
          status: 206,
          headers: {
            'content-range': 'bytes 10-99/1000',
          },
        })
      }

      throw new Error(`unexpected fetch target: ${input}`)
    })

    const res = await fetchWithFallback<Response>(url, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      raw: true,
      headers: { Range: 'bytes=10-99' },
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.AUDIO_PREFETCH_RANGE,
    })

    expect(res.status).toBe(206)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('Cloud backend media fallback treats direct timeout aborts as fallback-eligible', async () => {
    vi.useFakeTimers()
    setupConfig()

    try {
      const fetchImpl = vi.fn((input: string, init?: RequestInit) => {
        if (input === url) {
          return new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener(
              'abort',
              () => reject(new DOMException('Aborted', 'AbortError')),
              { once: true }
            )
          })
        }

        if (input === '/api/proxy') {
          return Promise.resolve(new Response('<rss>Recovered After Timeout</rss>'))
        }

        throw new Error(`unexpected fetch target: ${input}`)
      })

      const promise = fetchWithFallback(url, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.TRANSCRIPT,
      })

      await vi.advanceTimersByTimeAsync(60)

      await expect(promise).resolves.toBe('<rss>Recovered After Timeout</rss>')
      expect(fetchImpl).toHaveBeenCalledTimes(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('Cloud backend media fallback retries direct 5xx raw responses through /api/proxy', async () => {
    setupConfig()
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) => {
      if (input === url) {
        return new Response('upstream failed', { status: 500 })
      }

      if (input === '/api/proxy') {
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          url: string
          method: string
        }
        expect(body.url).toBe(url)
        expect(body.method).toBe('GET')
        return new Response('audio-bytes', {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
          },
        })
      }
      throw new Error(`unexpected fetch target: ${input}`)
    })

    const res = await fetchWithFallback<Response>(url, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      raw: true,
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_GET,
    })

    expect(res.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('Cloud backend media fallback keeps raw 416 terminal without proxy recursion', async () => {
    setupConfig()
    const fetchImpl = vi.fn(async (input: string) => {
      if (input === url) {
        return new Response('', { status: 416 })
      }
      throw new Error(`unexpected fetch target: ${input}`)
    })

    await expect(
      fetchWithFallback<Response>(url, {
        fetchImpl: fetchImpl as unknown as typeof fetch,
        raw: true,
        cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_GET,
      })
    ).rejects.toThrow(/416/)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('Cloud backend breaker bypasses repeated direct failures after the threshold', async () => {
    setupConfig()
    let directCalls = 0
    let proxyCalls = 0
    const fetchImpl = vi.fn(async (input: string) => {
      if (input === url) {
        directCalls++
        throw new TypeError('Failed to fetch')
      }

      if (input === '/api/proxy') {
        proxyCalls++
        return new Response('<rss>Proxy Success</rss>')
      }

      throw new Error(`unexpected fetch target: ${input}`)
    })

    const options = {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_HEAD,
    }

    await fetchWithFallback(url, options)
    await fetchWithFallback(url, options)
    await fetchWithFallback(url, options)

    expect(directCalls).toBe(2)
    expect(proxyCalls).toBe(3)
  })
})

describe('fetchUtils: checkCorsProxyHealth', () => {
  const setupConfig = (overrides: Partial<AppConfig> = {}) => {
    vi.mocked(runtimeConfig.getAppConfig).mockReturnValue({
      CORS_PROXY_URL: '',
      ...overrides,
    } as AppConfig)
  }

  beforeEach(() => {
    vi.clearAllMocks()
    server.resetHandlers()
  })

  it('reports "custom" type when using user proxy (POST contract)', async () => {
    const myProxy = 'https://my-worker.io'
    setupConfig({
      CORS_PROXY_URL: myProxy,
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: 'test-token',
    })

    server.use(
      http.post(myProxy, () => {
        return new HttpResponse('OK')
      })
    )

    const result = await checkCorsProxyHealth()
    expect(result.ok).toBe(true)
  })

  it('uses runtime proxy overrides (unsaved form values) during verify', async () => {
    setupConfig({ CORS_PROXY_URL: '' })
    const formProxy = 'https://unsaved-proxy.example'

    server.use(
      http.post(formProxy, ({ request }) => {
        expect(request.headers.get('x-proxy-token')).toBe('preview-secret')
        return new HttpResponse('OK')
      })
    )

    const result = await checkCorsProxyHealth({
      proxyConfig: {
        proxyUrl: formProxy,
        authHeader: 'x-proxy-token',
        authValue: 'preview-secret',
      },
    })

    expect(result.ok).toBe(true)
    expect(result.proxyUrl).toBe(formProxy)
  })

  it('reports failed state cleanly when no proxy and health check fails', async () => {
    setupConfig({ CORS_PROXY_URL: '' })
    const result = await checkCorsProxyHealth()
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBe('No proxy configured')
    }
  })
})
