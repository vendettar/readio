// src/hooks/useSettingsForm.ts
// Hook for managing settings form state with react-hook-form and persistence

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import {
  ASR_CREDENTIAL_KEY,
  getAllCredentials,
  getCredentialWriteEpoch,
  setCredentials,
  TRANSLATE_CREDENTIAL_KEY,
} from '../lib/db/credentialsRepository'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'

import {
  createSettingsFormSchema,
  getSettingsSnapshot,
  getSettingsWriteEpoch,
  normalizeAsrPreferenceValues,
  SETTINGS_STORAGE_KEY,
  type SettingsCredentialValues,
  type SettingsFormValues,
  type SettingsPreferenceValues,
} from '../lib/schemas/settings'
import { setJson } from '../lib/storage'
import { toast } from '../lib/toast'

function mapCredentialRecordToSettings(
  credentials: Record<string, string>
): SettingsCredentialValues {
  return {
    asrKey: credentials[ASR_CREDENTIAL_KEY] ?? '',
    translateKey: credentials[TRANSLATE_CREDENTIAL_KEY] ?? '',
  }
}

function mapSettingsToCredentialRecord(values: SettingsCredentialValues): Record<string, string> {
  return {
    [ASR_CREDENTIAL_KEY]: values.asrKey,
    [TRANSLATE_CREDENTIAL_KEY]: values.translateKey,
  }
}

/**
 * Hook for managing the settings form
 * - Loads persisted values on mount
 * - Auto-saves on valid field blur
 * - Provides form methods and field registration
 */
export function useSettingsForm() {
  const { i18n } = useTranslation()
  const [credentialsLoaded, setCredentialsLoaded] = useState(false)
  const [loadError, setLoadError] = useState<Error | null>(null)

  // Create schema with current locale error messages
  // Re-create when language changes so validation messages update
  // biome-ignore lint/correctness/useExhaustiveDependencies: i18n.language is used to trigger re-creation of schema with new translations
  const schema = useMemo(() => createSettingsFormSchema(), [i18n.language])

  const form = useForm<SettingsFormValues, unknown, SettingsFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      asrProvider: '',
      asrModel: '',
      asrKey: '',
      translateKey: '',
      pauseOnDictionaryLookup: true,
    },
    mode: 'onBlur', // Validate on blur for better UX
  })

  // Load persisted settings on mount
  useEffect(() => {
    let isMounted = true

    setCredentialsLoaded(false)
    setLoadError(null)

    const preferences = getSettingsSnapshot()

    void getAllCredentials()
      .then((credentialsStored) => {
        if (!isMounted) return
        const credentials = mapCredentialRecordToSettings(credentialsStored)
        form.reset({ ...preferences, ...credentials })
        setCredentialsLoaded(true)
      })
      .catch((error) => {
        if (!isMounted) return
        if (!isAbortLikeError(error)) warn('[useSettingsForm] Failed to load credentials:', error)
        setLoadError(error instanceof Error ? error : new Error(String(error)))
        setCredentialsLoaded(false) // Strictly fail-closed
      })

    return () => {
      isMounted = false
    }
  }, [form])

  // Save settings to storage
  const saveSettings = async (
    values: SettingsFormValues,
    expectedCredentialEpoch: number,
    expectedSettingsEpoch: number
  ) => {
    // Guard: Never save if we failed to load credentials (avoids overwriting with defaults)
    if (loadError) {
      throw new Error('Cannot save settings because credentials failed to load')
    }

    const normalizedAsr = normalizeAsrPreferenceValues({
      asrProvider: values.asrProvider,
      asrModel: values.asrModel,
    })

    const preferences: SettingsPreferenceValues = {
      ...normalizedAsr,
      pauseOnDictionaryLookup: values.pauseOnDictionaryLookup,
    }
    const credentials: SettingsCredentialValues = {
      asrKey: values.asrKey,
      translateKey: values.translateKey,
    }

    // Guard against race conditions during wipeAll
    if (expectedSettingsEpoch !== getSettingsWriteEpoch()) {
      throw new Error('Settings write aborted due to newer wipe action')
    }

    const settingsSaved = setJson(SETTINGS_STORAGE_KEY, preferences)
    if (!settingsSaved) {
      throw new Error('Failed to persist settings preferences')
    }

    await setCredentials(mapSettingsToCredentialRecord(credentials), expectedCredentialEpoch)
  }

  // Handle form submission (explicit save)
  const onSubmit = async () => {
    if (loadError) {
      toast.errorKey('settingsNotSaved')
      return
    }
    const expectedCredentialEpoch = getCredentialWriteEpoch()
    const expectedSettingsEpoch = getSettingsWriteEpoch()
    const isValid = await form.trigger()
    if (!isValid) return

    try {
      await saveSettings(form.getValues(), expectedCredentialEpoch, expectedSettingsEpoch)
    } catch (error) {
      if (!isAbortLikeError(error)) warn('[useSettingsForm] Failed to save settings:', error)
      toast.errorKey('settingsNotSaved')
    }
  }

  // Handle field blur - auto-save if valid
  const handleFieldBlur = async () => {
    if (loadError) return
    const expectedCredentialEpoch = getCredentialWriteEpoch()
    const expectedSettingsEpoch = getSettingsWriteEpoch()
    const isValid = await form.trigger()
    if (isValid) {
      try {
        await saveSettings(form.getValues(), expectedCredentialEpoch, expectedSettingsEpoch)
      } catch (error) {
        if (!isAbortLikeError(error)) warn('[useSettingsForm] Failed to auto-save settings:', error)
        toast.errorKey('settingsNotSaved')
      }
    }
  }

  // Handle ASR section blur - persist ASR preference changes without forcing full ASR completeness errors.
  const saveAsrDraftSettings = async (
    values: SettingsFormValues,
    expectedCredentialEpoch: number,
    expectedSettingsEpoch: number
  ) => {
    if (loadError) {
      throw new Error('Cannot save settings because credentials failed to load')
    }

    const normalizedAsr = normalizeAsrPreferenceValues({
      asrProvider: values.asrProvider,
      asrModel: values.asrModel,
    })
    const currentSnapshot = getSettingsSnapshot()
    const asrScopedPreferences: SettingsPreferenceValues = {
      ...currentSnapshot,
      ...normalizedAsr,
    }

    if (expectedSettingsEpoch !== getSettingsWriteEpoch()) {
      throw new Error('Settings write aborted due to newer wipe action')
    }

    const settingsSaved = setJson(SETTINGS_STORAGE_KEY, asrScopedPreferences)
    if (!settingsSaved) {
      throw new Error('Failed to persist settings preferences')
    }

    await setCredentials(
      {
        [ASR_CREDENTIAL_KEY]: values.asrKey,
      },
      expectedCredentialEpoch
    )
  }

  const handleAsrFieldBlur = async () => {
    if (loadError) return
    const expectedCredentialEpoch = getCredentialWriteEpoch()
    const expectedSettingsEpoch = getSettingsWriteEpoch()
    try {
      await saveAsrDraftSettings(form.getValues(), expectedCredentialEpoch, expectedSettingsEpoch)
    } catch (error) {
      if (!isAbortLikeError(error))
        warn('[useSettingsForm] Failed to auto-save ASR settings:', error)
      toast.errorKey('settingsNotSaved')
    }
  }

  return {
    credentialsLoaded,
    loadError,
    form,
    onSubmit,
    handleFieldBlur,
    handleAsrFieldBlur,
  }
}
