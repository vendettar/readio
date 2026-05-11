import type { Faro } from '@grafana/faro-web-sdk'
import {
  getWebInstrumentations,
  initializeFaro as initializeGrafanaFaro,
} from '@grafana/faro-web-sdk'
import { setErrorReporter } from './errorReporter'
import { logError } from './logger'
import type { AppConfig } from './runtimeConfig'

type FaroConfig = Pick<
  AppConfig,
  | 'APP_NAME'
  | 'APP_VERSION'
  | 'GRAFANA_FARO_URL'
  | 'GRAFANA_FARO_APP_NAME'
  | 'GRAFANA_FARO_ENV'
  | 'GRAFANA_FARO_SAMPLE_RATE'
>

type SchemaIssue = {
  path?: Array<string | number>
  code?: string
}

type SchemaValidationDiagnostic = {
  schemaName: string
  provider?: string
  routeClass?: string
  errorClass?: string
  issues: SchemaIssue[]
  sampleRate?: number
}

type FaroInitializer = typeof initializeGrafanaFaro

const REDACTED = '[REDACTED]'
const MAX_TEXT_LENGTH = 160
const LONG_TEXT_WORD_THRESHOLD = 24

let faroInstance: Faro | null = null
let faroInitialized = false

export function resetFaroForTests(): void {
  faroInstance = null
  faroInitialized = false
  setErrorReporter(() => {})
}

export function initializeFaro(
  config: FaroConfig,
  init: FaroInitializer = initializeGrafanaFaro
): Faro | null {
  if (faroInitialized) return faroInstance
  faroInitialized = true

  const collectorUrl = config.GRAFANA_FARO_URL.trim()
  const sampleRate = normalizeSampleRate(config.GRAFANA_FARO_SAMPLE_RATE)
  if (!collectorUrl || sampleRate <= 0 || !shouldSample(sampleRate)) {
    return null
  }

  try {
    faroInstance = init({
      url: collectorUrl,
      app: {
        name: sanitizeValue(config.GRAFANA_FARO_APP_NAME || config.APP_NAME || 'readio-cloud'),
        version: sanitizeValue(config.APP_VERSION),
        environment: sanitizeValue(config.GRAFANA_FARO_ENV),
      },
      instrumentations: getWebInstrumentations(),
      preventGlobalExposure: true,
      trackResources: false,
      beforeSend: (item) => sanitizeTransportItem(item),
    })

    setErrorReporter((error, info) => {
      faroInstance?.api.pushEvent(
        'react_error_boundary',
        sanitizeAttributes({
          error_class: 'react_error_boundary',
          message: error.name || 'Error',
          component_stack: info.componentStack ?? '',
        }),
        'readio'
      )
    })
  } catch (error) {
    faroInstance = null
    if (import.meta.env.DEV) {
      logError('[faro] initialization failed; continuing without browser telemetry', error)
    }
  }

  return faroInstance
}

export function reportSchemaValidationError(diagnostic: SchemaValidationDiagnostic): void {
  if (!faroInstance) return
  const sampleRate = normalizeSampleRate(diagnostic.sampleRate ?? 1)
  if (sampleRate <= 0 || !shouldSample(sampleRate)) return

  for (const issue of diagnostic.issues.slice(0, 12)) {
    faroInstance.api.pushEvent(
      'schema_validation_error',
      sanitizeAttributes({
        schema_name: diagnostic.schemaName,
        provider: diagnostic.provider ?? 'unknown',
        route_class: diagnostic.routeClass ?? 'unknown',
        error_class: diagnostic.errorClass ?? 'schema_validation',
        issue_path: Array.isArray(issue.path) ? issue.path.join('.') : '',
        issue_code: issue.code ?? 'unknown',
      }),
      'readio'
    )
  }
}

export function sanitizeValue(value: unknown): string {
  if (value == null) return ''
  let text = String(value)
  text = text.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
  text = text.replace(/\/Users\/[^/\s]+(?:\/[^\s]*)?/g, REDACTED)
  text = text.replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, `Bearer ${REDACTED}`)
  text = text.replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, REDACTED)
  text = text.replace(/\bcookie\s*[:=]\s*[^;\s]+/gi, `cookie=${REDACTED}`)
  text = text.replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, (match) => {
    try {
      const parsed = new URL(match)
      return `${parsed.origin}${parsed.pathname}`
    } catch {
      return REDACTED
    }
  })

  const wordCount = text.trim().split(/\s+/).filter(Boolean).length
  if (text.length > MAX_TEXT_LENGTH || wordCount > LONG_TEXT_WORD_THRESHOLD) {
    return `${text.slice(0, MAX_TEXT_LENGTH)}...`
  }
  return text
}

function sanitizeAttributes(attributes: Record<string, unknown>): Record<string, string> {
  const sanitized: Record<string, string> = {}
  for (const [key, value] of Object.entries(attributes)) {
    sanitized[key] = sanitizeValue(value)
  }
  return sanitized
}

function deepSanitize<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string') return sanitizeValue(value) as unknown as T
    return value
  }

  if (Array.isArray(value)) {
    return value.map(deepSanitize) as unknown as T
  }

  const sanitized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    sanitized[k] = deepSanitize(v)
  }
  return sanitized as T
}

function sanitizeTransportItem<T extends { payload?: unknown; meta?: unknown }>(item: T): T | null {
  try {
    return deepSanitize(item)
  } catch {
    return null
  }
}

function normalizeSampleRate(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(1, Math.max(0, value))
}

function shouldSample(sampleRate: number): boolean {
  if (sampleRate >= 1) return true
  if (sampleRate <= 0) return false
  return Math.random() < sampleRate
}
