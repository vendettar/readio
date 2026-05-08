import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePodcastDetail } from '../../../lib/discovery/queryCache'
import { DownloadEpisodeButton } from '../DownloadEpisodeButton'

const { downloadEpisodeMock, refreshMock } = vi.hoisted(() => ({
  downloadEpisodeMock: vi.fn(() => Promise.resolve({ ok: true })),
  refreshMock: vi.fn(),
}))

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
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
  }
})

vi.mock('../../../lib/discovery/queryCache', () => ({
  ensurePodcastDetail: vi.fn(),
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

const requiredRemoteProps = {
  episodeTitle: 'Episode',
  showTitle: 'Podcast',
  audioUrl: 'https://example.com/audio.mp3',
  artworkUrl: 'https://example.com/art.jpg',
  countryAtSave: 'us',
  podcastItunesId: '123',
  episodeGuid: 'episode-guid-1',
} as const

describe('DownloadEpisodeButton remote contract', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    refreshMock.mockClear()
    vi.mocked(ensurePodcastDetail).mockReset()
  })

  it.each([
    { name: 'fails closed when countryAtSave is blank', input: '   ' },
    { name: 'fails closed when countryAtSave is invalid', input: 'zz' },
  ])('$name', ({ input }) => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} countryAtSave={input} />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('normalizes uppercase countryAtSave', async () => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} countryAtSave="US" />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    })
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        countryAtSave: 'us',
        artworkUrl: requiredRemoteProps.artworkUrl,
        podcastItunesId: requiredRemoteProps.podcastItunesId,
        episodeGuid: requiredRemoteProps.episodeGuid,
        showTitle: requiredRemoteProps.showTitle,
      })
    )
  })

  it.each([
    {
      name: 'fails closed when showTitle is missing',
      props: { showTitle: '   ' },
    },
    {
      name: 'fails closed when artworkUrl is missing',
      props: { artworkUrl: '   ' },
    },
    {
      name: 'fails closed when podcastItunesId is missing',
      props: { podcastItunesId: '   ' },
    },
    {
      name: 'fails closed when episodeGuid is missing',
      props: { episodeGuid: '   ' },
    },
    {
      name: 'fails closed when audioUrl is missing',
      props: { audioUrl: '   ' },
    },
  ])('$name', ({ props }) => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} {...props} />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('does not perform PI lookup before downloading when podcast identity is present', async () => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    })
    expect(ensurePodcastDetail).not.toHaveBeenCalled()
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ feedUrl: expect.anything() })
    )
  })

  it('does not perform PI lookup before downloading', async () => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    })
    expect(ensurePodcastDetail).not.toHaveBeenCalled()
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ feedUrl: expect.anything() })
    )
  })
})
