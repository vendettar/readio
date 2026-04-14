import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('selection api dictionary transport', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses direct fetch without /api/proxy fallback when transport is direct', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            word: 'hello',
            meanings: [],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')
    await fetchDefinition('Hello')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'https://english.example/api/hello',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
      })
    )
  })

  it('uses same-origin /api/proxy directly when transport is go-proxy', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            word: 'hello',
            meanings: [],
          },
        ]),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')
    await fetchDefinition('Hello')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/proxy',
      expect.objectContaining({
        method: 'POST',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
      })
    )

    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(requestInit.body))).toEqual({
      url: 'https://english.example/api/hello',
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
    })
  })

  it('does not fallback to /api/proxy after a direct failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('upstream boom', {
        status: 503,
        headers: { 'content-type': 'text/plain' },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')

    await expect(fetchDefinition('Hello')).rejects.toThrow('upstream boom')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://english.example/api/hello')
  })

  it('maps dictionaryapi.dev 404 contract to Word not found in direct mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          title: 'No Definitions Found',
          message: "Sorry pal, we couldn't find definitions for the word you were looking for.",
          resolution: 'You can try the search again at later time or head to the web instead.',
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('Word not found')
  })

  it('does not collapse /api/proxy 4xx errors into Word not found', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'proxy authentication failed',
        }),
        {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('proxy authentication failed')
  })

  it('does not collapse /api/proxy 404 responses without dictionaryapi.dev not-found payload into Word not found', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          message: 'proxy route missing',
        }),
        {
          status: 404,
          headers: { 'content-type': 'application/json' },
        }
      )
    )
    vi.stubGlobal('fetch', fetchMock)

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

    const { fetchDefinition } = await import('../selection/api')
    await expect(fetchDefinition('Hello')).rejects.toThrow('proxy route missing')
  })
})
