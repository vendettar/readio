// src/lib/schemas/settings.ts
// Zod schemas for user settings validation

import { z } from 'zod'
import { SETTINGS_STORAGE_KEY } from '../../constants/storage'
import { resolveEnabledAsrProviders } from '../asr/providerToggles'
import { ASR_CONFIG_ERROR, isAsrProvider, validateAsrProviderModelSelection } from '../asr/registry'
import type { ASRProvider } from '../asr/types'
import { translate } from '../i18nUtils'
import { getAppConfig } from '../runtimeConfig'
import { DEFAULTS } from '../runtimeConfig.defaults'
import { getJson } from '../storage'

export { SETTINGS_STORAGE_KEY }

export function getEnabledAsrProviders(): ASRProvider[] {
  const config = getAppConfig()
  return resolveEnabledAsrProviders(config)
}
const PROXY_AUTH_HEADER = DEFAULTS.CORS_PROXY_AUTH_HEADER

export function normalizeProxyAuthHeader(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized === PROXY_AUTH_HEADER ? PROXY_AUTH_HEADER : ''
}

export function normalizeAsrProvider(value: unknown): ASRProvider | '' {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return isAsrProvider(normalized) ? normalized : ''
}

export function normalizeAsrModel(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim()
}

export function normalizeAsrUseCustomModel(value: unknown): boolean {
  return value === true
}

export function normalizeAsrPreferenceValues(raw: {
  asrProvider: unknown
  asrModel: unknown
  asrUseCustomModel: unknown
  asrCustomModelId: unknown
}): {
  asrProvider: ASRProvider | ''
  asrModel: string
  asrUseCustomModel: boolean
  asrCustomModelId: string
} {
  const asrProvider = normalizeAsrProvider(raw.asrProvider)
  const asrModel = normalizeAsrModel(raw.asrModel)
  const asrUseCustomModel = normalizeAsrUseCustomModel(raw.asrUseCustomModel)
  const asrCustomModelId = normalizeAsrModel(raw.asrCustomModelId)

  if (!asrProvider) {
    return {
      asrProvider: '',
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
    }
  }

  const enabledProviders = getEnabledAsrProviders()
  if (!enabledProviders.includes(asrProvider)) {
    return {
      asrProvider: '',
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
    }
  }

  if (asrUseCustomModel) {
    if (!asrCustomModelId) {
      return {
        asrProvider,
        asrModel: '',
        asrUseCustomModel: true,
        asrCustomModelId: '',
      }
    }
    return {
      asrProvider,
      asrModel: '',
      asrUseCustomModel: true,
      asrCustomModelId,
    }
  }

  if (!asrModel) {
    return {
      asrProvider,
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
    }
  }

  const pairValidation = validateAsrProviderModelSelection({
    asrProvider,
    asrModel,
    asrUseCustomModel: false,
    asrCustomModelId: '',
  })
  if (!pairValidation.ok) {
    return {
      asrProvider,
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
    }
  }

  return {
    asrProvider,
    asrModel,
    asrUseCustomModel: false,
    asrCustomModelId: '',
  }
}

/**
 * Settings form schema factory
 * Creates schema with current locale error messages
 * - translateKey: API key for translation services (OpenAI, etc.)
 * - asrKey: API key for ASR services (Groq, etc.)
 * - proxyUrl: Empty string allowed, but if provided must be a valid URL
 */
export function createSettingsFormSchema() {
  return z
    .object({
      asrProvider: z.string().trim(),
      asrModel: z.string().trim(),
      asrUseCustomModel: z.boolean(),
      asrCustomModelId: z.string().trim(),
      asrKey: z.string().trim(),
      translateKey: z.string().refine((val) => val === '' || val.startsWith('sk-'), {
        message: translate('validationApiKeyPrefix'),
      }),
      proxyUrl: z.string().refine((val) => val === '' || z.string().url().safeParse(val).success, {
        message: translate('validationUrlInvalid'),
      }),
      proxyAuthHeader: z
        .string()
        .trim()
        .superRefine((val, ctx) => {
          if (val !== '' && val !== PROXY_AUTH_HEADER) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: translate('validationProxyAuthHeaderInvalid', {
                header: PROXY_AUTH_HEADER,
                defaultValue: `Auth header must be "${PROXY_AUTH_HEADER}"`,
              }),
            })
          }
        }),
      proxyAuthValue: z.string().trim(),
      pauseOnDictionaryLookup: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const provider = values.asrProvider.trim()
      const model = values.asrModel.trim()
      const customModel = values.asrCustomModelId.trim()
      const useCustom = values.asrUseCustomModel

      const asrDisabled = !provider && !model && !customModel && !useCustom
      if (asrDisabled) return

      const validation = validateAsrProviderModelSelection({
        asrProvider: provider,
        asrModel: model,
        asrUseCustomModel: useCustom,
        asrCustomModelId: customModel,
      })

      if (validation.ok) {
        const enabledProviders = getEnabledAsrProviders()
        if (!enabledProviders.includes(provider as ASRProvider)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: translate('validationProviderRequired'),
            path: ['asrProvider'],
          })
        }
        return
      }

      if (validation.code === ASR_CONFIG_ERROR.UNCONFIGURED_PROVIDER) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: translate('validationProviderRequired'),
          path: ['asrProvider'],
        })
        return
      }
      if (validation.code === ASR_CONFIG_ERROR.UNCONFIGURED_MODEL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: useCustom
            ? translate('validationCustomModelRequired')
            : translate('validationModelRequired'),
          path: useCustom ? ['asrCustomModelId'] : ['asrModel'],
        })
        return
      }
      if (validation.code === ASR_CONFIG_ERROR.INVALID_PROVIDER_MODEL_PAIR) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: translate('validationProviderModelPairInvalid'),
          path: ['asrModel'],
        })
      }
    })
}

export type SettingsFormValues = z.infer<ReturnType<typeof createSettingsFormSchema>>
export type SettingsCredentialValues = Pick<SettingsFormValues, 'asrKey' | 'translateKey'>
export type SettingsPreferenceValues = Pick<
  SettingsFormValues,
  | 'asrProvider'
  | 'asrModel'
  | 'asrUseCustomModel'
  | 'asrCustomModelId'
  | 'proxyUrl'
  | 'proxyAuthHeader'
  | 'proxyAuthValue'
  | 'pauseOnDictionaryLookup'
>

export function getSettingsSnapshot(): SettingsPreferenceValues {
  const config = getAppConfig()
  const stored = getJson<SettingsPreferenceValues>(SETTINGS_STORAGE_KEY)
  const hasStoredAsrSelection =
    !!stored &&
    ('asrProvider' in stored ||
      'asrModel' in stored ||
      'asrUseCustomModel' in stored ||
      'asrCustomModelId' in stored)
  const rawAsr = hasStoredAsrSelection
    ? {
        asrProvider: stored?.asrProvider,
        asrModel: stored?.asrModel,
        asrUseCustomModel: stored?.asrUseCustomModel,
        asrCustomModelId: stored?.asrCustomModelId,
      }
    : {
        asrProvider: config.ASR_PROVIDER,
        asrModel: config.ASR_MODEL,
        asrUseCustomModel: false,
        asrCustomModelId: '',
      }
  const normalizedAsr = normalizeAsrPreferenceValues(rawAsr)

  return {
    asrProvider: normalizedAsr.asrProvider,
    asrModel: normalizedAsr.asrModel,
    asrUseCustomModel: normalizedAsr.asrUseCustomModel,
    asrCustomModelId: normalizedAsr.asrCustomModelId,
    proxyUrl: stored?.proxyUrl ?? config.CORS_PROXY_URL ?? '',
    proxyAuthHeader:
      normalizeProxyAuthHeader(stored?.proxyAuthHeader) ||
      normalizeProxyAuthHeader(config.CORS_PROXY_AUTH_HEADER),
    proxyAuthValue: stored?.proxyAuthValue ?? config.CORS_PROXY_AUTH_VALUE ?? '',
    pauseOnDictionaryLookup: stored?.pauseOnDictionaryLookup ?? true,
  }
}

// Storage keys for settings persistence
// In-memory epoch counter for settings — bumped on wipeAll() to invalidate
// stale async writes captured before the wipe.
let settingsWriteEpoch = 0
export function getSettingsWriteEpoch(): number {
  return settingsWriteEpoch
}
export function bumpSettingsWriteEpoch(): void {
  settingsWriteEpoch += 1
}
