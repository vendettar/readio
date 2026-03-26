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
    asrUseCustomModel: false,
    asrCustomModelId: '',
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
    const schema = createSettingsFormSchema()
    const result = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'deepgram',
      asrModel: 'nova-3',
    })
    expect(result.success).toBe(true)
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

  it('accepts custom model mode only when custom model id is provided', () => {
    const schema = createSettingsFormSchema()
    const valid = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'qwen',
      asrUseCustomModel: true,
      asrCustomModelId: 'custom-qwen-model',
      asrModel: '',
    })
    expect(valid.success).toBe(true)

    const invalid = schema.safeParse({
      ...makeBaseSettings(),
      asrProvider: 'qwen',
      asrUseCustomModel: true,
      asrCustomModelId: '   ',
      asrModel: '',
    })
    expect(invalid.success).toBe(false)
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
      asrUseCustomModel: false,
      asrCustomModelId: '',
    })

    expect(normalized).toEqual({
      asrProvider: 'deepgram',
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
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

    expect(getEnabledAsrProviders()).toEqual(['groq', 'deepgram', 'volcengine'])
  })

  it('normalizes whitespace/case in provider toggles', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: '  GROQ, qwen, deepgram, groq, volcengine ',
      DISABLED_ASR_PROVIDERS: ' QWEN ',
    })

    expect(getEnabledAsrProviders()).toEqual(['groq', 'deepgram', 'volcengine'])
  })

  it('normalizes stale disabled provider selection fail-closed', () => {
    mockAppConfig({
      ENABLED_ASR_PROVIDERS: 'groq',
      DISABLED_ASR_PROVIDERS: '',
    })

    const normalized = normalizeAsrPreferenceValues({
      asrProvider: 'deepgram',
      asrModel: 'nova-3',
      asrUseCustomModel: true,
      asrCustomModelId: 'custom-model',
    })

    expect(normalized).toEqual({
      asrProvider: '',
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
    })
  })
})
