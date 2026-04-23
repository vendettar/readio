import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerDownloadAction } from '../PlayerDownloadAction'

const { downloadEpisodeMock, refreshMock } = vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  refreshMock: vi.fn(),
}))
let currentCountryAtSave: string | undefined

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
    normalizedUrl: 'https://example.com/source.mp3',
    isLocal: false,
    loading: false,
    refresh: refreshMock,
  }),
}))

vi.mock('../../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      audioUrl: 'https://example.com/fallback.mp3',
      audioTitle: 'Episode',
      episodeMetadata: {
        originalAudioUrl: 'https://example.com/source.mp3',
        countryAtSave: currentCountryAtSave,
        showTitle: 'Podcast',
      },
    }),
}))

vi.mock('../../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({ DEFAULT_COUNTRY: 'us' }),
}))

describe('PlayerDownloadAction country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    refreshMock.mockClear()
  })

  it.each([
    { name: 'falls back when countryAtSave is missing', input: undefined, expected: 'us' },
    { name: 'falls back when countryAtSave is invalid', input: 'zz', expected: 'us' },
    { name: 'normalizes uppercase countryAtSave', input: 'US', expected: 'us' },
  ])('$name', ({ input, expected }) => {
    currentCountryAtSave = input

    render(<PlayerDownloadAction />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ countryAtSave: expected })
    )
  })
})
