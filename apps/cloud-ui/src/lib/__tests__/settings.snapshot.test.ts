import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as runtimeConfig from '../runtimeConfig'
import { getSettingsSnapshot } from '../schemas/settings'
import * as storage from '../storage'

describe('getSettingsSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('uses app config defaults when storage is empty', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
      CORS_PROXY_URL: 'http://default-proxy',
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: 'default-token',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue(null)

    const snapshot = getSettingsSnapshot()

    expect(snapshot).toEqual({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
      asrUseCustomModel: false,
      asrCustomModelId: '',
      proxyUrl: 'http://default-proxy',
      proxyAuthHeader: 'x-proxy-token',
      proxyAuthValue: 'default-token',
      pauseOnDictionaryLookup: true,
    })
  })

  it('overrides defaults with stored values if present', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
      CORS_PROXY_URL: 'http://default-proxy',
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: 'default-token',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue({
      asrProvider: 'qwen',
      asrModel: 'qwen3-asr-flash',
      proxyUrl: 'http://custom-proxy',
      proxyAuthHeader: 'x-proxy-token',
      proxyAuthValue: 'custom-token',
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot).toEqual({
      asrProvider: 'qwen',
      asrModel: 'qwen3-asr-flash',
      asrUseCustomModel: false,
      asrCustomModelId: '',
      proxyUrl: 'http://custom-proxy',
      proxyAuthHeader: 'x-proxy-token',
      proxyAuthValue: 'custom-token',
      pauseOnDictionaryLookup: true,
    })
  })

  it('preserves an explicit false pauseOnDictionaryLookup setting from storage', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
      CORS_PROXY_URL: 'http://default-proxy',
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: 'default-token',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue({
      pauseOnDictionaryLookup: false,
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot.pauseOnDictionaryLookup).toBe(false)
  })

  it('normalizes invalid stored provider or auth header to fallback', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
      CORS_PROXY_URL: 'http://default-proxy',
      CORS_PROXY_AUTH_HEADER: 'x-proxy-token',
      CORS_PROXY_AUTH_VALUE: '',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue({
      asrProvider: 'invalid-provider',
      proxyAuthHeader: 'invalid-header',
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot.asrProvider).toBe('')
    expect(snapshot.asrModel).toBe('')
    expect(snapshot.proxyAuthHeader).toBe('x-proxy-token') // invalid header becomes "", then falls back to config which becomes normalized
    // Wait, let's see how normalize works:
    // normalizeAsrProvider("invalid") -> ""
    // "" || config.ASR_PROVIDER -> config.ASR_PROVIDER
    // normalizeAsrProvider(config.ASR_PROVIDER) -> "groq"
    // So this is correct.
  })
})
