import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PlayerDownloadAction } from '../PlayerDownloadAction'

const { buildDownloadJobOptionsFromCanonicalRemoteMetadataMock, downloadEpisodeMock, refreshMock } =
  vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  buildDownloadJobOptionsFromCanonicalRemoteMetadataMock: vi.fn((input: Record<string, unknown>) => {
    const metadata = (input.metadata as Record<string, unknown> | null | undefined) ?? {}
    const rawCountry =
      typeof metadata.countryAtSave === 'string' && /^(us|jp)$/i.test(metadata.countryAtSave)
        ? metadata.countryAtSave.toLowerCase()
        : null

    if (!rawCountry) {
      return null
    }

    return {
      audioUrl: input.audioUrl,
      episodeTitle: input.episodeTitle,
      episodeDescription: '',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      countryAtSave: rawCountry,
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
      durationSeconds: metadata.durationSeconds,
    }
  }),
  refreshMock: vi.fn(),
  }))
let currentDurationSeconds: number | undefined
let currentEpisodeMetadata: Record<string, unknown> | null

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../../lib/downloadService', () => ({
  buildDownloadJobOptionsFromCanonicalRemoteMetadata:
    buildDownloadJobOptionsFromCanonicalRemoteMetadataMock,
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
      episodeMetadata: currentEpisodeMetadata,
    }),
}))

describe('PlayerDownloadAction country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    buildDownloadJobOptionsFromCanonicalRemoteMetadataMock.mockClear()
    refreshMock.mockClear()
    currentDurationSeconds = 245
    currentEpisodeMetadata = {
      originalAudioUrl: 'https://example.com/source.mp3',
      countryAtSave: 'us',
      durationSeconds: currentDurationSeconds,
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    }
  })

  it.each([
    {
      name: 'fails closed when countryAtSave is missing',
      metadata: {
        originalAudioUrl: 'https://example.com/source.mp3',
        durationSeconds: 245,
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        podcastItunesId: 'pod-1',
        episodeGuid: 'episode-guid-1',
      },
    },
    {
      name: 'fails closed when countryAtSave is invalid',
      metadata: {
        originalAudioUrl: 'https://example.com/source.mp3',
        countryAtSave: 'zz',
        durationSeconds: 245,
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        podcastItunesId: 'pod-1',
        episodeGuid: 'episode-guid-1',
      },
    },
  ])('$name', ({ metadata }) => {
    currentEpisodeMetadata = metadata

    render(<PlayerDownloadAction />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(buildDownloadJobOptionsFromCanonicalRemoteMetadataMock).not.toHaveBeenCalled()
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('normalizes uppercase countryAtSave', () => {
    currentEpisodeMetadata = {
      originalAudioUrl: 'https://example.com/source.mp3',
      countryAtSave: 'US',
      durationSeconds: currentDurationSeconds,
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    }

    render(<PlayerDownloadAction />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ countryAtSave: 'us', durationSeconds: 245 })
    )
  })
})
