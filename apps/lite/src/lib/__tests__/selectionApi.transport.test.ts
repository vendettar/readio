import { HttpResponse, http } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { server } from '@/__tests__/setup'

describe('selection api dictionary transport', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses direct fetch without proxy fallback when transport is direct', async () => {
    const proxySpy = vi.fn()
    server.use(
      http.get('https://english.example/api/hello', () =>
        HttpResponse.json([
          {
            word: 'hello',
            meanings: [],
          },
        ])
      ),
      http.post('https://proxy.example', async ({ request }) => {
        proxySpy(await request.json())
        return HttpResponse.json({ proxied: true })
      })
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'direct',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')
    await fetchDefinition('Hello')

    expect(proxySpy).not.toHaveBeenCalled()
  })

  it('uses the configured custom proxy directly when transport is go-proxy', async () => {
    const requestSpy = vi.fn()
    server.use(
      http.post('https://proxy.example/relay', async ({ request }) => {
        requestSpy({
          headers: Object.fromEntries(request.headers.entries()),
          body: await request.json(),
        })
        return HttpResponse.json([
          {
            word: 'hello',
            meanings: [],
          },
        ])
      })
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'go-proxy',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example/relay',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')
    await fetchDefinition('Hello')

    expect(requestSpy).toHaveBeenCalledTimes(1)
    expect(requestSpy).toHaveBeenCalledWith({
      headers: expect.objectContaining({
        'content-type': 'application/json',
        'x-proxy-token': 'secret',
      }),
      body: {
        url: 'https://english.example/api/hello',
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      },
    })
  })

  it('does not fallback to proxy after a direct failure', async () => {
    const proxySpy = vi.fn()
    server.use(
      http.get(
        'https://english.example/api/hello',
        () => new HttpResponse('upstream boom', { status: 503 })
      ),
      http.post('https://proxy.example/relay', async ({ request }) => {
        proxySpy(await request.json())
        return HttpResponse.json({ proxied: true })
      })
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'direct',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example/relay',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')

    await expect(fetchDefinition('Hello')).rejects.toThrow('upstream boom')
    expect(proxySpy).not.toHaveBeenCalled()
  })

  it('maps dictionaryapi.dev 404 contract to Word not found in direct mode', async () => {
    server.use(
      http.get('https://english.example/api/hello', () =>
        HttpResponse.json(
          {
            title: 'No Definitions Found',
            message: "Sorry pal, we couldn't find definitions for the word you were looking for.",
            resolution: 'You can try the search again at later time or head to the web instead.',
          },
          { status: 404 }
        )
      )
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'direct',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example/relay',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('Word not found')
  })

  it('does not collapse proxy auth/config 4xx into Word not found', async () => {
    server.use(
      http.post('https://proxy.example/relay', () =>
        HttpResponse.json(
          {
            message: 'proxy authentication failed',
          },
          { status: 401 }
        )
      )
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'go-proxy',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example/relay',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('proxy authentication failed')
  })

  it('does not collapse direct 4xx that do not match dictionaryapi.dev not-found contract', async () => {
    server.use(
      http.get('https://english.example/api/hello', () =>
        HttpResponse.json(
          {
            message: 'dictionary access denied',
          },
          { status: 403 }
        )
      )
    )

    vi.doMock('../runtimeConfig', () => ({
      getAppConfig: () => ({
        EN_DICTIONARY_API_URL: 'https://english.example/api',
        EN_DICTIONARY_API_TRANSPORT: 'direct',
        PROXY_TIMEOUT_MS: 1234,
      }),
    }))
    vi.doMock('../selection/dictCache', () => ({
      getCachedEntry: vi.fn(() => null),
      setCachedEntry: vi.fn(),
    }))
    vi.doMock('../networking/proxyUrl', () => ({
      getCorsProxyConfig: () => ({
        proxyUrl: 'https://proxy.example/relay',
        authHeader: 'x-proxy-token',
        authValue: 'secret',
      }),
    }))

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('dictionary access denied')
  })
})
