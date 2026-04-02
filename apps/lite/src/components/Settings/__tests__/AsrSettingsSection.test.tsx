import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ASRClientError } from '@/lib/asr'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { AsrSettingsSection } from '../sections/AsrSettingsSection'

if (!HTMLElement.prototype.hasPointerCapture) {
  HTMLElement.prototype.hasPointerCapture = () => false
}

const { verifyAsrKeyMock } = vi.hoisted(() => ({
  verifyAsrKeyMock: vi.fn(),
}))

vi.mock('@/lib/asr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/asr')>()
  return {
    ...actual,
    verifyAsrKey: (...args: unknown[]) => verifyAsrKeyMock(...args),
  }
})

vi.mock('@/lib/toast', () => ({
  toast: {
    successKey: vi.fn(),
    errorKey: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

// VALID_GROQ_KEY: gsk_ + 52 chars = 56 chars total
const VALID_GROQ_KEY = `gsk_${'k'.repeat(52)}`

function Harness({
  onFieldBlur,
  defaults,
}: {
  onFieldBlur: () => Promise<void>
  defaults?: Partial<SettingsFormValues>
}) {
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',

      // HARDCODE to ensure it is always valid for Groq tests
      asrKey: VALID_GROQ_KEY,
      translateKey: '',
      proxyUrl: '',
      proxyAuthHeader: '',
      proxyAuthValue: '',
      ...defaults,
    },
  })

  return <AsrSettingsSection form={form} onFieldBlur={onFieldBlur} />
}

describe('AsrSettingsSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('verifies API key from form values', async () => {
    verifyAsrKeyMock.mockResolvedValue(true)
    const onFieldBlur = vi.fn(async () => {})

    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'settingsVerify' }))

    await waitFor(() => {
      expect(verifyAsrKeyMock).toHaveBeenCalledWith({ apiKey: VALID_GROQ_KEY, provider: 'groq' })
    })
  })

  it('logs verify errors to console without surfacing provider message in the form', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    verifyAsrKeyMock.mockRejectedValue(
      new ASRClientError('provider rejected credentials', 'client_error', 500)
    )
    const onFieldBlur = vi.fn(async () => {})

    // We MUST use VALID_GROQ_KEY here. Harness now has it by default.
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'settingsVerify' }))

    await waitFor(() => {
      // Expect log from handleVerify catch block
      expect(consoleErrorSpy).toHaveBeenCalled()
    })
    expect(screen.queryByText('provider rejected credentials')).toBeNull()
  })

  it('disables model selector when provider is empty', () => {
    const onFieldBlur = vi.fn(async () => {})
    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrProvider: '',
          asrModel: '',
        }}
      />
    )

    const selects = screen.getAllByRole('combobox')
    // Model select is the second one
    expect((selects[1] as HTMLButtonElement).disabled).toBe(true)
  })

  // TODO: Re-enable clearing tests once multiple providers are enabled.
  it.skip('clears provider selection and disables model selector', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR provider' }))

    await waitFor(() => {
      expect(onFieldBlur).toHaveBeenCalledTimes(1)
      const selects = screen.getAllByRole('combobox')
      expect((selects[1] as HTMLButtonElement).disabled).toBe(true)
    })
  })

  it.skip('hides pricing link after clearing provider selection', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR provider' }))

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'settingsAsrPricingLink' })).toBeNull()
    })
  })

  it('clears model selection without clearing provider', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR model' }))

    await waitFor(() => {
      expect(onFieldBlur).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('button', { name: 'Clear ASR model' })).toBeNull()
    const selects = screen.getAllByRole('combobox')
    expect((selects[1] as HTMLButtonElement).disabled).toBe(false)
  })

  it('blocks verify request when provider/model pair is invalid', async () => {
    verifyAsrKeyMock.mockResolvedValue(true)
    const onFieldBlur = vi.fn(async () => {})

    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrProvider: 'groq',
          asrModel: 'qwen3-asr-flash',
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'settingsVerify' }))

    await waitFor(() => {
      expect(verifyAsrKeyMock).not.toHaveBeenCalled()
    })
  })

  it('blocks verify request when ASR is disabled', async () => {
    verifyAsrKeyMock.mockResolvedValue(true)
    const onFieldBlur = vi.fn(async () => {})

    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrProvider: '',
          asrModel: '',
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'settingsVerify' }))

    await waitFor(() => {
      expect(verifyAsrKeyMock).not.toHaveBeenCalled()
    })
  })

  it('hides pricing link when provider is not selected', () => {
    const onFieldBlur = vi.fn(async () => {})
    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrProvider: '',
          asrModel: '',
        }}
      />
    )

    expect(screen.queryByRole('link', { name: 'settingsAsrPricingLink' })).toBeNull()
  })

  it('disables show/hide toggle when API key is empty', () => {
    const onFieldBlur = vi.fn(async () => {})
    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrKey: '',
        }}
      />
    )

    expect(
      (screen.getByRole('button', { name: 'settingsShowHideApiKey' }) as HTMLButtonElement).disabled
    ).toBe(true)
    expect(
      (screen.getByRole('button', { name: 'settingsVerify' }) as HTMLButtonElement).disabled
    ).toBe(true)
  })
})
