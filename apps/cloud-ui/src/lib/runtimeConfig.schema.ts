import { z } from 'zod'
import { ASR_PROVIDER_IDS } from './asr/types'
import { logError } from './logger'
import { DEFAULTS } from './runtimeConfig.defaults'

function catchWithLog<T>(fieldName: string, fallbackValue: T) {
  return (ctx: { error: { issues: z.ZodIssue[] } }) => {
    if (import.meta.env.DEV) {
      logError(`[runtimeConfig] Field "${fieldName}" validation failed:`, ctx.error.issues)
    }
    return fallbackValue
  }
}

const stringBoolean = z.preprocess((val) => {
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim()
    if (lower === 'true' || lower === '1') return true
    if (lower === 'false' || lower === '0') return false
    return false
  }
  if (typeof val === 'number') {
    if (val === 1) return true
    return false
  }
  return val
}, z.boolean())

const UrlSchema = z.string().refine(
  (val) => {
    try {
      new URL(val)
      return true
    } catch {
      return false
    }
  },
  { message: 'Invalid URL' }
)

const UriSchema = z.string().refine(
  (val) => {
    try {
      new URL(val)
      return true
    } catch {
      return val.startsWith('/')
    }
  },
  { message: 'Invalid URL or relative path' }
)

const SupportedLanguageSchema = z.preprocess(
  (val) => {
    if (typeof val !== 'string') return val
    return val.trim().toLowerCase().split('-')[0]
  },
  z.enum(['en', 'zh', 'ja', 'ko', 'de', 'es'])
)

const DictionaryTransportSchema = z.enum(['direct', 'go-proxy'])

function normalizeProviderToggleToken(value: string): string {
  return value.trim().toLowerCase()
}

function parseProviderToggleTokens(value: string): string[] {
  const tokens = new Set<string>()
  for (const raw of value.split(',')) {
    const token = normalizeProviderToggleToken(raw)
    if (!token) continue
    tokens.add(token)
  }
  return Array.from(tokens)
}

function isEnableAllProvidersToken(value: string): boolean {
  const normalized = normalizeProviderToggleToken(value)
  return normalized === '' || normalized === '*' || normalized === 'all'
}

export const AppConfigSchema = z.object({
  APP_NAME: z
    .string()
    .default(DEFAULTS.APP_NAME)
    .catch(catchWithLog('APP_NAME', DEFAULTS.APP_NAME)),
  APP_VERSION: z
    .string()
    .default(DEFAULTS.APP_VERSION)
    .catch(catchWithLog('APP_VERSION', DEFAULTS.APP_VERSION)),
  CORS_PROXY_URL: z
    .union([
      z.literal(''),
      UrlSchema.refine((url) => url.startsWith('https://'), {
        message: 'Only HTTPS URLs allowed for CORS Proxy',
      }),
    ])
    .default(DEFAULTS.CORS_PROXY_URL)
    .catch(catchWithLog('CORS_PROXY_URL', DEFAULTS.CORS_PROXY_URL)),
  CORS_PROXY_AUTH_HEADER: z
    .string()
    .refine(
      (val) => {
        if (!val) return true
        return val.toLowerCase() === 'x-proxy-token'
      },
      { message: 'CORS_PROXY_AUTH_HEADER must be exactly "x-proxy-token"' }
    )
    .default(DEFAULTS.CORS_PROXY_AUTH_HEADER)
    .catch(catchWithLog('CORS_PROXY_AUTH_HEADER', DEFAULTS.CORS_PROXY_AUTH_HEADER)),
  CORS_PROXY_AUTH_VALUE: z
    .string()
    .default(DEFAULTS.CORS_PROXY_AUTH_VALUE)
    .catch(catchWithLog('CORS_PROXY_AUTH_VALUE', DEFAULTS.CORS_PROXY_AUTH_VALUE)),
  // Browser runtime-config only: known upstream secret formats are fail-closed
  // in runtimeConfig.ts (e.g., sk-, sk-proj-, gsk_, gsk-).
  ASR_API_KEY: z.string().optional(),
  ASR_RELAY_PUBLIC_TOKEN: z
    .string()
    .default(DEFAULTS.ASR_RELAY_PUBLIC_TOKEN)
    .catch(catchWithLog('ASR_RELAY_PUBLIC_TOKEN', DEFAULTS.ASR_RELAY_PUBLIC_TOKEN)),
  OPENAI_API_KEY: z.string().optional(),
  ASR_PROVIDER: z
    .string()
    .default(DEFAULTS.ASR_PROVIDER)
    .catch(catchWithLog('ASR_PROVIDER', DEFAULTS.ASR_PROVIDER)),
  ASR_MODEL: z
    .string()
    .default(DEFAULTS.ASR_MODEL)
    .catch(catchWithLog('ASR_MODEL', DEFAULTS.ASR_MODEL)),
  ENABLED_ASR_PROVIDERS: z
    .string()
    .superRefine((val, ctx) => {
      if (isEnableAllProvidersToken(val)) return
      const providers = parseProviderToggleTokens(val)
      const invalid = providers.filter((p) => !ASR_PROVIDER_IDS.includes(p as never))
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown ASR provider(s) in READIO_ENABLED_ASR_PROVIDERS: '${invalid.join(', ')}'. Valid options are: *, all, or ${ASR_PROVIDER_IDS.join(', ')}`,
        })
      }
    })
    .default(DEFAULTS.ENABLED_ASR_PROVIDERS),
  DISABLED_ASR_PROVIDERS: z
    .string()
    .superRefine((val, ctx) => {
      if (!normalizeProviderToggleToken(val)) return
      const providers = parseProviderToggleTokens(val)
      const invalid = providers.filter((p) => !ASR_PROVIDER_IDS.includes(p as never))
      if (invalid.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unknown ASR provider(s) in READIO_DISABLED_ASR_PROVIDERS: '${invalid.join(', ')}'. Valid options are: ${ASR_PROVIDER_IDS.join(', ')}`,
        })
      }
    })
    .default(DEFAULTS.DISABLED_ASR_PROVIDERS),
  PROXY_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.PROXY_TIMEOUT_MS)
    .catch(catchWithLog('PROXY_TIMEOUT_MS', DEFAULTS.PROXY_TIMEOUT_MS)),
  DIRECT_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.DIRECT_TIMEOUT_MS)
    .catch(catchWithLog('DIRECT_TIMEOUT_MS', DEFAULTS.DIRECT_TIMEOUT_MS)),
  MAX_CONCURRENT_REQUESTS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MAX_CONCURRENT_REQUESTS)
    .catch(catchWithLog('MAX_CONCURRENT_REQUESTS', DEFAULTS.MAX_CONCURRENT_REQUESTS)),
  DB_NAME: z.string().default(DEFAULTS.DB_NAME).catch(catchWithLog('DB_NAME', DEFAULTS.DB_NAME)),
  EN_DICTIONARY_API_URL: UrlSchema.default(DEFAULTS.EN_DICTIONARY_API_URL).catch(
    catchWithLog('EN_DICTIONARY_API_URL', DEFAULTS.EN_DICTIONARY_API_URL)
  ),
  EN_DICTIONARY_API_TRANSPORT: DictionaryTransportSchema.default(
    DEFAULTS.EN_DICTIONARY_API_TRANSPORT
  ).catch(catchWithLog('EN_DICTIONARY_API_TRANSPORT', DEFAULTS.EN_DICTIONARY_API_TRANSPORT)),
  DISCOVERY_LOOKUP_URL: UrlSchema.default(DEFAULTS.DISCOVERY_LOOKUP_URL).catch(
    catchWithLog('DISCOVERY_LOOKUP_URL', DEFAULTS.DISCOVERY_LOOKUP_URL)
  ),
  DISCOVERY_SEARCH_URL: UrlSchema.default(DEFAULTS.DISCOVERY_SEARCH_URL).catch(
    catchWithLog('DISCOVERY_SEARCH_URL', DEFAULTS.DISCOVERY_SEARCH_URL)
  ),
  RSS_FEED_BASE_URL: UrlSchema.default(DEFAULTS.RSS_FEED_BASE_URL).catch(
    catchWithLog('RSS_FEED_BASE_URL', DEFAULTS.RSS_FEED_BASE_URL)
  ),
  MAX_AUDIO_CACHE_GB: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MAX_AUDIO_CACHE_GB)
    .catch(catchWithLog('MAX_AUDIO_CACHE_GB', DEFAULTS.MAX_AUDIO_CACHE_GB)),
  DICT_CACHE_MAX_ENTRIES: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.DICT_CACHE_MAX_ENTRIES)
    .catch(catchWithLog('DICT_CACHE_MAX_ENTRIES', DEFAULTS.DICT_CACHE_MAX_ENTRIES)),
  DICT_CACHE_KEY: z
    .string()
    .default(DEFAULTS.DICT_CACHE_KEY)
    .catch(catchWithLog('DICT_CACHE_KEY', DEFAULTS.DICT_CACHE_KEY)),
  SAVE_PROGRESS_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.SAVE_PROGRESS_INTERVAL_MS)
    .catch(catchWithLog('SAVE_PROGRESS_INTERVAL_MS', DEFAULTS.SAVE_PROGRESS_INTERVAL_MS)),
  MIN_ZOOM: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MIN_ZOOM)
    .catch(catchWithLog('MIN_ZOOM', DEFAULTS.MIN_ZOOM)),
  MAX_ZOOM: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MAX_ZOOM)
    .catch(catchWithLog('MAX_ZOOM', DEFAULTS.MAX_ZOOM)),
  ZOOM_STEP: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.ZOOM_STEP)
    .catch(catchWithLog('ZOOM_STEP', DEFAULTS.ZOOM_STEP)),
  ZOOM_HIDE_DELAY_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.ZOOM_HIDE_DELAY_MS)
    .catch(catchWithLog('ZOOM_HIDE_DELAY_MS', DEFAULTS.ZOOM_HIDE_DELAY_MS)),
  DEFAULT_COUNTRY: z
    .string()
    .default(DEFAULTS.DEFAULT_COUNTRY)
    .catch(catchWithLog('DEFAULT_COUNTRY', DEFAULTS.DEFAULT_COUNTRY)),
  DEFAULT_LANGUAGE: SupportedLanguageSchema.default(DEFAULTS.DEFAULT_LANGUAGE).catch(
    catchWithLog('DEFAULT_LANGUAGE', DEFAULTS.DEFAULT_LANGUAGE)
  ),
  FALLBACK_PODCAST_IMAGE: UriSchema.default(DEFAULTS.FALLBACK_PODCAST_IMAGE).catch(
    catchWithLog('FALLBACK_PODCAST_IMAGE', DEFAULTS.FALLBACK_PODCAST_IMAGE)
  ),
  CACHE_TTL_EPISODES_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.CACHE_TTL_EPISODES_MS)
    .catch(catchWithLog('CACHE_TTL_EPISODES_MS', DEFAULTS.CACHE_TTL_EPISODES_MS)),
  RECOMMENDED_TTL_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.RECOMMENDED_TTL_MS)
    .catch(catchWithLog('RECOMMENDED_TTL_MS', DEFAULTS.RECOMMENDED_TTL_MS)),
  USE_MOCK_DATA: stringBoolean
    .default(DEFAULTS.USE_MOCK_DATA)
    .catch(catchWithLog('USE_MOCK_DATA', DEFAULTS.USE_MOCK_DATA)),
  SEARCH_SUGGESTIONS_LIMIT: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.SEARCH_SUGGESTIONS_LIMIT)
    .catch(catchWithLog('SEARCH_SUGGESTIONS_LIMIT', DEFAULTS.SEARCH_SUGGESTIONS_LIMIT)),
  SEARCH_PODCASTS_LIMIT: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.SEARCH_PODCASTS_LIMIT)
    .catch(catchWithLog('SEARCH_PODCASTS_LIMIT', DEFAULTS.SEARCH_PODCASTS_LIMIT)),
  SEARCH_EPISODES_LIMIT: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.SEARCH_EPISODES_LIMIT)
    .catch(catchWithLog('SEARCH_EPISODES_LIMIT', DEFAULTS.SEARCH_EPISODES_LIMIT)),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

export const ENV_MAP: Record<keyof AppConfig, string> = {
  APP_NAME: 'READIO_APP_NAME',
  APP_VERSION: 'READIO_APP_VERSION',
  CORS_PROXY_URL: 'READIO_CORS_PROXY_URL',
  CORS_PROXY_AUTH_HEADER: 'READIO_CORS_PROXY_AUTH_HEADER',
  CORS_PROXY_AUTH_VALUE: 'READIO_CORS_PROXY_AUTH_VALUE',
  ASR_API_KEY: 'READIO_ASR_API_KEY',
  ASR_RELAY_PUBLIC_TOKEN: 'READIO_ASR_RELAY_PUBLIC_TOKEN',
  OPENAI_API_KEY: 'READIO_OPENAI_API_KEY',
  ASR_PROVIDER: 'READIO_ASR_PROVIDER',
  ASR_MODEL: 'READIO_ASR_MODEL',
  ENABLED_ASR_PROVIDERS: 'READIO_ENABLED_ASR_PROVIDERS',
  DISABLED_ASR_PROVIDERS: 'READIO_DISABLED_ASR_PROVIDERS',
  PROXY_TIMEOUT_MS: 'READIO_PROXY_TIMEOUT_MS',
  DIRECT_TIMEOUT_MS: 'READIO_DIRECT_TIMEOUT_MS',
  MAX_CONCURRENT_REQUESTS: 'READIO_MAX_CONCURRENT_REQUESTS',
  DB_NAME: 'READIO_DB_NAME',
  EN_DICTIONARY_API_URL: 'READIO_EN_DICTIONARY_API_URL',
  EN_DICTIONARY_API_TRANSPORT: 'READIO_EN_DICTIONARY_API_TRANSPORT',
  DISCOVERY_LOOKUP_URL: 'READIO_DISCOVERY_LOOKUP_URL',
  DISCOVERY_SEARCH_URL: 'READIO_DISCOVERY_SEARCH_URL',
  RSS_FEED_BASE_URL: 'READIO_RSS_FEED_BASE_URL',

  MAX_AUDIO_CACHE_GB: 'READIO_MAX_AUDIO_CACHE_GB',
  DICT_CACHE_MAX_ENTRIES: 'READIO_DICT_CACHE_MAX_ENTRIES',
  DICT_CACHE_KEY: 'READIO_DICT_CACHE_KEY',
  SAVE_PROGRESS_INTERVAL_MS: 'READIO_SAVE_PROGRESS_INTERVAL_MS',
  MIN_ZOOM: 'READIO_MIN_ZOOM',
  MAX_ZOOM: 'READIO_MAX_ZOOM',
  ZOOM_STEP: 'READIO_ZOOM_STEP',
  ZOOM_HIDE_DELAY_MS: 'READIO_ZOOM_HIDE_DELAY_MS',
  DEFAULT_COUNTRY: 'READIO_DEFAULT_PODCAST_CONTENT_COUNTRY',
  DEFAULT_LANGUAGE: 'READIO_DEFAULT_LANGUAGE',
  FALLBACK_PODCAST_IMAGE: 'READIO_FALLBACK_PODCAST_IMAGE',
  CACHE_TTL_EPISODES_MS: 'READIO_CACHE_TTL_EPISODES_MS',
  RECOMMENDED_TTL_MS: 'READIO_RECOMMENDED_TTL_MS',
  USE_MOCK_DATA: 'READIO_USE_MOCK',
  SEARCH_SUGGESTIONS_LIMIT: 'READIO_SEARCH_SUGGESTIONS_LIMIT',
  SEARCH_PODCASTS_LIMIT: 'READIO_SEARCH_PODCASTS_LIMIT',
  SEARCH_EPISODES_LIMIT: 'READIO_SEARCH_EPISODES_LIMIT',
} as const
