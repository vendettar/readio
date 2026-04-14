import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MigrationSettingsSection } from '../sections/MigrationSettingsSection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

describe('MigrationSettingsSection', () => {
  it('wires import/export actions and file change handler', () => {
    const onImport = vi.fn()
    const onExport = vi.fn()
    const onFileChange = vi.fn(async () => {})

    const { container } = render(
      <MigrationSettingsSection
        fileInputRef={{ current: null }}
        onFileChange={onFileChange}
        onImport={onImport}
        onExport={onExport}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'settingsImportOpml' }))
    fireEvent.click(screen.getByRole('button', { name: 'settingsExportOpml' }))

    const input = container.querySelector('input[type="file"]')
    expect(input).toBeTruthy()

    fireEvent.change(input as HTMLInputElement, {
      target: { files: [new File(['x'], 'test.opml', { type: 'text/xml' })] },
    })

    expect(onImport).toHaveBeenCalledTimes(1)
    expect(onExport).toHaveBeenCalledTimes(1)
    expect(onFileChange).toHaveBeenCalledTimes(1)
  })
})
