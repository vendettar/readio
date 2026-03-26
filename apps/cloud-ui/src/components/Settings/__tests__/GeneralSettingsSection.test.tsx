import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { GeneralSettingsSection } from '../sections/GeneralSettingsSection'

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

describe('GeneralSettingsSection', () => {
  it('routes language and country selections to callbacks', () => {
    const onLanguageChange = vi.fn()
    const onCountryChange = vi.fn()

    render(
      <GeneralSettingsSection
        language="en"
        languages={{ en: 'English', zh: '简体中文' }}
        country="us"
        supportedRegions={['us', 'cn']}
        onLanguageChange={onLanguageChange}
        onCountryChange={onCountryChange}
      />
    )

    fireEvent.change(screen.getByLabelText('ariaLanguage'), { target: { value: 'zh' } })
    fireEvent.change(screen.getByLabelText('settingsContentRegion'), { target: { value: 'cn' } })

    expect(onLanguageChange).toHaveBeenCalledWith('zh')
    expect(onCountryChange).toHaveBeenCalledWith('cn')
  })
})
