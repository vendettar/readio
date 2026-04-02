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
    // TODO: Restore full provider sets once non-Groq providers are stabilized.
    // Currently limited to ['groq'] by temporary restriction in providerToggles.ts.
    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: '',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq'])

    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: '*',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq'])

    expect(
      resolveEnabledAsrProviders({
        ENABLED_ASR_PROVIDERS: 'all',
        DISABLED_ASR_PROVIDERS: '',
      })
    ).toEqual(['groq'])
  })

  it('normalizes whitespace/case and deduplicates tokens', () => {
    const enabled = resolveEnabledAsrProviders({
      ENABLED_ASR_PROVIDERS: '  GROQ, qwen ,groq,DEEPGRAM ',
      DISABLED_ASR_PROVIDERS: ' QWEN, qwen ',
    })

    // qwen is disabled via DISABLED_ASR_PROVIDERS, DEEPGRAM is filtered out by temporary Groq-only restriction.
    expect(enabled).toEqual(['groq'])
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
    // TODO: Re-enable deepgram/volcengine in tests once stabilized and restriction is lifted.
    expect(isAsrProviderEnabled('deepgram', config)).toBe(false)
    expect(isAsrProviderEnabled('volcengine', config)).toBe(false)
  })
})
