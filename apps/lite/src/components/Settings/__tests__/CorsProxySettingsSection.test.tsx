import { render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import type { SettingsFormValues } from '@/lib/schemas/settings'
import { CorsProxySettingsSection } from '../sections/CorsProxySettingsSection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

function Harness({ defaults }: { defaults?: Partial<SettingsFormValues> }) {
  const form = useForm<SettingsFormValues>({
    defaultValues: {
      proxyUrl: 'https://proxy.example.com',
      proxyAuthHeader: 'x-proxy-token',
      proxyAuthValue: '',
      asrProvider: '',
      asrModel: '',
      asrUseCustomModel: false,
      asrCustomModelId: '',
      asrKey: '',
      translateKey: '',
      ...defaults,
    },
  })

  return <CorsProxySettingsSection form={form} onFieldBlur={vi.fn(async () => {})} />
}

describe('CorsProxySettingsSection', () => {
  it('disables show/hide toggle when proxy auth value is empty', () => {
    render(<Harness defaults={{ proxyAuthValue: '' }} />)

    const input = screen.getByPlaceholderText('proxyAuthValuePlaceholder')
    const toggleButton = input.parentElement?.querySelector('button') as HTMLButtonElement | null
    expect(toggleButton).not.toBeNull()
    expect(toggleButton?.disabled).toBe(true)
  })

  it('enables show/hide toggle when proxy auth value is present', () => {
    render(<Harness defaults={{ proxyAuthValue: 'secret-token' }} />)

    const input = screen.getByPlaceholderText('proxyAuthValuePlaceholder')
    const toggleButton = input.parentElement?.querySelector('button') as HTMLButtonElement | null
    expect(toggleButton).not.toBeNull()
    expect(toggleButton?.disabled).toBe(false)
  })
})
