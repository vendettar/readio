import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Faro } from '@grafana/faro-web-sdk'
import { getWebInstrumentations } from '@grafana/faro-web-sdk'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { reportError } from '../errorReporter'
import {
  initializeFaro,
  reportSchemaValidationError,
  resetFaroForTests,
  sanitizeValue,
} from '../faro'
import { type AppConfig, getApiBaseUrl } from '../runtimeConfig'
import { DEFAULTS } from '../runtimeConfig.defaults'

type RuntimeConfigModule = typeof import('../runtimeConfig')
type FaroInitializer = NonNullable<Parameters<typeof initializeFaro>[1]>

type TracingInstrumentationConfig = {
  name: string
  options: {
    instrumentationOptions: {
      propagateTraceHeaderCorsUrls: RegExp[]
    }
  }
}

vi.mock('../runtimeConfig', async (importOriginal) => {
  const actual = await importOriginal<RuntimeConfigModule>()
  return {
    ...actual,
    getApiBaseUrl: vi.fn(() => ''),
  }
})

const baseConfig: Pick<
  AppConfig,
  | 'APP_NAME'
  | 'APP_VERSION'
  | 'GRAFANA_FARO_URL'
  | 'GRAFANA_FARO_APP_NAME'
  | 'GRAFANA_FARO_ENV'
  | 'GRAFANA_FARO_SAMPLE_RATE'
> = {
  APP_NAME: 'Readio',
  APP_VERSION: '1.0.0',
  GRAFANA_FARO_URL: '',
  GRAFANA_FARO_APP_NAME: '',
  GRAFANA_FARO_ENV: '',
  GRAFANA_FARO_SAMPLE_RATE: DEFAULTS.GRAFANA_FARO_SAMPLE_RATE,
}

function mockFaro(): Faro {
  return {
    api: {
      pushEvent: vi.fn(),
    },
  } as unknown as Faro
}

describe('faro', () => {
  beforeEach(() => {
    resetFaroForTests()
    vi.restoreAllMocks()
  })

  it('does not initialize without a collector URL', () => {
    const init = vi.fn()

    expect(initializeFaro(baseConfig, init)).toBeNull()
    expect(init).not.toHaveBeenCalled()
  })

  it('does not initialize when sample rate is disabled', () => {
    const init = vi.fn()

    expect(
      initializeFaro(
        {
          ...baseConfig,
          GRAFANA_FARO_URL: 'https://faro.example.com/collect',
          GRAFANA_FARO_SAMPLE_RATE: 0,
        },
        init
      )
    ).toBeNull()
    expect(init).not.toHaveBeenCalled()
  })

  it('swallows initialization failures without blocking boot', () => {
    const init = vi.fn(() => {
      throw new Error('collector unavailable')
    })

    expect(() =>
      initializeFaro(
        {
          ...baseConfig,
          GRAFANA_FARO_URL: 'https://faro.example.com/collect',
          GRAFANA_FARO_SAMPLE_RATE: 1,
        },
        init
      )
    ).not.toThrow()
  })

  it('uses Grafana web instrumentations and does not disable session tracking', () => {
    const faro = mockFaro()
    let receivedConfig:
      | {
          instrumentations: Array<{ name: string }>
        }
      | undefined
    const init = vi.fn((config: unknown) => {
      receivedConfig = config as {
        instrumentations: Array<{ name: string }>
      }
      return faro
    })

    initializeFaro(
      {
        ...baseConfig,
        GRAFANA_FARO_URL: 'https://faro.example.com/collect',
        GRAFANA_FARO_SAMPLE_RATE: 1,
      },
      init
    )

    expect(init).toHaveBeenCalledTimes(1)
    if (!receivedConfig) {
      throw new Error('expected Faro initializer to be called')
    }
    const initArg = receivedConfig
    // We add 1 for our custom TracingInstrumentation when URL is set
    expect(initArg.instrumentations).toHaveLength(getWebInstrumentations().length + 1)
    const instrumentationNames = initArg.instrumentations.map((i: { name: string }) => i.name)
    expect(instrumentationNames).toContain('@grafana/faro-web-tracing')
    getWebInstrumentations().forEach((i) => {
      expect(instrumentationNames).toContain(i.name)
    })
    expect(initArg).not.toHaveProperty('sessionTracking')
  })

  it('correctly anchors tracing regex to prevent adjacent domain matching', () => {
    const faro = mockFaro()
    let tracingConfig: TracingInstrumentationConfig | undefined
    const init: FaroInitializer = vi.fn((config) => {
      const instrumentations = config.instrumentations as Array<{ name: string }> | undefined
      tracingConfig = instrumentations?.find((i) => i.name === '@grafana/faro-web-tracing') as
        | TracingInstrumentationConfig
        | undefined
      return faro
    })

    // Mock getApiBaseUrl to return a specific origin
    vi.mocked(getApiBaseUrl).mockReturnValue('https://api.readio.top')

    initializeFaro(
      {
        ...baseConfig,
        GRAFANA_FARO_URL: 'https://faro.example.com/collect',
        GRAFANA_FARO_SAMPLE_RATE: 1,
      },
      init
    )

    if (!tracingConfig) {
      throw new Error('expected tracing instrumentation to be configured')
    }
    const regex = tracingConfig.options.instrumentationOptions.propagateTraceHeaderCorsUrls[0]
    expect(regex.test('https://api.readio.top')).toBe(true)
    expect(regex.test('https://api.readio.top/v1/search')).toBe(true)
    // Negative cases: malicious adjacent domains should NOT match
    expect(regex.test('https://api.readio.top.evil.com')).toBe(false)
    expect(regex.test('https://api.readio.top.attacker.net/api')).toBe(false)
  })

  it('redacts sensitive and high-volume text before export', () => {
    const longTranscript = Array.from({ length: 36 }, (_, i) => `word${i}`).join(' ')

    expect(sanitizeValue('contact leo@example.com')).toContain('[REDACTED]')
    expect(sanitizeValue('/Users/leo/private/file.mp3')).toBe('[REDACTED]')
    expect(sanitizeValue('Bearer abc.def.ghi')).toContain('Bearer [REDACTED]')
    expect(sanitizeValue('sk-1234567890abcdef')).toBe('[REDACTED]')
    expect(sanitizeValue('cookie=sessionid')).toBe('cookie=[REDACTED]')
    expect(sanitizeValue('https://cdn.example.com/audio.mp3?token=secret#frag')).toBe(
      'https://cdn.example.com/audio.mp3'
    )
    expect(sanitizeValue(longTranscript)).toMatch(/\.\.\.$/)
  })

  it('reports only allowed schema validation fields', () => {
    const faro = mockFaro()
    const init = vi.fn(() => faro)
    initializeFaro(
      {
        ...baseConfig,
        GRAFANA_FARO_URL: 'https://faro.example.com/collect',
        GRAFANA_FARO_SAMPLE_RATE: 1,
      },
      init
    )

    reportSchemaValidationError({
      schemaName: 'PIEpisodeSchema',
      provider: 'podcastindex',
      routeClass: 'discovery/lookup/podcast-episodes',
      errorClass: 'schema_validation',
      sampleRate: 1,
      issues: [{ path: ['episodes', 0, 'duration'], code: 'invalid_type' }],
    })

    expect(faro.api.pushEvent).toHaveBeenCalledWith(
      'schema_validation_error',
      {
        schema_name: 'PIEpisodeSchema',
        provider: 'podcastindex',
        route_class: 'discovery/lookup/podcast-episodes',
        error_class: 'schema_validation',
        issue_path: 'episodes.0.duration',
        issue_code: 'invalid_type',
      },
      'readio'
    )
  })

  it('uses sanitized React error boundary events', () => {
    const faro = mockFaro()
    const init = vi.fn(() => faro)
    initializeFaro(
      {
        ...baseConfig,
        GRAFANA_FARO_URL: 'https://faro.example.com/collect',
        GRAFANA_FARO_SAMPLE_RATE: 1,
      },
      init
    )

    reportError(new Error('token sk-1234567890abcdef'), {
      componentStack: '/Users/leo/project/component.tsx',
    })

    expect(faro.api.pushEvent).toHaveBeenCalledWith(
      'react_error_boundary',
      {
        error_class: 'react_error_boundary',
        message: 'Error',
        component_stack: '[REDACTED]',
      },
      'readio'
    )
  })

  it('does not read admin/session/local persistence surfaces', () => {
    const source = readFileSync(resolve(__dirname, '../faro.ts'), 'utf8')

    expect(source).not.toMatch(/\/ops/)
    expect(source).not.toMatch(/sessionStorage/)
    expect(source).not.toMatch(/indexedDB|IndexedDB|Dexie|dexie/i)
    expect(source).not.toMatch(/credentialsRepository|providerCredentials|ASR_API_KEY/i)
    expect(source).not.toMatch(/localMedia|transcriptStore|DownloadsRepository/i)
  })
})
