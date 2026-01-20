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
      READIO_DICT_API_URL?: string
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
      READIO_DEFAULT_LANG?: string
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

const AppConfigSchema = z.object({
  APP_NAME: z.string().default('Readio'),
  APP_VERSION: z.string().default('1.0.0'),
  CORS_PROXY_URL: z
    .string()
    .url()
    .refine((url) => url === '' || url.startsWith('https://'), {
      message: 'Only HTTPS URLs allowed for CORS Proxy',
    })
    .default(''),
  CORS_PROXY_PRIMARY: stringBoolean.default(false),
  DEFAULT_CORS_PROXY: z.string().url().default('https://api.allorigins.win'),
  TIMEOUT_MS: z.coerce.number().positive().default(15000),
  MAX_CONCURRENT_REQUESTS: z.coerce.number().positive().default(6),
  DB_NAME: z.string().default('readio-lite'),
  DICT_API_URL: z.string().url().default('https://api.dictionaryapi.dev/api/v2/entries/en/'),
  DISCOVERY_LOOKUP_URL: z.string().url().default('https://itunes.apple.com/lookup'),
  DISCOVERY_SEARCH_URL: z.string().url().default('https://itunes.apple.com/search'),
  RSS_FEED_BASE_URL: z.string().url().default('https://rss.applemarketingtools.com/api/v2'),
  MAX_AUDIO_SIZE_MB: z.coerce.number().positive().default(300),
  DICT_CACHE_MAX_ENTRIES: z.coerce.number().positive().default(500),
  DICT_CACHE_KEY: z.string().default('readio-lite-dict-cache'),
  SAVE_PROGRESS_INTERVAL_MS: z.coerce.number().positive().default(5000),
  MIN_ZOOM: z.coerce.number().positive().default(0.5),
  MAX_ZOOM: z.coerce.number().positive().default(3.0),
  ZOOM_STEP: z.coerce.number().positive().default(0.1),
  ZOOM_HIDE_DELAY_MS: z.coerce.number().positive().default(2000),
  CLICK_DELAY_MS: z.coerce.number().positive().default(240),
  DEFAULT_LANG: z.string().default('en'),
  DEFAULT_COUNTRY: z.string().default('us'),
  FALLBACK_PODCAST_IMAGE: z.string().default('/placeholder-podcast.svg'),
  CACHE_TTL_EPISODES_MS: z.coerce.number().positive().default(3600000),
  RECOMMENDED_TTL_MS: z.coerce.number().positive().default(86400000),
  USE_MOCK_DATA: stringBoolean.default(false),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * Gets the consolidated app configuration.
 * Automatically maps READIO_XXX window environment variables to the schema.
 */
export function getAppConfig(): AppConfig {
  const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {}

  // Map environment variable names to schema property names
  const rawConfig: Record<string, unknown> = {
    APP_NAME: env.READIO_APP_NAME,
    APP_VERSION: env.READIO_APP_VERSION,
    CORS_PROXY_URL: env.READIO_CORS_PROXY_URL,
    CORS_PROXY_PRIMARY: env.READIO_CORS_PROXY_PRIMARY,
    TIMEOUT_MS: env.READIO_DEFAULT_TIMEOUT_MS,
    MAX_CONCURRENT_REQUESTS: env.READIO_MAX_CONCURRENT_REQUESTS,
    DB_NAME: env.READIO_DB_NAME,
    DEFAULT_CORS_PROXY: env.READIO_DEFAULT_CORS_PROXY,
    DICT_API_URL: env.READIO_DICT_API_URL,
    DISCOVERY_LOOKUP_URL: env.READIO_DISCOVERY_LOOKUP_URL,
    DISCOVERY_SEARCH_URL: env.READIO_DISCOVERY_SEARCH_URL,
    RSS_FEED_BASE_URL: env.READIO_RSS_FEED_BASE_URL,
    MAX_AUDIO_SIZE_MB: env.READIO_MAX_AUDIO_SIZE_MB,
    DICT_CACHE_MAX_ENTRIES: env.READIO_DICT_CACHE_MAX_ENTRIES,
    DICT_CACHE_KEY: env.READIO_DICT_CACHE_KEY,
    SAVE_PROGRESS_INTERVAL_MS: env.READIO_SAVE_PROGRESS_INTERVAL_MS,
    MIN_ZOOM: env.READIO_MIN_ZOOM,
    MAX_ZOOM: env.READIO_MAX_ZOOM,
    ZOOM_STEP: env.READIO_ZOOM_STEP,
    ZOOM_HIDE_DELAY_MS: env.READIO_ZOOM_HIDE_DELAY_MS,
    CLICK_DELAY_MS: env.READIO_CLICK_DELAY_MS,
    DEFAULT_LANG: env.READIO_DEFAULT_LANG,
    DEFAULT_COUNTRY: env.READIO_DEFAULT_COUNTRY,
    FALLBACK_PODCAST_IMAGE: env.READIO_FALLBACK_PODCAST_IMAGE,
    CACHE_TTL_EPISODES_MS: env.READIO_CACHE_TTL_EPISODES_MS,
    RECOMMENDED_TTL_MS: env.READIO_RECOMMENDED_TTL_MS,
    USE_MOCK_DATA: import.meta.env.VITE_USE_MOCK_DATA === 'true' ? true : env.READIO_USE_MOCK,
  }

  // Filter out undefined values so that Zod .default() values are used
  const filteredConfig = Object.fromEntries(
    Object.entries(rawConfig).filter(([_, v]) => v !== undefined)
  )

  const result = AppConfigSchema.safeParse(filteredConfig)

  if (result.success) {
    return result.data
  }

  // If validation fails (e.g. invalid URLs), fall back to defaults per field
  // or return the partially valid data if possible.
  // For safety, we return the schema defaults.
  logError('[runtimeConfig] Validation failed, using defaults:', result.error.format())
  return AppConfigSchema.parse({})
}
