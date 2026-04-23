import { ASR_PROVIDER_IDS } from './asr/types'
import { logError } from './logger'
import { DEFAULTS } from './runtimeConfig.defaults'
import { type AppConfig, AppConfigSchema, ENV_MAP } from './runtimeConfig.schema'

declare global {
  interface Window {
    __READIO_ENV__?: {
      READIO_APP_NAME?: string
      READIO_APP_VERSION?: string
      READIO_CORS_PROXY_URL?: string
      READIO_CORS_PROXY_AUTH_HEADER?: string
      READIO_CORS_PROXY_AUTH_VALUE?: string
      READIO_ASR_API_KEY?: string
      READIO_ASR_RELAY_PUBLIC_TOKEN?: string
      READIO_OPENAI_API_KEY?: string
      READIO_ASR_PROVIDER?: string
      READIO_ASR_MODEL?: string
      READIO_ENABLED_ASR_PROVIDERS?: string
      READIO_DISABLED_ASR_PROVIDERS?: string
      READIO_USE_MOCK?: boolean | string
      READIO_PROXY_TIMEOUT_MS?: number | string
      READIO_DIRECT_TIMEOUT_MS?: number | string
      READIO_MAX_CONCURRENT_REQUESTS?: number | string
      READIO_DB_NAME?: string
      READIO_EN_DICTIONARY_API_URL?: string
      READIO_EN_DICTIONARY_API_TRANSPORT?: string
      READIO_MAX_AUDIO_CACHE_GB?: number | string
      READIO_DICT_CACHE_MAX_ENTRIES?: number | string
      READIO_DICT_CACHE_KEY?: string
      READIO_SAVE_PROGRESS_INTERVAL_MS?: number | string
      READIO_MIN_ZOOM?: number | string
      READIO_MAX_ZOOM?: number | string
      READIO_ZOOM_STEP?: number | string
      READIO_ZOOM_HIDE_DELAY_MS?: number | string
      READIO_DEFAULT_PODCAST_CONTENT_COUNTRY?: string
      READIO_DEFAULT_LANGUAGE?: string
      READIO_FALLBACK_PODCAST_IMAGE?: string
      READIO_CACHE_TTL_EPISODES_MS?: number | string
      READIO_RECOMMENDED_TTL_MS?: number | string
      READIO_SEARCH_SUGGESTIONS_LIMIT?: number | string
      READIO_SEARCH_PODCASTS_LIMIT?: number | string
      READIO_SEARCH_EPISODES_LIMIT?: number | string
    }
  }
}

let cachedConfig: AppConfig | null = null
let cachedFromRuntimeEnv = false

export { DEFAULTS }
export type { AppConfig }

const UPSTREAM_SECRET_PREFIXES = ['sk-proj-', 'sk-'] as const

function hasUpstreamSecretPrefix(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return false
  return UPSTREAM_SECRET_PREFIXES.some((prefix) => normalized.startsWith(prefix))
}

function sanitizeBrowserRuntimeSecrets(config: AppConfig): AppConfig {
  let sanitized = config

  const sanitizeField = (field: 'ASR_API_KEY' | 'OPENAI_API_KEY', envKey: string) => {
    const value = config[field]
    if (typeof value !== 'string' || !hasUpstreamSecretPrefix(value)) return

    if (import.meta.env.DEV) {
      logError(
        `[runtimeConfig] ${envKey} looks like an upstream provider secret. Browser runtime config rejects this format; ignoring value.`
      )
    }

    if (sanitized === config) {
      sanitized = { ...config }
    }
    sanitized[field] = ''
  }

  sanitizeField('ASR_API_KEY', 'READIO_ASR_API_KEY')
  sanitizeField('OPENAI_API_KEY', 'READIO_OPENAI_API_KEY')
  return sanitized
}

export function isRuntimeConfigReady(): boolean {
  if (typeof window === 'undefined') return true
  return typeof window.__READIO_ENV__ !== 'undefined'
}

export function getAppConfig(): AppConfig {
  const runtimeReady = isRuntimeConfigReady()

  if (cachedConfig && (cachedFromRuntimeEnv || !runtimeReady)) {
    return cachedConfig
  }

  const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {}

  const rawConfig: Record<string, unknown> = {}
  for (const [key, envKey] of Object.entries(ENV_MAP)) {
    const envValue = env[envKey as keyof typeof env]
    rawConfig[key] = envValue
  }

  if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
    rawConfig.USE_MOCK_DATA = true
  }

  try {
    const parsedConfig = AppConfigSchema.parse(rawConfig)
    const config = sanitizeBrowserRuntimeSecrets(parsedConfig)
    const hasProxyUrl = config.CORS_PROXY_URL.trim().length > 0

    if (hasProxyUrl && config.CORS_PROXY_AUTH_HEADER && !config.CORS_PROXY_AUTH_VALUE) {
      if (import.meta.env.DEV) {
        logError(
          '[runtimeConfig] CORS_PROXY_AUTH_HEADER is set but CORS_PROXY_AUTH_VALUE is missing. Auth will not work.'
        )
      }
    }

    if (
      config.CORS_PROXY_AUTH_HEADER &&
      config.CORS_PROXY_AUTH_HEADER.toLowerCase() !== 'x-proxy-token'
    ) {
      if (import.meta.env.DEV) {
        logError(
          '[runtimeConfig] Invalid CORS_PROXY_AUTH_HEADER. Use "x-proxy-token" to match worker CORS contract.'
        )
      }
    }

    cachedConfig = config
    cachedFromRuntimeEnv = runtimeReady
    return config
  } catch (error: unknown) {
    logError('[runtimeConfig] Unexpected schema parse failure:', error)

    const zodIssues =
      typeof error === 'object' &&
      error !== null &&
      'issues' in error &&
      Array.isArray((error as { issues?: unknown }).issues)
        ? ((error as { issues: Array<{ path?: unknown; message?: string }> }).issues ?? [])
        : []

    const hasAsrToggleIssue = zodIssues.some(
      (issue) =>
        Array.isArray(issue?.path) &&
        issue.path.some(
          (segment) => segment === 'ENABLED_ASR_PROVIDERS' || segment === 'DISABLED_ASR_PROVIDERS'
        )
    )

    const fallback = hasAsrToggleIssue
      ? AppConfigSchema.parse({
          ENABLED_ASR_PROVIDERS: ASR_PROVIDER_IDS.join(','),
          DISABLED_ASR_PROVIDERS: ASR_PROVIDER_IDS.join(','),
        })
      : AppConfigSchema.parse({})
    cachedConfig = fallback
    cachedFromRuntimeEnv = runtimeReady
    return fallback
  }
}
