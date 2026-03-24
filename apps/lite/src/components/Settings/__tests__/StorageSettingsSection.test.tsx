import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PlaybackSession } from '@/lib/db/types'
import { StorageSettingsSection } from '../sections/StorageSettingsSection'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

const baseSession: PlaybackSession = {
  id: 's1',
  source: 'explore',
  title: 'Episode One',
  createdAt: 1,
  lastPlayedAt: 2,
  sizeBytes: 1024,
  durationSeconds: 120,
  audioId: 'audio-1',
  subtitleId: null,
  hasAudioBlob: true,
  progress: 10,
  audioFilename: 'episode.mp3',
  subtitleFilename: '',
}

describe('StorageSettingsSection', () => {
  it('renders wipe cache disabled when quota info unavailable', () => {
    render(
      <StorageSettingsSection
        storageInfo={{ indexedDB: { totalSize: 0 }, browser: null }}
        sessions={[]}
        language="en"
        isClearing={false}
        onWipeCache={vi.fn()}
        onClearAllStorage={vi.fn()}
        onClearItemCache={vi.fn()}
        onDeleteItem={vi.fn()}
      />
    )

    const wipeButton = screen.getByRole('button', { name: 'storageQuotaWipe' })
    expect((wipeButton as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('settingsLiteDataNoticeTitle')).toBeTruthy()
  })

  it('wires session action callbacks', () => {
    const onWipeCache = vi.fn()
    const onClearAllStorage = vi.fn()
    const onClearItemCache = vi.fn()
    const onDeleteItem = vi.fn()

    const { container } = render(
      <StorageSettingsSection
        storageInfo={{
          indexedDB: { totalSize: 1024 },
          browser: { usage: 100, quota: 200, available: 100, percentage: 50 },
        }}
        sessions={[baseSession]}
        language="en"
        isClearing={false}
        onWipeCache={onWipeCache}
        onClearAllStorage={onClearAllStorage}
        onClearItemCache={onClearItemCache}
        onDeleteItem={onDeleteItem}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'storageQuotaWipe' }))
    fireEvent.click(screen.getByRole('button', { name: 'settingsWipeAll' }))

    const clearCacheButton = container.querySelector('button[title="ariaRemoveDownloadedAudio"]')
    const deleteButton = container.querySelector('button[title="ariaDelete"]')

    expect(clearCacheButton).toBeTruthy()
    expect(deleteButton).toBeTruthy()

    fireEvent.click(clearCacheButton as HTMLButtonElement)
    fireEvent.click(deleteButton as HTMLButtonElement)

    expect(onWipeCache).toHaveBeenCalledTimes(1)
    expect(onClearAllStorage).toHaveBeenCalledTimes(1)
    expect(onClearItemCache).toHaveBeenCalledWith('s1')
    expect(onDeleteItem).toHaveBeenCalledWith('s1')
  })
})
