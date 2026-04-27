import { fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsPage, { formatExportDateSuffix } from '../SettingsPage'

// Mock ResizeObserver for UI components
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
    i18n: { resolvedLanguage: 'en', language: 'en', changeLanguage: vi.fn() },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../components/ui/select', async () => {
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

  const MockSelectValue = () => null

  const MockSelect = ({
    value,
    onValueChange,
    children,
  }: {
    value: string
    onValueChange?: (value: string) => void
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
    SelectTrigger: MockSelectTrigger,
    SelectValue: MockSelectValue,
  }
})

vi.mock('../../hooks/useSettingsData', () => ({
  useSettingsData: () => ({
    sessions: [],
    isLoading: false,
    reload: vi.fn(),
  }),
}))

vi.mock('../../hooks/useSettingsForm', () => ({
  useSettingsForm: () => ({
    credentialsLoaded: true,
    form: {
      control: {},
      handleSubmit: () => () => {},
      formState: { errors: {} },
      watch: vi.fn(),
      getValues: vi.fn(),
      setValue: vi.fn(),
      register: vi.fn(),
    },
    onSubmit: vi.fn(),
    handleFieldBlur: vi.fn(),
    handleAsrFieldBlur: vi.fn(),
  }),
}))

vi.mock('../../components/ui/form', () => ({
  Form: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormField: ({
    render,
  }: {
    render: (props: { field: Record<string, unknown> }) => React.ReactNode
  }) =>
    render({
      field: { value: '', onChange: vi.fn(), onBlur: vi.fn(), ref: vi.fn() },
    }),
  FormItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormControl: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  FormMessage: () => null,
}))

vi.mock('../../components/Settings/sections/AsrSettingsSection', () => ({
  AsrSettingsSection: () => <div data-testid="asr-settings-section" />,
}))

vi.mock('../../components/Settings/sections/CorsProxySettingsSection', () => ({
  CorsProxySettingsSection: () => <div data-testid="cors-proxy-settings-section" />,
}))

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock('../../hooks/useIntegrityMaintenance', () => ({
  useIntegrityMaintenance: () => ({
    isRunning: false,
    lastReport: null,
    runNow: vi.fn(),
  }),
}))

vi.mock('../../hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({
    state: { isOpen: false },
    openConfirm: vi.fn(),
  }),
}))

vi.mock('../../store/themeStore', () => ({
  ACCENT_OPTIONS: [],
  useThemeStore: (selector: (state: { accent: string; setAccent: () => void }) => unknown) =>
    selector({ accent: 'default', setAccent: vi.fn() }),
}))

const setCountryMock = vi.fn()

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      country: 'us',
      setCountry: setCountryMock,
    }),
}))

vi.mock('../../lib/vault', () => ({
  exportVault: vi.fn(async () => ({ subscriptions: [], favorites: [], sessions: [] })),
  importVault: vi.fn(async () => {}),
}))

vi.mock('../../lib/i18n', () => ({
  changeLanguageSafely: vi.fn(),
}))

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('updates content region via store action', () => {
    render(<SettingsPage />)

    fireEvent.change(screen.getByLabelText('settingsContentRegion'), { target: { value: 'jp' } })
    expect(setCountryMock).toHaveBeenCalledWith('jp')
  })

  it('does not render temporarily disabled storage overview block', () => {
    render(<SettingsPage />)
    expect(screen.queryByText('settingsStorageOverview')).toBeNull()
    expect(screen.queryByRole('button', { name: 'storageQuotaWipe' })).toBeNull()
  })

  it('does not render temporarily disabled maintenance and diagnostics blocks', () => {
    render(<SettingsPage />)
    expect(screen.queryByRole('button', { name: 'settings.maintenanceRunNow' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'settings.downloadLogs' })).toBeNull()
  })

  it('does not render temporarily disabled settings blocks', () => {
    render(<SettingsPage />)

    expect(screen.queryByRole('button', { name: 'settingsExportOpml' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'settingsExportVault' })).toBeNull()
    expect(screen.queryByText('settingsAiServices')).toBeNull()
    expect(screen.queryByText('settingsDictionary')).toBeNull()
  })

  it('keeps settings sections aligned while removing the Network proxy block', () => {
    render(<SettingsPage />)

    expect(screen.getByTestId('asr-settings-section')).not.toBeNull()
    expect(screen.queryByTestId('cors-proxy-settings-section')).toBeNull()
  })

  it('formats export date suffix deterministically for explicit timezones', () => {
    const fixedInstant = new Date('2026-03-05T00:30:00Z')
    const cases = [
      { timeZone: 'UTC', expectedDate: '2026-03-05' },
      { timeZone: 'Asia/Shanghai', expectedDate: '2026-03-05' },
      { timeZone: 'America/Los_Angeles', expectedDate: '2026-03-04' },
    ] as const

    for (const { timeZone, expectedDate } of cases) {
      expect(formatExportDateSuffix(fixedInstant, timeZone)).toBe(expectedDate)
    }
  })
})
