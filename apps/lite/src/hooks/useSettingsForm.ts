// src/hooks/useSettingsForm.ts
// Hook for managing settings form state with react-hook-form and persistence

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import {
  SETTINGS_STORAGE_KEY,
  type SettingsFormValues,
  settingsFormSchema,
} from '../lib/schemas/settings'
import { getJson, setJson } from '../lib/storage'

/**
 * Hook for managing the settings form
 * - Loads persisted values on mount
 * - Auto-saves on valid field blur
 * - Provides form methods and field registration
 */
export function useSettingsForm() {
  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
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
