// src/hooks/useSettingsForm.ts
// Hook for managing settings form state with react-hook-form and persistence

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  createSettingsFormSchema,
  SETTINGS_STORAGE_KEY,
  type SettingsFormValues,
} from '../lib/schemas/settings'
import { getJson, setJson } from '../lib/storage'

/**
 * Hook for managing the settings form
 * - Loads persisted values on mount
 * - Auto-saves on valid field blur
 * - Provides form methods and field registration
 */
export function useSettingsForm() {
  const { i18n } = useTranslation()

  // Create schema with current locale error messages
  // Re-create when language changes so validation messages update
  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.language is used to trigger re-creation of schema with new translations
  const schema = useMemo(() => createSettingsFormSchema(), [i18n.language])

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      openAiKey: '',
      proxyUrl: '',
    },
    mode: 'onBlur', // Validate on blur for better UX
  })

  // Load persisted settings on mount
  useEffect(() => {
    const stored = getJson<SettingsFormValues>(SETTINGS_STORAGE_KEY)
    if (stored) {
      form.reset(stored)
    }
  }, [form])

  // Save settings to storage
  const saveSettings = (values: SettingsFormValues) => {
    setJson(SETTINGS_STORAGE_KEY, values)
  }

  // Handle form submission (explicit save)
  const onSubmit = form.handleSubmit((values) => {
    saveSettings(values)
  })

  // Handle field blur - auto-save if valid
  const handleFieldBlur = async () => {
    const isValid = await form.trigger()
    if (isValid) {
      saveSettings(form.getValues())
    }
  }

  return {
    form,
    onSubmit,
    handleFieldBlur,
  }
}
