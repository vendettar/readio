import { ASR_PROVIDER_IDS } from './asr/types'
import { logError } from './logger'
import { DEFAULTS } from './runtimeConfig.defaults'
import { type AppConfig, AppConfigSchema, ENV_MAP } from './runtimeConfig.schema'

declare global {
  interface Window {
    __READIO_ENV__?: {
      VITE_API_BASE_URL?: string
      READIO_APP_NAME?: string
      READIO_APP_VERSION?: string
      READIO_NETWORK_PROXY_URL?: string
      READIO_NETWORK_PROXY_AUTH_HEADER?: string
      READIO_NETWORK_PROXY_AUTH_VALUE?: string
      VITE_GRAFANA_FARO_URL?: string
      VITE_GRAFANA_FARO_APP_NAME?: string
      VITE_GRAFANA_FARO_ENV?: string
      VITE_GRAFANA_FARO_SAMPLE_RATE?: number | string
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
let cachedRuntimeEnv: Window['__READIO_ENV__'] | null = null

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
  const runtimeEnv = (typeof window !== 'undefined' && window.__READIO_ENV__) || {}

  if (cachedConfig) {
    if (runtimeReady && cachedFromRuntimeEnv && cachedRuntimeEnv === runtimeEnv) {
      return cachedConfig
    }
    if (!runtimeReady && !cachedFromRuntimeEnv) {
      return cachedConfig
    }
  }

  const rawConfig: Record<string, unknown> = {}
  for (const [key, envKey] of Object.entries(ENV_MAP)) {
    // 1. Try window.__READIO_ENV__ (Runtime)
    let envValue = runtimeEnv[envKey as keyof typeof runtimeEnv]

    // 2. Fallback to import.meta.env (Build-time / CF Pages Env)
    if (envValue === undefined || envValue === null || envValue === '') {
      envValue = import.meta.env[envKey]
    }

    rawConfig[key] = envValue
  }

  if (import.meta.env.VITE_USE_MOCK_DATA === 'true') {
    rawConfig.USE_MOCK_DATA = true
  }

  try {
    const parsedConfig = AppConfigSchema.parse(rawConfig)

    // Normalize relative paths if API_BASE_URL is set (Decoupled Frontend Support)
    if (parsedConfig.API_BASE_URL) {
      const baseUrl = parsedConfig.API_BASE_URL.replace(/\/$/, '')
      if (parsedConfig.NETWORK_PROXY_URL.startsWith('/')) {
        parsedConfig.NETWORK_PROXY_URL = `${baseUrl}${parsedConfig.NETWORK_PROXY_URL}`
      }
      if (parsedConfig.FALLBACK_PODCAST_IMAGE.startsWith('/')) {
        parsedConfig.FALLBACK_PODCAST_IMAGE = `${baseUrl}${parsedConfig.FALLBACK_PODCAST_IMAGE}`
      }
    }

    const config = sanitizeBrowserRuntimeSecrets(parsedConfig)

    const hasProxyUrl = config.NETWORK_PROXY_URL.trim().length > 0

    if (hasProxyUrl && config.NETWORK_PROXY_AUTH_HEADER && !config.NETWORK_PROXY_AUTH_VALUE) {
      if (import.meta.env.DEV) {
        logError(
          '[runtimeConfig] NETWORK_PROXY_AUTH_HEADER is set but NETWORK_PROXY_AUTH_VALUE is missing. Auth will not work.'
        )
      }
    }

    if (
      config.NETWORK_PROXY_AUTH_HEADER &&
      config.NETWORK_PROXY_AUTH_HEADER.toLowerCase() !== 'x-proxy-token'
    ) {
      if (import.meta.env.DEV) {
        logError(
          '[runtimeConfig] Invalid NETWORK_PROXY_AUTH_HEADER. Use "x-proxy-token" to match worker proxy contract.'
        )
      }
    }

    cachedConfig = config
    cachedFromRuntimeEnv = runtimeReady
    cachedRuntimeEnv = runtimeReady ? runtimeEnv : null
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
    cachedRuntimeEnv = runtimeReady ? runtimeEnv : null
    return fallback
  }
}

export function getApiBaseUrl(): string {
  return getAppConfig().API_BASE_URL.replace(/\/$/, '')
}

export function buildBackendURL(pathname: string): string {
  if (/^https?:\/\//i.test(pathname)) {
    return pathname
  }
  const apiBase = getApiBaseUrl()
  if (!apiBase) {
    if (!import.meta.env.DEV) {
      throw new Error('VITE_API_BASE_URL is required for backend API requests in production builds')
    }
    return pathname
  }
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${apiBase}${normalizedPath}`
}

/**
 * fetchRuntimeConfig attempts to fetch configuration from the backend
 * if window.__READIO_ENV__ is not already set. This is used in decoupled
 * deployments (e.g., Cloudflare Pages) where /env.js is not served from the same origin.
 */
export async function fetchRuntimeConfig(): Promise<void> {
  if (typeof window === 'undefined') return
  if (window.__READIO_ENV__) return // Already set via script tag or previous fetch

  const config = getAppConfig()
  const apiBase = config.API_BASE_URL.replace(/\/$/, '')
  const fetchUrl = apiBase ? `${apiBase}/api/v1/config` : '/api/v1/config'

  try {
    const resp = await fetch(fetchUrl)

    if (resp.ok) {
      const data = await resp.json()
      window.__READIO_ENV__ = data
      // Reset caches so getAppConfig() returns the fresh data
      cachedConfig = null
      cachedFromRuntimeEnv = true
    }
  } catch (err) {
    // Silently fail, getAppConfig will use fallbacks/defaults
    if (import.meta.env.DEV) {
      console.warn('[runtimeConfig] Failed to fetch remote config:', err)
    }
  }
}
