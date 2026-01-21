// src/lib/schemas/settings.ts
// Zod schemas for user settings validation

import { z } from 'zod'
import { translate } from '../i18nUtils'

/**
 * Settings form schema factory
 * Creates schema with current locale error messages
 * - openAiKey: Empty string allowed, but if provided must start with 'sk-'
 * - proxyUrl: Empty string allowed, but if provided must be a valid URL
 */
export function createSettingsFormSchema() {
  return z.object({
    openAiKey: z.string().refine((val) => val === '' || val.startsWith('sk-'), {
      message: translate('validationApiKeyPrefix'),
    }),
    proxyUrl: z.string().refine((val) => val === '' || z.string().url().safeParse(val).success, {
      message: translate('validationUrlInvalid'),
    }),
  })
}

export type SettingsFormValues = z.infer<ReturnType<typeof createSettingsFormSchema>>

// Storage keys for settings persistence
export const SETTINGS_STORAGE_KEY = 'readio-user-settings'
