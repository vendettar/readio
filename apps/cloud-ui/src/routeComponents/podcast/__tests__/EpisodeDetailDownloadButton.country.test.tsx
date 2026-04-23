import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EpisodeDetailDownloadButton } from '../EpisodeDetailDownloadButton'

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

const { downloadEpisodeMock, refreshMock } = vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  refreshMock: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../../lib/downloadService', () => ({
  downloadEpisode: downloadEpisodeMock,
  removeDownloadedTrack: vi.fn(() => Promise.resolve(true)),
}))

vi.mock('../../../hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: () => ({
    playable: true,
    downloadStatus: 'idle',
    progress: null,
    speedBytesPerSecond: undefined,
    localTrackId: null,
    disabledReason: null,
    normalizedUrl: 'https://example.com/audio.mp3',
    isLocal: false,
    loading: false,
    refresh: refreshMock,
  }),
}))

vi.mock('../../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({ DEFAULT_COUNTRY: 'us' }),
}))

describe('EpisodeDetailDownloadButton country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    refreshMock.mockClear()
  })

  it.each([
    { name: 'falls back when countryAtSave is missing', input: undefined, expected: 'us' },
    { name: 'falls back when countryAtSave is invalid', input: 'zz', expected: 'us' },
    { name: 'normalizes uppercase countryAtSave', input: 'US', expected: 'us' },
  ])('$name', ({ input, expected }) => {
    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        countryAtSave={input}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ countryAtSave: expected })
    )
  })
})
