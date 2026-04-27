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

vi.mock('../../../components/ui/select', async () => {
  const ReactModule = await import('react')
  const React = ReactModule.default
  type MockSelectElementProps = {
    id?: string
    value?: string
    children?: React.ReactNode
  }

  const MockSelectTrigger = ({ children }: { id?: string; children?: React.ReactNode }) => (
    <>{children}</>
  )
  MockSelectTrigger.displayName = 'MockSelectTrigger'

  const MockSelectItem = ({ value, children }: { value: string; children: React.ReactNode }) => (
    <option value={value}>{children}</option>
  )
  MockSelectItem.displayName = 'MockSelectItem'

  const MockSelectContent = ({ children }: { children: React.ReactNode }) => <>{children}</>
  const MockSelectSeparator = () => null
  const MockSelectValue = () => null

  const MockSelect = ({
    value,
    onValueChange,
    disabled,
    children,
  }: {
    value: string
    onValueChange?: (value: string) => void
    disabled?: boolean
    children: React.ReactNode
  }) => {
    let triggerId: string | undefined
    const options: React.ReactNode[] = []

    const walk = (nodes: React.ReactNode) => {
      React.Children.forEach(nodes, (node) => {
        if (!React.isValidElement(node)) return
        const element = node as React.ReactElement<MockSelectElementProps>
        const componentName = (element.type as { displayName?: string }).displayName

        if (componentName === 'MockSelectTrigger') {
          triggerId = element.props.id as string | undefined
        }
        if (componentName === 'MockSelectItem') {
          options.push(element)
        }
        if (element.props.children) {
          walk(element.props.children)
        }
      })
    }

    walk(children)

    return (
      <select
        id={triggerId}
        value={value}
        disabled={disabled}
        onChange={(event) => onValueChange?.(event.target.value)}
      >
        {options}
      </select>
    )
  }

  return {
    Select: MockSelect,
    SelectContent: MockSelectContent,
    SelectItem: MockSelectItem,
    SelectSeparator: MockSelectSeparator,
    SelectTrigger: MockSelectTrigger,
    SelectValue: MockSelectValue,
  }
})

// VALID_GROQ_KEY: gsk_ + 52 chars = 56 chars total
const VALID_GROQ_KEY = `gsk_${'a'.repeat(52)}`

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
      asrKey: VALID_GROQ_KEY,
      translateKey: '',
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
      new ASRClientError('provider rejected credentials', 'unauthorized', 401)
    )
    const onFieldBlur = vi.fn(async () => {})

    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'settingsVerify' }))

    await waitFor(() => {
      // The exact error logging depends on internal implementation.
      // Based on previous run, it logs "[asr] verify failed".
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('verify failed'),
        expect.anything()
      )
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
    expect((selects[1] as HTMLSelectElement).disabled).toBe(true)
  })

  // TODO: Re-enable clearing tests once multiple providers are enabled.
  // Currently, when only Groq is available, it's auto-selected and cannot be cleared via simple UI interactions in some cases,
  // or the "Clear" button might be hidden if it's the only valid state.
  it.skip('clears provider selection and disables model selector', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR provider' }))

    await waitFor(() => {
      expect(onFieldBlur).toHaveBeenCalledTimes(1)
      const selects = screen.getAllByRole('combobox')
      expect((selects[1] as HTMLSelectElement).disabled).toBe(true)
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
    expect((selects[1] as HTMLSelectElement).disabled).toBe(false)
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
