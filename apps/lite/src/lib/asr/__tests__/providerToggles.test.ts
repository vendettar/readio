import { describe, expect, it } from 'vitest'
import { isAsrProviderEnabled, resolveEnabledAsrProviders } from '../providerToggles'

describe('asr provider toggles resolver', () => {
  it('applies blacklist precedence over whitelist', () => {
    const enabled = resolveEnabledAsrProviders({
      ENABLED_ASR_PROVIDERS: 'groq,qwen',
      DISABLED_ASR_PROVIDERS: 'qwen',
    })

    expect(enabled).toEqual(['groq'])
  })

  it('supports all/asterisk/empty semantics', () => {
    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: '',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq', 'qwen', 'deepgram', 'volcengine'])

    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: '*',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq', 'qwen', 'deepgram', 'volcengine'])

    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: 'all',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq', 'qwen', 'deepgram', 'volcengine'])
  })

  it('normalizes whitespace/case and deduplicates tokens', () => {
    const enabled = resolveEnabledAsrProviders({
      ENABLED_ASR_PROVIDERS: '  GROQ, qwen ,groq,DEEPGRAM ',
      DISABLED_ASR_PROVIDERS: ' QWEN, qwen ',
    })

    expect(enabled).toEqual(['groq', 'deepgram'])
  })

  it('ignores unknown tokens defensively without expanding availability', () => {
    const enabled = resolveEnabledAsrProviders({
      ENABLED_ASR_PROVIDERS: 'groq,unknown-provider',
      DISABLED_ASR_PROVIDERS: 'unknown-disabled',
    })

    expect(enabled).toEqual(['groq'])
  })

  it('isAsrProviderEnabled follows resolved effective set', () => {
    const config = {
      ENABLED_ASR_PROVIDERS: 'all',
      DISABLED_ASR_PROVIDERS: 'qwen',
    }

    expect(isAsrProviderEnabled('groq', config)).toBe(true)
    expect(isAsrProviderEnabled('qwen', config)).toBe(false)
    expect(isAsrProviderEnabled('deepgram', config)).toBe(true)
    expect(isAsrProviderEnabled('volcengine', config)).toBe(true)
  })
})
