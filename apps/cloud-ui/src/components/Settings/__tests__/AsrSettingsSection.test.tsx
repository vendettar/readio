import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

        // biome-ignore lint/suspicious/noExplicitAny: test helper traverses generic element props
        const element = node as React.ReactElement<any>
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
      asrUseCustomModel: false,
      asrCustomModelId: '',
      asrKey: 'gsk_test',
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
      expect(verifyAsrKeyMock).toHaveBeenCalledWith({ apiKey: 'gsk_test', provider: 'groq' })
    })
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

  it('clears provider selection and disables model selector', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR provider' }))

    await waitFor(() => {
      expect(onFieldBlur).toHaveBeenCalledTimes(1)
      const selects = screen.getAllByRole('combobox')
      expect((selects[1] as HTMLSelectElement).disabled).toBe(true)
    })
  })

  it('clears custom model mode when provider selection is cleared', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(
      <Harness
        onFieldBlur={onFieldBlur}
        defaults={{
          asrProvider: 'groq',
          asrModel: '',
          asrUseCustomModel: true,
          asrCustomModelId: 'custom-model-id',
        }}
      />
    )

    expect(screen.getByPlaceholderText('settingsAsrCustomModelPlaceholder')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear ASR provider' }))

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('settingsAsrCustomModelPlaceholder')).toBeNull()
    })
  })

  it('hides pricing link after clearing provider selection', async () => {
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

  it('shows custom model input when custom model option is selected', async () => {
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onFieldBlur={onFieldBlur} />)

    fireEvent.change(screen.getAllByRole('combobox')[1], {
      target: { value: '__custom_model__' },
    })

    await waitFor(() => {
      expect(screen.getByPlaceholderText('settingsAsrCustomModelPlaceholder')).toBeTruthy()
    })
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
          asrUseCustomModel: false,
          asrCustomModelId: '',
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
