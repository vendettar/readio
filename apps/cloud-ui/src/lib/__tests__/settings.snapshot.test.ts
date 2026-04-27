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
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue(null)

    const snapshot = getSettingsSnapshot()

    expect(snapshot).toEqual({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
      pauseOnDictionaryLookup: true,
    })
  })

  it('overrides defaults with stored values if present', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
    } as runtimeConfig.AppConfig)

    // Groq is the only enabled provider in current rollout.
    // normalizeAsrPreferenceValues resets any non-enabled provider to fallback.
    vi.spyOn(storage, 'getJson').mockReturnValue({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3-turbo',
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot).toEqual({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3-turbo',
      pauseOnDictionaryLookup: true,
    })
  })

  it('preserves an explicit false pauseOnDictionaryLookup setting from storage', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue({
      pauseOnDictionaryLookup: false,
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot.pauseOnDictionaryLookup).toBe(false)
  })

  it('normalizes invalid stored provider to fallback', () => {
    vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
      ASR_PROVIDER: 'groq',
      ASR_MODEL: 'whisper-large-v3',
    } as runtimeConfig.AppConfig)

    vi.spyOn(storage, 'getJson').mockReturnValue({
      asrProvider: 'invalid-provider',
    })

    const snapshot = getSettingsSnapshot()

    expect(snapshot.asrProvider).toBe('groq')
    // Auto-selected groq model since ASR_PROVIDER is groq and input was invalid.
    // normalizeAsrPreferenceValues picks the first model if none is provided.
    expect(snapshot.asrModel).toBe('whisper-large-v3-turbo')
  })
})
