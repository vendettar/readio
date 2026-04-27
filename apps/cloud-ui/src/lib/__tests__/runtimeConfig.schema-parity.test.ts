import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveEnabledAsrProviders } from '../asr/providerToggles'

const logErrorMock = vi.hoisted(() => vi.fn())

vi.mock('../logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

describe('runtimeConfig schema parity', () => {
  beforeEach(() => {
    vi.resetModules()
    logErrorMock.mockReset()
    const globalWindow = globalThis as { window?: Window & typeof globalThis }
    globalWindow.window = globalWindow.window || ({} as Window & typeof globalThis)
    window.__READIO_ENV__ = undefined
  })

  it('maps representative runtime env values with expected coercion', async () => {
    window.__READIO_ENV__ = {
      READIO_NETWORK_PROXY_URL: 'https://proxy.example.com',
      READIO_NETWORK_PROXY_AUTH_HEADER: 'x-proxy-token',
      READIO_NETWORK_PROXY_AUTH_VALUE: 'proxy-public-token',
      READIO_ASR_RELAY_PUBLIC_TOKEN: 'relay-public-token',
      READIO_PROXY_TIMEOUT_MS: '1234',
      READIO_DEFAULT_LANGUAGE: 'ZH-CN',
      READIO_DEFAULT_PODCAST_CONTENT_COUNTRY: 'JP',
      READIO_USE_MOCK: '1',
      READIO_ASR_API_KEY: 'public_asr_token',
      READIO_OPENAI_API_KEY: 'public_translate_token',
      READIO_FALLBACK_PODCAST_IMAGE: '/placeholder.svg',
    }

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.NETWORK_PROXY_URL).toBe('https://proxy.example.com')
    expect(config.NETWORK_PROXY_AUTH_HEADER).toBe('x-proxy-token')
    expect(config.NETWORK_PROXY_AUTH_VALUE).toBe('proxy-public-token')
    expect(config.ASR_RELAY_PUBLIC_TOKEN).toBe('relay-public-token')
    expect(config.PROXY_TIMEOUT_MS).toBe(1234)
    expect(config.DEFAULT_LANGUAGE).toBe('zh')
    expect(config.DEFAULT_COUNTRY).toBe('JP')
    expect(config.USE_MOCK_DATA).toBe(true)
    expect(config.ASR_API_KEY).toBe('public_asr_token')
    expect(config.OPENAI_API_KEY).toBe('public_translate_token')
    expect(config.FALLBACK_PODCAST_IMAGE).toBe('/placeholder.svg')
  })

  it('accepts the default same-origin proxy route as a relative runtime URL', async () => {
    window.__READIO_ENV__ = {
      READIO_NETWORK_PROXY_URL: '/api/proxy',
    }

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.NETWORK_PROXY_URL).toBe('/api/proxy')
  })

  it('rejects known upstream secret key formats from browser runtime env', async () => {
    window.__READIO_ENV__ = {
      READIO_ASR_API_KEY: 'sk-secret-like-value',
      READIO_OPENAI_API_KEY: 'sk-proj-secret-like-value',
    }

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.ASR_API_KEY).toBe('')
    expect(config.OPENAI_API_KEY).toBe('')
  })

  it('falls back to defaults on invalid values', async () => {
    window.__READIO_ENV__ = {
      READIO_NETWORK_PROXY_AUTH_HEADER: 'authorization',
      READIO_MAX_CONCURRENT_REQUESTS: '-1',
    }

    const { getAppConfig, DEFAULTS } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.NETWORK_PROXY_AUTH_HEADER).toBe(DEFAULTS.NETWORK_PROXY_AUTH_HEADER)
    expect(config.MAX_CONCURRENT_REQUESTS).toBe(DEFAULTS.MAX_CONCURRENT_REQUESTS)
  })

  it('accepts the English-specific dictionary env key and ignores the obsolete generic key', async () => {
    const env = {} as Window['__READIO_ENV__'] & Record<string, string>
    env.READIO_EN_DICTIONARY_API_URL = 'https://english.example/api/'
    env.READIO_DICTIONARY_API_URL = 'https://obsolete.example/api/'
    window.__READIO_ENV__ = env

    const { getAppConfig, DEFAULTS } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.EN_DICTIONARY_API_URL).toBe('https://english.example/api/')

    const obsoleteOnlyEnv = {} as Window['__READIO_ENV__'] & Record<string, string>
    obsoleteOnlyEnv.READIO_DICTIONARY_API_URL = 'https://obsolete-only.example/api/'
    window.__READIO_ENV__ = obsoleteOnlyEnv
    vi.resetModules()

    const { getAppConfig: getAppConfigWithObsoleteOnly } = await import('../runtimeConfig')
    const obsoleteOnlyConfig = getAppConfigWithObsoleteOnly()
    expect(obsoleteOnlyConfig.EN_DICTIONARY_API_URL).toBe(DEFAULTS.EN_DICTIONARY_API_URL)
  })

  it('surfaces invalid toggle tokens and fails closed (no all-open fallback)', async () => {
    window.__READIO_ENV__ = {
      READIO_ENABLED_ASR_PROVIDERS: 'groq,unknown-provider',
      READIO_DISABLED_ASR_PROVIDERS: 'qwen,not-real',
    }

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()
    const enabledProviders = resolveEnabledAsrProviders(config)

    expect(enabledProviders).toEqual([])
    expect(logErrorMock).toHaveBeenCalled()
    const errorLogCall = logErrorMock.mock.calls.find(([message]) =>
      String(message).includes('Unexpected schema parse failure')
    )
    expect(errorLogCall).toBeTruthy()
    expect(JSON.stringify(errorLogCall)).toContain('READIO_ENABLED_ASR_PROVIDERS')
    expect(JSON.stringify(errorLogCall)).toContain('READIO_DISABLED_ASR_PROVIDERS')
  })

  it('uses issue.path for toggle fail-closed classification, not message text', async () => {
    window.__READIO_ENV__ = {
      READIO_ENABLED_ASR_PROVIDERS: 'groq',
      READIO_DISABLED_ASR_PROVIDERS: '',
    }

    const runtimeConfigSchema = await import('../runtimeConfig.schema')
    const originalParse = runtimeConfigSchema.AppConfigSchema.parse.bind(
      runtimeConfigSchema.AppConfigSchema
    )
    let firstCall = true

    const parseSpy = vi
      .spyOn(runtimeConfigSchema.AppConfigSchema, 'parse')
      .mockImplementation((input: unknown) => {
        if (firstCall) {
          firstCall = false
          throw {
            issues: [
              {
                path: ['ENABLED_ASR_PROVIDERS'],
                message: 'generic-error-without-env-keywords',
              },
            ],
          }
        }
        return originalParse(input as never)
      })

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()
    const enabledProviders = resolveEnabledAsrProviders(config)

    expect(enabledProviders).toEqual([])
    parseSpy.mockRestore()
  })

  // Must match apps/cloud-api/browser-env-allowlist.json
  const GO_BROWSER_ENV_ALLOWLIST = [
    'READIO_APP_NAME',
    'READIO_APP_VERSION',
    'READIO_ASR_RELAY_PUBLIC_TOKEN',
    'READIO_ASR_PROVIDER',
    'READIO_ASR_MODEL',
    'READIO_ENABLED_ASR_PROVIDERS',
    'READIO_DISABLED_ASR_PROVIDERS',
    'READIO_EN_DICTIONARY_API_URL',
    'READIO_EN_DICTIONARY_API_TRANSPORT',
    'READIO_DEFAULT_PODCAST_CONTENT_COUNTRY',
    'READIO_DEFAULT_LANGUAGE',
    'READIO_FALLBACK_PODCAST_IMAGE',
    'READIO_NETWORK_PROXY_URL',
    'READIO_NETWORK_PROXY_AUTH_HEADER',
    'READIO_NETWORK_PROXY_AUTH_VALUE',
  ] as const

  it('verifies Go allowlist keys exist in frontend ENV_MAP', async () => {
    const { ENV_MAP } = await import('../runtimeConfig.schema')
    const envMapValues = new Set(Object.values(ENV_MAP))

    for (const goKey of GO_BROWSER_ENV_ALLOWLIST) {
      expect(envMapValues).toContain(goKey)
    }
  })

  it('uses the English-specific dictionary config field for definition requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            word: 'hello',
            meanings: [],
          },
        ]),
        {
          status: 200,
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
    await fetchDefinition('Hello')

    expect(fetchMock).toHaveBeenCalledWith(
      'https://english.example/api/hello',
      expect.objectContaining({
        method: 'GET',
        credentials: 'omit',
      })
    )
  })
})
