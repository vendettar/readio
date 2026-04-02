import { afterEach, describe, expect, it, vi } from 'vitest'
import * as runtimeConfig from '../../runtimeConfig'
import { DEFAULTS } from '../../runtimeConfig.defaults'
import {
  createSettingsFormSchema,
  getEnabledAsrProviders,
  normalizeAsrPreferenceValues,
} from '../settings'

function makeBaseSettings() {
  return {
    asrProvider: '',
    asrModel: '',

    translateKey: '',
    asrKey: '',
    proxyUrl: '',
    proxyAuthHeader: '',
    proxyAuthValue: '',
    pauseOnDictionaryLookup: true,
  }
}

function mockAppConfig(
  overrides: Partial<ReturnType<typeof runtimeConfig.getAppConfig>>
): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(runtimeConfig, 'getAppConfig').mockReturnValue({
    ...DEFAULTS,
    ASR_API_KEY: '',
    ENABLED_ASR_PROVIDERS: '',
    DISABLED_ASR_PROVIDERS: '',
    ...overrides,
  } as ReturnType<typeof runtimeConfig.getAppConfig>)
}

describe('settings schema', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('accepts empty proxy auth header', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse(makeBaseSettings())
    expect(result.success).toBe(true)
  })

  it('accepts x-proxy-token as proxy auth header', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      proxyAuthHeader: 'x-proxy-token',
      proxyAuthValue: 'secret',
    })
    expect(result.success).toBe(true)
  })

  it('rejects unsupported proxy auth header', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      proxyAuthHeader: 'authorization',
      proxyAuthValue: 'secret',
    })

    expect(result.success).toBe(false)
  })

  it('accepts valid provider+model pair', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
    })
    expect(result.success).toBe(true)
  })

  it('rejects invalid provider/model pair', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'groq',
      asrModel: 'qwen3-asr-flash',
    })
    expect(result.success).toBe(false)
  })

  it('accepts valid deepgram provider+model pair', () => {
    // TODO: This should be true, but currently blocked by temporary restriction in providerToggles.ts
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'deepgram',
      asrModel: 'nova-3',
    })
    expect(result.success).toBe(false)
  })

  it('rejects invalid deepgram provider/model pair', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'deepgram',
      asrModel: 'qwen3-asr-flash',
    })
    expect(result.success).toBe(false)
  })

  it('allows empty ASR fields when ASR is effectively disabled', () => {
    const schema = createSettingsFormSchema()
    const result = schema.safeParse(makeBaseSettings())
    expect(result.success).toBe(true)
  })

  it('normalizes stale model after provider switch deterministically', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: '',
      DISABLED_ASR_PROVIDERS: '',
    })

    const normalized = normalizeAsrPreferenceValues({
      asrProvider: 'deepgram',
      asrModel: 'whisper-large-v3',
    })

    // deepgram is a valid provider name, but it is currently disabled in the rollout,
    // so normalizeAsrPreferenceValues resets both provider and model.
    expect(normalized).toEqual({
      asrProvider: '',
      asrModel: '',
    })
  })

  it('resolves whitelist-only provider set', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: 'groq',
      DISABLED_ASR_PROVIDERS: '',
    })

    expect(getEnabledAsrProviders()).toEqual(['groq'])
  })

  it('applies blacklist subtraction precedence over whitelist/all', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: 'all',
      DISABLED_ASR_PROVIDERS: 'qwen',
    })

    // TODO: Restore full provider sets once non-Groq providers are stabilized.
    expect(getEnabledAsrProviders()).toEqual(['groq'])
  })

  it('normalizes whitespace/case in provider toggles', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: '  GROQ, qwen, deepgram, groq, volcengine ',
      DISABLED_ASR_PROVIDERS: ' QWEN ',
    })

    // TODO: Restore full provider sets once non-Groq providers are stabilized.
    expect(getEnabledAsrProviders()).toEqual(['groq'])
  })

  it('normalizes stale disabled provider selection fail-closed', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: 'groq',
      DISABLED_ASR_PROVIDERS: '',
    })

    const normalized = normalizeAsrPreferenceValues({
      asrProvider: 'deepgram',
      asrModel: 'nova-3',
    })

    // Test that even a valid pair is reset if the provider is not empowered/enabled in current rollout
    expect(normalized).toEqual({
      asrProvider: '',
      asrModel: '',
    })
  })
})
