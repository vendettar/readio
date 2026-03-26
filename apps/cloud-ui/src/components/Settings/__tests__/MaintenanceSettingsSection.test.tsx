import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MaintenanceSettingsSection } from '../sections/MaintenanceSettingsSection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

describe('MaintenanceSettingsSection', () => {
  it('renders idle and running button states', () => {
    const onRunNow = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <MaintenanceSettingsSection
        isRunning={false}
        lastReport={null}
        onRunNow={onRunNow}
        language="en"
      />
    )

    const idleButton = screen.getByRole('button', { name: 'settings.maintenanceRunNow' })
    expect((idleButton as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(idleButton)
    expect(onRunNow).toHaveBeenCalledTimes(1)

    rerender(
      <MaintenanceSettingsSection
        isRunning={true}
        lastReport={null}
        onRunNow={onRunNow}
        language="en"
      />
    )

    const runningButton = screen.getByRole('button', { name: 'settings.maintenanceRunning' })
    expect((runningButton as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders report metadata after a run', () => {
    render(
      <MaintenanceSettingsSection
        isRunning={false}
        lastReport={{
          checkedAt: Date.UTC(2025, 0, 1, 0, 0, 0),
          missingAudioBlob: 1,
          danglingFolderRef: 0,
          danglingTrackRef: 1,
          totalRepairs: 2,
        }}
        onRunNow={vi.fn().mockResolvedValue(undefined)}
        language="en"
      />
    )

    expect(screen.getByText('settings.maintenanceLastChecked:')).toBeTruthy()
    expect(screen.getByText('settings.maintenanceRepairs:')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
  })
})
