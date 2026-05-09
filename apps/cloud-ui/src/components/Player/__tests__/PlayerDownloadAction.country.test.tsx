import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DownloadedBadge, PlayerDownloadAction } from '../PlayerDownloadAction'

const {
  buildDownloadJobOptionsFromCanonicalRemoteMetadataMock,
  downloadEpisodeMock,
  refreshMock,
  removeDownloadedTrackMock,
  useEpisodeStatusMock,
} = vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  buildDownloadJobOptionsFromCanonicalRemoteMetadataMock: vi.fn(
    (input: Record<string, unknown>) => {
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
    }
  ),
  refreshMock: vi.fn(),
  removeDownloadedTrackMock: vi.fn(() => Promise.resolve(true)),
  useEpisodeStatusMock: vi.fn(),
}))
let currentDurationSeconds: number | undefined
let currentEpisodeMetadata: Record<string, unknown> | null
let currentAudioUrl: string
let currentAudioTitle: string
let currentDownloadStatus: 'idle' | 'downloaded' | 'downloading'
let currentLocalTrackId: string | null

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
  removeDownloadedTrack: removeDownloadedTrackMock,
}))

vi.mock('../../../hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: useEpisodeStatusMock,
}))

vi.mock('../../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      audioUrl: currentAudioUrl,
      audioTitle: currentAudioTitle,
      episodeMetadata: currentEpisodeMetadata,
    }),
}))

describe('PlayerDownloadAction country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    buildDownloadJobOptionsFromCanonicalRemoteMetadataMock.mockClear()
    refreshMock.mockClear()
    removeDownloadedTrackMock.mockClear()
    useEpisodeStatusMock.mockClear()
    currentDurationSeconds = 245
    currentAudioUrl = 'https://example.com/fallback.mp3'
    currentAudioTitle = 'Episode'
    currentDownloadStatus = 'idle'
    currentLocalTrackId = null
    currentEpisodeMetadata = {
      originalAudioUrl: 'https://example.com/source.mp3',
      countryAtSave: 'us',
      durationSeconds: currentDurationSeconds,
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    }
    useEpisodeStatusMock.mockImplementation((input: unknown) => ({
      playable: true,
      downloadStatus: currentDownloadStatus,
      progress: null,
      speedBytesPerSecond: undefined,
      localTrackId: currentLocalTrackId,
      disabledReason: null,
      normalizedUrl:
        typeof input === 'string'
          ? input
          : typeof input === 'object' && input !== null && 'audioUrl' in input
            ? String(input.audioUrl ?? '')
            : '',
      isLocal: currentDownloadStatus === 'downloaded',
      loading: false,
      refresh: refreshMock,
    }))
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

  it('does not render a download action for blob audio sources', () => {
    currentAudioUrl = 'blob:https://example.com/local-track'
    currentEpisodeMetadata = null

    render(<PlayerDownloadAction />)

    expect(screen.queryByRole('button')).toBeNull()
    expect(useEpisodeStatusMock).toHaveBeenCalledWith('blob:https://example.com/local-track')
  })

  it('falls back to source identity URL when canonical metadata is incomplete', () => {
    currentEpisodeMetadata = {
      originalAudioUrl: 'https://example.com/source.mp3',
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    }

    render(
      <>
        <PlayerDownloadAction />
        <DownloadedBadge audioUrl={currentAudioUrl} />
      </>
    )

    expect(useEpisodeStatusMock).toHaveBeenCalledTimes(2)
    expect(useEpisodeStatusMock.mock.calls[0]?.[0]).toBe('https://example.com/source.mp3')
    expect(useEpisodeStatusMock.mock.calls[1]?.[0]).toBe('https://example.com/source.mp3')
  })

  it('refreshes after removing a downloaded track', async () => {
    currentDownloadStatus = 'downloaded'
    currentLocalTrackId = 'local-track-1'

    render(<PlayerDownloadAction />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadRemove' }))

    await waitFor(() => {
      expect(removeDownloadedTrackMock).toHaveBeenCalledWith('local-track-1')
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
  })

  it('uses the same canonical episode lookup for action and badge', () => {
    render(
      <>
        <PlayerDownloadAction />
        <DownloadedBadge audioUrl={currentAudioUrl} />
      </>
    )

    expect(useEpisodeStatusMock).toHaveBeenCalledTimes(2)
    expect(useEpisodeStatusMock.mock.calls[0]?.[0]).toEqual(useEpisodeStatusMock.mock.calls[1]?.[0])
    expect(useEpisodeStatusMock.mock.calls[0]?.[0]).toEqual({
      audioUrl: 'https://example.com/source.mp3',
      podcastItunesId: 'pod-1',
      episodeGuid: 'episode-guid-1',
    })
  })
})
