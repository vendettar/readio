import { z } from 'zod'
import { logError } from './logger'

declare global {
  interface Window {
    __READIO_ENV__?: {
      // Basic Info
      READIO_APP_NAME?: string
      READIO_APP_VERSION?: string

      // Overrides
      READIO_CORS_PROXY_URL?: string
      READIO_CORS_PROXY_PRIMARY?: boolean | string
      READIO_USE_MOCK?: boolean | string

      // System Defaults
      READIO_DEFAULT_TIMEOUT_MS?: number | string
      READIO_MAX_CONCURRENT_REQUESTS?: number | string
      READIO_DB_NAME?: string

      // External APIs
      READIO_DEFAULT_CORS_PROXY?: string
      READIO_DICTIONARY_API_URL?: string
      READIO_DISCOVERY_LOOKUP_URL?: string
      READIO_DISCOVERY_SEARCH_URL?: string
      READIO_RSS_FEED_BASE_URL?: string

      // Limits
      READIO_MAX_AUDIO_SIZE_MB?: number | string
      READIO_DICT_CACHE_MAX_ENTRIES?: number | string
      READIO_DICT_CACHE_KEY?: string
      READIO_SAVE_PROGRESS_INTERVAL_MS?: number | string

      // UI
      READIO_MIN_ZOOM?: number | string
      READIO_MAX_ZOOM?: number | string
      READIO_ZOOM_STEP?: number | string
      READIO_ZOOM_HIDE_DELAY_MS?: number | string
      READIO_CLICK_DELAY_MS?: number | string

      // Localization
      READIO_DEFAULT_COUNTRY?: string

      // Assets
      READIO_FALLBACK_PODCAST_IMAGE?: string

      // TTLs
      READIO_CACHE_TTL_EPISODES_MS?: number | string
      READIO_RECOMMENDED_TTL_MS?: number | string
    }
  }
}

/**
 * Handles boolean coercion correctly for strings like "true" and "false".
 * Native z.coerce.boolean() treats any non-empty string as true.
 */
const stringBoolean = z.preprocess((val) => {
  if (typeof val === 'string') {
    const lower = val.toLowerCase().trim()
    if (lower === 'true' || lower === '1') return true
    if (lower === 'false' || lower === '0') return false
    // Fallback for any other string
    return false
  }
  if (typeof val === 'number') {
    if (val === 1) return true
    // Any other number is false
    return false
  }
  return val
}, z.boolean())

/**
 * Wrapper for .catch() that logs validation failures before returning the fallback value.
 * Provides visibility into invalid env values while maintaining resilient fallback behavior.
 * Logs are gated to development mode to prevent noise in production.
 */
function catchWithLog<T>(fieldName: string, fallbackValue: T) {
  return (ctx: { error: { issues: z.ZodIssue[] } }) => {
    if (import.meta.env.DEV) {
      logError(`[runtimeConfig] Field "${fieldName}" validation failed:`, ctx.error.issues)
    }
    return fallbackValue
  }
}

/**
 * Reusable URL schema with standard error message.
 * Replaces deprecated z.string().url()
 */
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

/**
 * Reusable URI schema.
 * Validates absolute URLs OR relative paths (starting with /).
 */
const UriSchema = z.string().refine(
  (val) => {
    try {
      // 1. Check absolute URL
      new URL(val)
      return true
    } catch {
      // 2. Check relative path
      return val.startsWith('/')
    }
  },
  { message: 'Invalid URL or relative path' }
)

/**
 * Default configuration values.
 * Single source of truth for both .default() and .catch() fallbacks.
 */
const DEFAULTS = {
  APP_NAME: 'Readio',
  APP_VERSION: '1.0.0',
  CORS_PROXY_URL: '',
  CORS_PROXY_PRIMARY: false,
  DEFAULT_CORS_PROXY: 'https://api.allorigins.win',
  TIMEOUT_MS: 15000,
  MAX_CONCURRENT_REQUESTS: 6,
  DB_NAME: 'readio-lite',
  DICT_API_URL: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
  DISCOVERY_LOOKUP_URL: 'https://itunes.apple.com/lookup',
  DISCOVERY_SEARCH_URL: 'https://itunes.apple.com/search',
  RSS_FEED_BASE_URL: 'https://rss.applemarketingtools.com/api/v2',
  MAX_AUDIO_SIZE_MB: 300,
  DICT_CACHE_MAX_ENTRIES: 500,
  DICT_CACHE_KEY: 'readio-lite-dict-cache',
  SAVE_PROGRESS_INTERVAL_MS: 5000,
  MIN_ZOOM: 0.5,
  MAX_ZOOM: 3.0,
  ZOOM_STEP: 0.1,
  ZOOM_HIDE_DELAY_MS: 2000,
  CLICK_DELAY_MS: 240,
  DEFAULT_COUNTRY: 'us',
  FALLBACK_PODCAST_IMAGE: '/placeholder-podcast.svg',
  CACHE_TTL_EPISODES_MS: 3600000,
  RECOMMENDED_TTL_MS: 86400000,
  USE_MOCK_DATA: false,
} as const

// Schema with field-level fallback via .catch()
// If a field fails validation, it logs the error and falls back to its default from DEFAULTS
const AppConfigSchema = z.object({
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
  CORS_PROXY_PRIMARY: stringBoolean
    .default(DEFAULTS.CORS_PROXY_PRIMARY)
    .catch(catchWithLog('CORS_PROXY_PRIMARY', DEFAULTS.CORS_PROXY_PRIMARY)),
  DEFAULT_CORS_PROXY: UrlSchema.default(DEFAULTS.DEFAULT_CORS_PROXY).catch(
    catchWithLog('DEFAULT_CORS_PROXY', DEFAULTS.DEFAULT_CORS_PROXY)
  ),
  TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.TIMEOUT_MS)
    .catch(catchWithLog('TIMEOUT_MS', DEFAULTS.TIMEOUT_MS)),
  MAX_CONCURRENT_REQUESTS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MAX_CONCURRENT_REQUESTS)
    .catch(catchWithLog('MAX_CONCURRENT_REQUESTS', DEFAULTS.MAX_CONCURRENT_REQUESTS)),
  DB_NAME: z.string().default(DEFAULTS.DB_NAME).catch(catchWithLog('DB_NAME', DEFAULTS.DB_NAME)),
  DICT_API_URL: UrlSchema.default(DEFAULTS.DICT_API_URL).catch(
    catchWithLog('DICT_API_URL', DEFAULTS.DICT_API_URL)
  ),
  DISCOVERY_LOOKUP_URL: UrlSchema.default(DEFAULTS.DISCOVERY_LOOKUP_URL).catch(
    catchWithLog('DISCOVERY_LOOKUP_URL', DEFAULTS.DISCOVERY_LOOKUP_URL)
  ),
  DISCOVERY_SEARCH_URL: UrlSchema.default(DEFAULTS.DISCOVERY_SEARCH_URL).catch(
    catchWithLog('DISCOVERY_SEARCH_URL', DEFAULTS.DISCOVERY_SEARCH_URL)
  ),
  RSS_FEED_BASE_URL: UrlSchema.default(DEFAULTS.RSS_FEED_BASE_URL).catch(
    catchWithLog('RSS_FEED_BASE_URL', DEFAULTS.RSS_FEED_BASE_URL)
  ),
  MAX_AUDIO_SIZE_MB: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.MAX_AUDIO_SIZE_MB)
    .catch(catchWithLog('MAX_AUDIO_SIZE_MB', DEFAULTS.MAX_AUDIO_SIZE_MB)),
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
  CLICK_DELAY_MS: z.coerce
    .number()
    .positive()
    .default(DEFAULTS.CLICK_DELAY_MS)
    .catch(catchWithLog('CLICK_DELAY_MS', DEFAULTS.CLICK_DELAY_MS)),
  DEFAULT_COUNTRY: z
    .string()
    .default(DEFAULTS.DEFAULT_COUNTRY)
    .catch(catchWithLog('DEFAULT_COUNTRY', DEFAULTS.DEFAULT_COUNTRY)),
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
})

export type AppConfig = z.infer<typeof AppConfigSchema>

// Centralized mapping from AppConfig keys to window.__READIO_ENV__ keys
const ENV_MAP: Record<keyof AppConfig, string> = {
  APP_NAME: 'READIO_APP_NAME',
  APP_VERSION: 'READIO_APP_VERSION',
  CORS_PROXY_URL: 'READIO_CORS_PROXY_URL',
  CORS_PROXY_PRIMARY: 'READIO_CORS_PROXY_PRIMARY',
  DEFAULT_CORS_PROXY: 'READIO_DEFAULT_CORS_PROXY',
  TIMEOUT_MS: 'READIO_DEFAULT_TIMEOUT_MS',
  MAX_CONCURRENT_REQUESTS: 'READIO_MAX_CONCURRENT_REQUESTS',
  DB_NAME: 'READIO_DB_NAME',
  DICT_API_URL: 'READIO_DICTIONARY_API_URL',
  DISCOVERY_LOOKUP_URL: 'READIO_DISCOVERY_LOOKUP_URL',
  DISCOVERY_SEARCH_URL: 'READIO_DISCOVERY_SEARCH_URL',
  RSS_FEED_BASE_URL: 'READIO_RSS_FEED_BASE_URL',
  MAX_AUDIO_SIZE_MB: 'READIO_MAX_AUDIO_SIZE_MB',
  DICT_CACHE_MAX_ENTRIES: 'READIO_DICT_CACHE_MAX_ENTRIES',
  DICT_CACHE_KEY: 'READIO_DICT_CACHE_KEY',
  SAVE_PROGRESS_INTERVAL_MS: 'READIO_SAVE_PROGRESS_INTERVAL_MS',
  MIN_ZOOM: 'READIO_MIN_ZOOM',
  MAX_ZOOM: 'READIO_MAX_ZOOM',
  ZOOM_STEP: 'READIO_ZOOM_STEP',
  ZOOM_HIDE_DELAY_MS: 'READIO_ZOOM_HIDE_DELAY_MS',
  CLICK_DELAY_MS: 'READIO_CLICK_DELAY_MS',
  DEFAULT_COUNTRY: 'READIO_DEFAULT_COUNTRY',
  FALLBACK_PODCAST_IMAGE: 'READIO_FALLBACK_PODCAST_IMAGE',
  CACHE_TTL_EPISODES_MS: 'READIO_CACHE_TTL_EPISODES_MS',
  RECOMMENDED_TTL_MS: 'READIO_RECOMMENDED_TTL_MS',
  USE_MOCK_DATA: 'READIO_USE_MOCK',
} as const

// Module-level cache to prevent re-parsing on hot paths (e.g., updateProgress)
let cachedConfig: AppConfig | null = null

/**
 * Gets the consolidated app configuration.
 * Automatically maps READIO_XXX window environment variables to the schema.
 *
 * PERFORMANCE: Result is cached on first call. Config is immutable at runtime.
 * RESILIENCE: Uses field-level fallback via .catch() - invalid fields use defaults, valid fields are preserved.
 */
export function getAppConfig(): AppConfig {
  // Return cached config if available (hot path optimization)
  if (cachedConfig) {
    return cachedConfig
  }

  const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {}

  // Build rawConfig using centralized ENV_MAP
  const rawConfig: Record<string, unknown> = {}
  for (const [key, envKey] of Object.entries(ENV_MAP)) {
    const envValue = env[envKey as keyof typeof env]
    rawConfig[key] = envValue
  }

  // CRITICAL: Override USE_MOCK_DATA with build-time env var if present
  if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
    rawConfig.USE_MOCK_DATA = true
  }

  try {
    // Parse with field-level fallback (errors are caught per-field via .catch())
    const config = AppConfigSchema.parse(rawConfig)

    // Cache the result to avoid re-parsing on hot paths
    cachedConfig = config
    return config
  } catch (error) {
    // This should never happen with .catch() on all fields, but defensive fallback
    logError('[runtimeConfig] Unexpected schema parse failure:', error)
    const fallback = AppConfigSchema.parse({})
    cachedConfig = fallback
    return fallback
  }
}
