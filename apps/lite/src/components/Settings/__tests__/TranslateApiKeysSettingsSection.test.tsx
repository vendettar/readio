import { fireEvent, render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { TranslateApiKeysSettingsSection } from '../sections/TranslateApiKeysSettingsSection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

function Harness({
  onSubmit,
  onFieldBlur,
}: {
  onSubmit: () => void | Promise<void>
  onFieldBlur: () => Promise<void>
}) {
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      translateKey: 'sk-test-key',
    },
  })

  return (
    <TranslateApiKeysSettingsSection form={form} onSubmit={onSubmit} onFieldBlur={onFieldBlur} />
  )
}

describe('TranslateApiKeysSettingsSection', () => {
  it('renders OpenAI key field with current value', () => {
    const onSubmit = vi.fn()
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onSubmit={onSubmit} onFieldBlur={onFieldBlur} />)

    const input = screen.getByPlaceholderText('placeholderApiKey') as HTMLInputElement
    expect(input.value).toBe('sk-test-key')
  })

  it('triggers blur-save callback on input blur', async () => {
    const onSubmit = vi.fn()
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onSubmit={onSubmit} onFieldBlur={onFieldBlur} />)

    const input = screen.getByPlaceholderText('placeholderApiKey')
    fireEvent.blur(input)

    expect(onFieldBlur).toHaveBeenCalled()
  })

  it('triggers onSubmit when form is submitted', () => {
    const onSubmit = vi.fn()
    const onFieldBlur = vi.fn(async () => {})
    render(<Harness onSubmit={onSubmit} onFieldBlur={onFieldBlur} />)

    const input = screen.getByPlaceholderText('placeholderApiKey')
    fireEvent.submit(input)

    expect(onSubmit).toHaveBeenCalled()
  })
})
