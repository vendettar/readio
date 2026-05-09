import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EpisodeDetailDownloadButton } from '../EpisodeDetailDownloadButton'

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

const { downloadEpisodeMock, refreshMock, mockEpisodeStatus } = vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  refreshMock: vi.fn(),
  mockEpisodeStatus: {
    playable: true,
    downloadStatus: 'idle' as 'idle' | 'downloading' | 'downloaded',
    progress: null as number | null,
    speedBytesPerSecond: undefined as number | undefined,
    localTrackId: null as string | null,
    disabledReason: null as string | null,
    normalizedUrl: 'https://example.com/audio.mp3',
    isLocal: false,
    loading: false,
    refresh: vi.fn(),
  },
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { resolvedLanguage: 'en', language: 'en' },
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../../lib/downloadService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../lib/downloadService')>()
  return {
    ...actual,
    downloadEpisode: downloadEpisodeMock,
    removeDownloadedTrack: vi.fn(() => Promise.resolve(true)),
  }
})

vi.mock('../../../hooks/useEpisodeStatus', () => ({
  useEpisodeStatus: () => mockEpisodeStatus,
}))

describe('EpisodeDetailDownloadButton country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    refreshMock.mockClear()
    mockEpisodeStatus.downloadStatus = 'idle'
    mockEpisodeStatus.progress = null
    mockEpisodeStatus.localTrackId = null
    mockEpisodeStatus.refresh = refreshMock
  })

  it.each([
    { name: 'fails closed when countryAtSave is blank', input: '   ' },
    { name: 'fails closed when countryAtSave is invalid', input: 'zz' },
  ])('$name', ({ input }) => {
    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        artworkUrl="https://example.com/art.jpg"
        podcastItunesId="pod-1"
        episodeGuid="episode-guid-1"
        countryAtSave={input}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('normalizes uppercase countryAtSave', () => {
    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        artworkUrl="https://example.com/art.jpg"
        countryAtSave="US"
        podcastItunesId="pod-1"
        episodeGuid="episode-guid-1"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ countryAtSave: 'us' })
    )
  })

  it.each([
    {
      name: 'fails closed when podcastItunesId is missing',
      props: { podcastItunesId: '   ', episodeGuid: 'episode-guid-1' },
    },
    {
      name: 'fails closed when episodeGuid is missing',
      props: { podcastItunesId: 'pod-1', episodeGuid: '   ' },
    },
    {
      name: 'fails closed when artworkUrl is missing',
      props: { podcastItunesId: 'pod-1', episodeGuid: 'episode-guid-1', artworkUrl: '   ' },
    },
  ])('$name', ({ props }) => {
    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        countryAtSave="us"
        artworkUrl="https://example.com/art.jpg"
        {...props}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('short-circuits when already downloading', () => {
    mockEpisodeStatus.downloadStatus = 'downloading'
    mockEpisodeStatus.progress = 42

    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        artworkUrl="https://example.com/art.jpg"
        countryAtSave="us"
        podcastItunesId="pod-1"
        episodeGuid="episode-guid-1"
      />
    )

    expect(
      screen.getByRole('button', { name: 'downloadEpisodeDownloading' }).hasAttribute('disabled')
    ).toBe(true)
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('refreshes status after download succeeds', async () => {
    render(
      <EpisodeDetailDownloadButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        artworkUrl="https://example.com/art.jpg"
        countryAtSave="US"
        podcastItunesId="pod-1"
        episodeGuid="episode-guid-1"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await Promise.resolve()

    expect(refreshMock).toHaveBeenCalledTimes(1)
  })
})
