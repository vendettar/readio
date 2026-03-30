import { HttpResponse, http } from 'msw'
import { server } from '@/__tests__/setup'
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
      READIO_CORS_PROXY_URL: 'https://proxy.example.com',
      READIO_PROXY_TIMEOUT_MS: '1234',
      READIO_EN_DICTIONARY_API_TRANSPORT: 'direct',
      READIO_DEFAULT_LANGUAGE: 'ZH-CN',
      READIO_DEFAULT_PODCAST_CONTENT_COUNTRY: 'JP',
      READIO_USE_MOCK: '1',
      READIO_ASR_API_KEY: 'public_asr_token',
      READIO_OPENAI_API_KEY: 'public_translate_token',
      READIO_FALLBACK_PODCAST_IMAGE: '/placeholder.svg',
    }

    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.CORS_PROXY_URL).toBe('https://proxy.example.com')
    expect(config.PROXY_TIMEOUT_MS).toBe(1234)
    expect(config.EN_DICTIONARY_API_TRANSPORT).toBe('direct')
    expect(config.DEFAULT_LANGUAGE).toBe('zh')
    expect(config.DEFAULT_COUNTRY).toBe('JP')
    expect(config.USE_MOCK_DATA).toBe(true)
    expect(config.ASR_API_KEY).toBe('public_asr_token')
    expect(config.OPENAI_API_KEY).toBe('public_translate_token')
    expect(config.FALLBACK_PODCAST_IMAGE).toBe('/placeholder.svg')
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
      READIO_CORS_PROXY_AUTH_HEADER: 'authorization',
      READIO_MAX_CONCURRENT_REQUESTS: '-1',
    }

    const { getAppConfig, DEFAULTS } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.CORS_PROXY_AUTH_HEADER).toBe(DEFAULTS.CORS_PROXY_AUTH_HEADER)
    expect(config.MAX_CONCURRENT_REQUESTS).toBe(DEFAULTS.MAX_CONCURRENT_REQUESTS)
  })

  it('accepts the English-specific dictionary env key and ignores the legacy generic key', async () => {
    const env = {} as Window['__READIO_ENV__'] & Record<string, string>
    env.READIO_EN_DICTIONARY_API_URL = 'https://english.example/api/'
    env.READIO_DICTIONARY_API_URL = 'https://legacy.example/api/'
    window.__READIO_ENV__ = env

    const { getAppConfig, DEFAULTS } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(config.EN_DICTIONARY_API_URL).toBe('https://english.example/api/')

    const legacyOnlyEnv = {} as Window['__READIO_ENV__'] & Record<string, string>
    legacyOnlyEnv.READIO_DICTIONARY_API_URL = 'https://legacy-only.example/api/'
    window.__READIO_ENV__ = legacyOnlyEnv
    vi.resetModules()

    const { getAppConfig: getAppConfigWithLegacyOnly } = await import('../runtimeConfig')
    const legacyOnlyConfig = getAppConfigWithLegacyOnly()
    expect(legacyOnlyConfig.EN_DICTIONARY_API_URL).toBe(DEFAULTS.EN_DICTIONARY_API_URL)
  })

  it('defaults dictionary transport to direct and accepts only supported values', async () => {
    const { getAppConfig, DEFAULTS } = await import('../runtimeConfig')
    const config = getAppConfig()
    expect(config.EN_DICTIONARY_API_TRANSPORT).toBe('direct')
    expect(DEFAULTS.EN_DICTIONARY_API_TRANSPORT).toBe('direct')

    window.__READIO_ENV__ = {
      READIO_EN_DICTIONARY_API_TRANSPORT: 'go-proxy',
    }
    vi.resetModules()

    const { getAppConfig: getAppConfigWithProxy } = await import('../runtimeConfig')
    expect(getAppConfigWithProxy().EN_DICTIONARY_API_TRANSPORT).toBe('go-proxy')

    window.__READIO_ENV__ = {
      READIO_EN_DICTIONARY_API_TRANSPORT: 'fallback',
    } as Window['__READIO_ENV__']
    vi.resetModules()

    const { getAppConfig: getAppConfigWithInvalid } = await import('../runtimeConfig')
    expect(getAppConfigWithInvalid().EN_DICTIONARY_API_TRANSPORT).toBe('direct')
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

  it('uses the English-specific dictionary config field for definition requests', async () => {
    const dictionarySpy = vi.fn()
    server.use(
      http.get('https://english.example/api/hello', ({ request }) => {
        dictionarySpy(request.url)
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

    expect(dictionarySpy).toHaveBeenCalledWith('https://english.example/api/hello')
  })
})
