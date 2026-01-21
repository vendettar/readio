// src/lib/schemas/settings.ts
// Zod schemas for user settings validation

import { z } from 'zod'

/**
 * Settings form schema
 * - openAiKey: Empty string allowed, but if provided must start with 'sk-'
 * - proxyUrl: Empty string allowed, but if provided must be a valid URL
 */
export const settingsFormSchema = z.object({
  openAiKey: z.string().refine((val) => val === '' || val.startsWith('sk-'), {
    message: 'Must start with sk-',
  }),
  proxyUrl: z.string().refine((val) => val === '' || z.string().url().safeParse(val).success, {
    message: 'Must be a valid URL',
  }),
})

export type SettingsFormValues = z.infer<typeof settingsFormSchema>

// Storage keys for settings persistence
export const SETTINGS_STORAGE_KEY = 'readio-user-settings'
