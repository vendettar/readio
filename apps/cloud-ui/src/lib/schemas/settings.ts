// src/lib/schemas/settings.ts
// Zod schemas for user settings validation

import { z } from 'zod'
import { SETTINGS_STORAGE_KEY } from '../../constants/storage'
import { defaultAsrProvider, resolveEnabledAsrProviders } from '../asr/providerToggles'
import {
  ASR_CONFIG_ERROR,
  getAsrModelsForProvider,
  isAsrProvider,
  validateAsrProviderModelSelection,
} from '../asr/registry'
import type { ASRProvider } from '../asr/types'
import { translate } from '../i18nUtils'
import { getAppConfig } from '../runtimeConfig'
import { getJson } from '../storage'

export { SETTINGS_STORAGE_KEY }

export function getEnabledAsrProviders(): ASRProvider[] {
  const config = getAppConfig()
  return resolveEnabledAsrProviders(config)
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

export function normalizeAsrPreferenceValues(raw: { asrProvider: unknown; asrModel: unknown }): {
  asrProvider: ASRProvider | ''
  asrModel: string
} {
  let asrProvider = normalizeAsrProvider(raw.asrProvider)
  let asrModel = normalizeAsrModel(raw.asrModel)

  const enabledProviders = getEnabledAsrProviders()

  // Forced single provider auto-selection
  if (enabledProviders.length === 1 && enabledProviders[0] === defaultAsrProvider && !asrProvider) {
    asrProvider = defaultAsrProvider
    const models = getAsrModelsForProvider(defaultAsrProvider)
    if (models.length > 0 && !asrModel) {
      asrModel = models[0]
    }
  }

  if (asrProvider && !enabledProviders.includes(asrProvider)) {
    return {
      asrProvider: '',
      asrModel: '',
    }
  }

  if (!asrModel) {
    return {
      asrProvider,
      asrModel: '',
    }
  }

  const pairValidation = validateAsrProviderModelSelection({
    asrProvider,
    asrModel,
  })

  if (!pairValidation.ok) {
    return {
      asrProvider,
      asrModel: '',
    }
  }

  return {
    asrProvider,
    asrModel,
  }
}

/**
 * Settings form schema factory
 * Creates schema with current locale error messages
 * - translateKey: API key for translation services (OpenAI, etc.)
 * - asrKey: API key for ASR services (Groq, etc.)
 */
export function createSettingsFormSchema() {
  return z
    .object({
      asrProvider: z.string().trim(),
      asrModel: z.string().trim(),
      asrKey: z.string().trim(),
      translateKey: z.string().refine((val) => val === '' || val.startsWith('sk-'), {
        message: translate('validationApiKeyPrefix'),
      }),
      pauseOnDictionaryLookup: z.boolean(),
    })
    .superRefine((values, ctx) => {
      const provider = values.asrProvider.trim()
      const model = values.asrModel.trim()
      const asrKey = values.asrKey.trim()

      if (provider === defaultAsrProvider && asrKey !== '') {
        if (!asrKey.startsWith('gsk_') || asrKey.length !== 56) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: translate('validationGroqKeyInvalid'),
            path: ['asrKey'],
          })
        }
      }

      const asrDisabled = !provider && !model
      if (asrDisabled) return

      const validation = validateAsrProviderModelSelection({
        asrProvider: provider,
        asrModel: model,
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
          message: translate('validationModelRequired'),
          path: ['asrModel'],
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
  'asrProvider' | 'asrModel' | 'pauseOnDictionaryLookup'
>

export function getSettingsSnapshot(): SettingsPreferenceValues {
  const config = getAppConfig()
  const stored = getJson<SettingsPreferenceValues>(SETTINGS_STORAGE_KEY)
  const hasStoredAsrSelection = !!stored && ('asrProvider' in stored || 'asrModel' in stored)
  const rawAsr = hasStoredAsrSelection
    ? {
        asrProvider: stored?.asrProvider,
        asrModel: stored?.asrModel,
      }
    : {
        asrProvider: config.ASR_PROVIDER,
        asrModel: config.ASR_MODEL,
      }
  const normalizedAsr = normalizeAsrPreferenceValues(rawAsr)

  return {
    asrProvider: normalizedAsr.asrProvider,
    asrModel: normalizedAsr.asrModel,
    pauseOnDictionaryLookup: stored?.pauseOnDictionaryLookup ?? true,
  }
}

let settingsWriteEpoch = 0
export function getSettingsWriteEpoch(): number {
  return settingsWriteEpoch
}

export function bumpSettingsWriteEpoch(): void {
  settingsWriteEpoch += 1
}
