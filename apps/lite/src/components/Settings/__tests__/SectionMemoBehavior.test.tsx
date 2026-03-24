import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DiagnosticsSettingsSection } from '../sections/DiagnosticsSettingsSection'

const settingsSectionCardRenderSpy = vi.fn()

vi.mock('../SettingsSectionCard', () => ({
  SettingsSectionCard: ({ children }: { children: ReactNode }) => {
    settingsSectionCardRenderSpy()
    return <div>{children}</div>
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

function Harness() {
  const [unrelatedSettingVersion, setUnrelatedSettingVersion] = useState(0)
  const onDownloadLogs = useCallback(() => {}, [])

  return (
    <div>
      <button type="button" onClick={() => setUnrelatedSettingVersion((v) => v + 1)}>
        bump-unrelated-setting
      </button>
      <span>{unrelatedSettingVersion}</span>
      <DiagnosticsSettingsSection onDownloadLogs={onDownloadLogs} />
    </div>
  )
}

describe('Settings section memo boundaries', () => {
  it('does not re-render unchanged diagnostics section on unrelated setting updates', () => {
    settingsSectionCardRenderSpy.mockClear()
    render(<Harness />)

    expect(settingsSectionCardRenderSpy).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: 'bump-unrelated-setting' }))
    expect(screen.getByText('1')).toBeTruthy()

    expect(settingsSectionCardRenderSpy).toHaveBeenCalledTimes(1)
  })
})
