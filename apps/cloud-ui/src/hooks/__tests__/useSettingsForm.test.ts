import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SETTINGS_STORAGE_KEY } from '../../lib/schemas/settings'
import { useSettingsForm } from '../useSettingsForm'

const {
  getAllCredentialsMock,
  setCredentialsMock,
  logErrorMock,
  toastErrorKeyMock,
  getSettingsWriteEpochMock,
} = vi.hoisted(() => ({
  getAllCredentialsMock: vi.fn(),
  setCredentialsMock: vi.fn(),
  logErrorMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
  getSettingsWriteEpochMock: vi.fn().mockReturnValue(0),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en', resolvedLanguage: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../lib/db/credentialsRepository', () => ({
  TRANSLATE_CREDENTIAL_KEY: 'provider_translate_key',
  ASR_CREDENTIAL_KEY: 'provider_asr_key',
  getCredentialWriteEpoch: () => 0,
  getAllCredentials: () => getAllCredentialsMock(),
  setCredentials: (entries: Record<string, string>, expectedEpoch?: number) =>
    setCredentialsMock(entries, expectedEpoch),
}))

vi.mock('../../lib/schemas/settings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/schemas/settings')>()
  return {
    ...actual,
    getSettingsWriteEpoch: () => getSettingsWriteEpochMock(),
  }
})

vi.mock('../../lib/logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    errorKey: (...args: unknown[]) => toastErrorKeyMock(...args),
  },
}))

// VALID_GROQ_KEY: gsk_ + 52 chars = 56 chars total
const VALID_GROQ_KEY = `gsk_${'s'.repeat(52)}`

describe('useSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    getAllCredentialsMock.mockResolvedValue({})
    setCredentialsMock.mockResolvedValue(undefined)
    getSettingsWriteEpochMock.mockReturnValue(10) // Use non-zero for real testing
  })

  it('hydrates preferences from localStorage and credentials from repository', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        asrProvider: 'groq',
        asrModel: 'whisper-large-v3-turbo',
        proxyUrl: 'https://proxy.local',
      })
    )
    getAllCredentialsMock.mockResolvedValue({
      provider_translate_key: 'sk-hydrated',
      provider_asr_key: VALID_GROQ_KEY,
    })

    const { result } = renderHook(() => useSettingsForm())

    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    expect(result.current.form.getValues()).toMatchObject({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3-turbo',
      proxyUrl: 'https://proxy.local',
      translateKey: 'sk-hydrated',
      asrKey: VALID_GROQ_KEY,
    })
  })

  it('saves preferences and credentials through split storage paths with epoch guards', async () => {
    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    act(() => {
      result.current.form.setValue('proxyUrl', 'https://save.local')
      result.current.form.setValue('translateKey', 'sk-save')
      result.current.form.setValue('asrKey', VALID_GROQ_KEY)
    })

    await act(async () => {
      await result.current.onSubmit()
    })

    expect(setCredentialsMock).toHaveBeenCalledWith(
      {
        provider_translate_key: 'sk-save',
        provider_asr_key: VALID_GROQ_KEY,
      },
      0 // Credential epoch from mock
    )

    // TODO: When non-Groq providers are lifted, asrProvider/asrModel might become empty strings if not selected.
    // Currently they are auto-selected to Groq because it is the only enabled provider.
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({
        asrProvider: 'groq',
        asrModel: 'whisper-large-v3-turbo',

        proxyUrl: 'https://save.local',
        proxyAuthHeader: 'x-proxy-token',
        proxyAuthValue: '',
        pauseOnDictionaryLookup: true,
      })
    )
  })

  it('normalizes invalid stored provider/model pair on load', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        asrProvider: 'groq',
        asrModel: 'qwen3-asr-flash',
      })
    )

    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    expect(result.current.form.getValues('asrProvider')).toBe('groq')
    expect(result.current.form.getValues('asrModel')).toBe('')
  })

  it('aborts save if settings epoch has changed (wipeAll happened during edit)', async () => {
    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    // Simulate wipeAll bumping the epoch:
    // Capture in onSubmit will get 10, check in saveSettings will get 11.
    getSettingsWriteEpochMock.mockReturnValueOnce(10).mockReturnValue(11)

    await act(async () => {
      await result.current.onSubmit()
    })

    expect(logErrorMock).toHaveBeenCalledWith(
      '[useSettingsForm] Failed to save settings:',
      expect.objectContaining({ message: 'Settings write aborted due to newer wipe action' })
    )
    expect(toastErrorKeyMock).toHaveBeenCalledWith('settingsNotSaved')
  })

  it('persists ASR provider-only draft on ASR blur without forcing model-required validation', async () => {
    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    act(() => {
      result.current.form.setValue('asrProvider', 'groq')
      result.current.form.setValue('asrModel', '')
    })

    await act(async () => {
      await result.current.handleAsrFieldBlur()
    })

    expect(result.current.form.getFieldState('asrModel').error).toBeUndefined()
    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({
        asrProvider: 'groq',
        asrModel: '',

        proxyUrl: '',
        proxyAuthHeader: 'x-proxy-token',
        proxyAuthValue: '',
        pauseOnDictionaryLookup: true,
      })
    )
  })

  it('keeps full blur validation for model-required when ASR provider is selected', async () => {
    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    act(() => {
      result.current.form.setValue('asrProvider', 'groq')
      result.current.form.setValue('asrModel', '')
    })

    await act(async () => {
      await result.current.handleFieldBlur()
    })

    expect(setCredentialsMock).not.toHaveBeenCalled()
    expect(result.current.form.getFieldState('asrModel').error).toBeDefined()
  })

  it('does not persist invalid non-ASR fields when ASR blur auto-saves draft', async () => {
    localStorage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        asrProvider: '',
        asrModel: '',

        proxyUrl: 'https://persisted.proxy',
        proxyAuthHeader: 'x-proxy-token',
        proxyAuthValue: 'persisted-secret',
      })
    )
    getAllCredentialsMock.mockResolvedValue({
      provider_translate_key: 'sk_translate_existing',
      provider_asr_key: VALID_GROQ_KEY,
    })

    const { result } = renderHook(() => useSettingsForm())
    await waitFor(() => {
      expect(result.current.credentialsLoaded).toBe(true)
    })

    act(() => {
      result.current.form.setValue('asrProvider', 'groq')
      result.current.form.setValue('asrModel', 'whisper-large-v3')

      result.current.form.setValue('asrKey', VALID_GROQ_KEY)
      result.current.form.setValue('proxyUrl', 'not-a-url')
      result.current.form.setValue('translateKey', 'invalid-translate-key')
    })

    await act(async () => {
      await result.current.handleAsrFieldBlur()
    })

    expect(localStorage.getItem(SETTINGS_STORAGE_KEY)).toBe(
      JSON.stringify({
        asrProvider: 'groq',
        asrModel: 'whisper-large-v3',

        proxyUrl: 'https://persisted.proxy',
        proxyAuthHeader: 'x-proxy-token',
        proxyAuthValue: 'persisted-secret',
        pauseOnDictionaryLookup: true,
      })
    )
    expect(setCredentialsMock).toHaveBeenLastCalledWith(
      {
        provider_asr_key: VALID_GROQ_KEY,
      },
      0
    )
  })

  it('strictly fails when credential load fails (fail-closed)', async () => {
    getAllCredentialsMock.mockRejectedValue(new Error('IndexedDB blocked'))

    const { result } = renderHook(() => useSettingsForm())

    await waitFor(() => {
      expect(result.current.loadError).not.toBeNull()
    })

    expect(result.current.credentialsLoaded).toBe(false)
    expect(logErrorMock).toHaveBeenCalledWith(
      '[useSettingsForm] Failed to load credentials:',
      expect.any(Error)
    )

    // Verify onSubmit is blocked
    await act(async () => {
      await result.current.onSubmit()
    })
    expect(toastErrorKeyMock).toHaveBeenCalledWith('settingsNotSaved')
    expect(setCredentialsMock).not.toHaveBeenCalled()
  })
})
