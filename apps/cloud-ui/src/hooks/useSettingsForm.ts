// src/hooks/useSettingsForm.ts
// Hook for managing settings form state with react-hook-form and persistence

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { CredentialsRepository } from '../lib/repositories/CredentialsRepository'

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
    asrKey: credentials[CredentialsRepository.ASR_CREDENTIAL_KEY] ?? '',
    translateKey: credentials[CredentialsRepository.TRANSLATE_CREDENTIAL_KEY] ?? '',
  }
}

function mapSettingsToCredentialRecord(values: SettingsCredentialValues): Record<string, string> {
  return {
    [CredentialsRepository.ASR_CREDENTIAL_KEY]: values.asrKey,
    [CredentialsRepository.TRANSLATE_CREDENTIAL_KEY]: values.translateKey,
  }
}

type SettingsSaveEpochs = {
  expectedCredentialEpoch: number
  expectedSettingsEpoch: number
}

type SettingsSavePayload = {
  preferences: SettingsPreferenceValues
  credentials: Record<string, string>
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

    void CredentialsRepository.getAll()
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

  const captureSaveEpochs = (): SettingsSaveEpochs => ({
    expectedCredentialEpoch: CredentialsRepository.getWriteEpoch(),
    expectedSettingsEpoch: getSettingsWriteEpoch(),
  })

  const persistSettingsPayload = async (
    payload: SettingsSavePayload,
    epochs: SettingsSaveEpochs
  ): Promise<void> => {
    // Guard: Never save if we failed to load credentials (avoids overwriting with defaults)
    if (loadError) {
      throw new Error('Cannot save settings because credentials failed to load')
    }

    // Guard against race conditions during wipeAll
    if (epochs.expectedSettingsEpoch !== getSettingsWriteEpoch()) {
      throw new Error('Settings write aborted due to newer wipe action')
    }

    const settingsSaved = setJson(SETTINGS_STORAGE_KEY, payload.preferences)
    if (!settingsSaved) {
      throw new Error('Failed to persist settings preferences')
    }

    await CredentialsRepository.setMany(payload.credentials, epochs.expectedCredentialEpoch)
  }

  const saveSettings = async (values: SettingsFormValues, epochs: SettingsSaveEpochs) => {
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

    await persistSettingsPayload(
      {
        preferences,
        credentials: mapSettingsToCredentialRecord(credentials),
      },
      epochs
    )
  }

  // Handle ASR section blur - persist ASR preference changes without forcing full ASR completeness errors.
  const saveAsrDraftSettings = async (values: SettingsFormValues, epochs: SettingsSaveEpochs) => {
    const normalizedAsr = normalizeAsrPreferenceValues({
      asrProvider: values.asrProvider,
      asrModel: values.asrModel,
    })
    const currentSnapshot = getSettingsSnapshot()
    const asrScopedPreferences: SettingsPreferenceValues = {
      ...currentSnapshot,
      ...normalizedAsr,
    }

    await persistSettingsPayload(
      {
        preferences: asrScopedPreferences,
        credentials: {
          [CredentialsRepository.ASR_CREDENTIAL_KEY]: values.asrKey,
        },
      },
      epochs
    )
  }

  const runSaveAction = async (
    saveAction: () => Promise<void>,
    warningMessage: string,
    options?: { skipWhenLoadError?: boolean }
  ) => {
    if (loadError) {
      if (options?.skipWhenLoadError) return
      toast.errorKey('settingsNotSaved')
      return
    }

    try {
      await saveAction()
    } catch (error) {
      if (!isAbortLikeError(error)) warn(warningMessage, error)
      toast.errorKey('settingsNotSaved')
    }
  }

  // Handle form submission (explicit save)
  const onSubmit = async () => {
    if (loadError) {
      toast.errorKey('settingsNotSaved')
      return
    }

    const epochs = captureSaveEpochs()
    const isValid = await form.trigger()
    if (!isValid) return

    await runSaveAction(
      () => saveSettings(form.getValues(), epochs),
      '[useSettingsForm] Failed to save settings:'
    )
  }

  // Handle field blur - auto-save if valid
  const handleFieldBlur = async () => {
    if (loadError) return

    const epochs = captureSaveEpochs()
    const isValid = await form.trigger()
    if (isValid) {
      await runSaveAction(
        () => saveSettings(form.getValues(), epochs),
        '[useSettingsForm] Failed to auto-save settings:',
        { skipWhenLoadError: true }
      )
    }
  }

  const handleAsrFieldBlur = async () => {
    const epochs = captureSaveEpochs()
    await runSaveAction(
      () => saveAsrDraftSettings(form.getValues(), epochs),
      '[useSettingsForm] Failed to auto-save ASR settings:',
      {
        skipWhenLoadError: true,
      }
    )
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
