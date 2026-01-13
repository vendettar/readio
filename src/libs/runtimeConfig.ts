import { z } from 'zod'

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

const AppConfigSchema = z.object({
  APP_NAME: z.string().default('Readio'),
  APP_VERSION: z.string().default('1.0.0'),
  CORS_PROXY_URL: z.string().default(''),
  CORS_PROXY_PRIMARY: z.boolean().default(false),
  DEFAULT_CORS_PROXY: z.string().url().default('https://api.allorigins.win'),
  TIMEOUT_MS: z.number().positive().default(15000),
  MAX_CONCURRENT_REQUESTS: z.number().positive().default(6),
  DB_NAME: z.string().default('readio-v2'),
  DICT_API_URL: z.string().url().default('https://api.dictionaryapi.dev/api/v2/entries/en/'),
  // Discovery Provider (Apple/iTunes)
  DISCOVERY_LOOKUP_URL: z.string().url().default('https://itunes.apple.com/lookup'),
  DISCOVERY_SEARCH_URL: z.string().url().default('https://itunes.apple.com/search'),
  RSS_FEED_BASE_URL: z.string().url().default('https://rss.applemarketingtools.com/api/v2'),
  MAX_AUDIO_SIZE_MB: z.number().positive().default(300),
  DICT_CACHE_MAX_ENTRIES: z.number().positive().default(500),
  DICT_CACHE_KEY: z.string().default('readio_dict_cache_v2'),
  SAVE_PROGRESS_INTERVAL_MS: z.number().positive().default(5000),
  MIN_ZOOM: z.number().positive().default(0.5),
  MAX_ZOOM: z.number().positive().default(3.0),
  ZOOM_STEP: z.number().positive().default(0.1),
  ZOOM_HIDE_DELAY_MS: z.number().positive().default(2000),
  CLICK_DELAY_MS: z.number().positive().default(240),
  DEFAULT_LANG: z.string().default('en'),
  DEFAULT_COUNTRY: z.string().default('us'),
  FALLBACK_PODCAST_IMAGE: z.string().default('/placeholder-podcast.svg'),
  CACHE_TTL_EPISODES_MS: z.number().positive().default(3600000),
  RECOMMENDED_TTL_MS: z.number().positive().default(86400000),
  USE_MOCK_DATA: z.boolean().default(false),
})

export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * Gets the consolidated app configuration.
 */
export function getAppConfig(): AppConfig {
  const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {}

  const num = (val: unknown, fallback: number) => {
    const parsed = Number(val)
    return Number.isNaN(parsed) ? fallback : parsed
  }

  const rawConfig = {
    APP_NAME: env.READIO_APP_NAME,
    APP_VERSION: env.READIO_APP_VERSION,

    // Proxy & Network
    CORS_PROXY_URL: env.READIO_CORS_PROXY_URL,
    CORS_PROXY_PRIMARY: String(env.READIO_CORS_PROXY_PRIMARY) === 'true',
    TIMEOUT_MS: num(env.READIO_DEFAULT_TIMEOUT_MS, 15000),
    MAX_CONCURRENT_REQUESTS: num(env.READIO_MAX_CONCURRENT_REQUESTS, 6),
    DB_NAME: env.READIO_DB_NAME,

    // External APIs
    DEFAULT_CORS_PROXY: env.READIO_DEFAULT_CORS_PROXY,
    DICT_API_URL: env.READIO_DICT_API_URL,
    DISCOVERY_LOOKUP_URL: env.READIO_DISCOVERY_LOOKUP_URL,
    DISCOVERY_SEARCH_URL: env.READIO_DISCOVERY_SEARCH_URL,
    RSS_FEED_BASE_URL: env.READIO_RSS_FEED_BASE_URL,

    // Limits
    MAX_AUDIO_SIZE_MB: num(env.READIO_MAX_AUDIO_SIZE_MB, 300),
    DICT_CACHE_MAX_ENTRIES: num(env.READIO_DICT_CACHE_MAX_ENTRIES, 500),
    DICT_CACHE_KEY: env.READIO_DICT_CACHE_KEY,
    SAVE_PROGRESS_INTERVAL_MS: num(env.READIO_SAVE_PROGRESS_INTERVAL_MS, 5000),

    // UI
    MIN_ZOOM: num(env.READIO_MIN_ZOOM, 0.5),
    MAX_ZOOM: num(env.READIO_MAX_ZOOM, 3.0),
    ZOOM_STEP: num(env.READIO_ZOOM_STEP, 0.1),
    ZOOM_HIDE_DELAY_MS: num(env.READIO_ZOOM_HIDE_DELAY_MS, 2000),
    CLICK_DELAY_MS: num(env.READIO_CLICK_DELAY_MS, 240),

    // Localization
    DEFAULT_LANG: env.READIO_DEFAULT_LANG,
    DEFAULT_COUNTRY: env.READIO_DEFAULT_COUNTRY,

    // Assets
    FALLBACK_PODCAST_IMAGE: env.READIO_FALLBACK_PODCAST_IMAGE,

    // TTLs
    CACHE_TTL_EPISODES_MS: num(env.READIO_CACHE_TTL_EPISODES_MS, 3600000),
    RECOMMENDED_TTL_MS: num(env.READIO_RECOMMENDED_TTL_MS, 86400000),

    // Legacy / Mock
    USE_MOCK_DATA:
      import.meta.env.VITE_USE_MOCK_DATA === 'true' || String(env.READIO_USE_MOCK) === 'true',
  }

  const shape = AppConfigSchema.shape
  // biome-ignore lint/suspicious/noExplicitAny: dynamic field population
  const config = {} as any

  for (const key in shape) {
    const fieldKey = key as keyof typeof shape
    const fieldSchema = shape[fieldKey]
    const rawVal = rawConfig[fieldKey as keyof typeof rawConfig]

    const result = fieldSchema.safeParse(rawVal)
    if (result.success) {
      config[fieldKey] = result.data
    } else {
      // Fallback to the default value defined in the schema for this specific field
      config[fieldKey] = fieldSchema.parse(undefined)
      console.warn(
        `[runtimeConfig] field "${fieldKey}" has invalid value "${rawVal}", falling back to default.`,
        result.error.issues
      )
    }
  }

  return config as AppConfig
}
