import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePodcastDetail } from '../../../lib/discovery/queryCache'
import { DownloadEpisodeButton } from '../DownloadEpisodeButton'

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
  useEpisodeStatus: () => mockEpisodeStatus,
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
    mockEpisodeStatus.downloadStatus = 'idle'
    mockEpisodeStatus.progress = null
    mockEpisodeStatus.localTrackId = null
    mockEpisodeStatus.refresh = refreshMock
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

  it('short-circuits when already downloading', () => {
    mockEpisodeStatus.downloadStatus = 'downloading'
    mockEpisodeStatus.progress = 42

    render(<DownloadEpisodeButton {...requiredRemoteProps} />)

    expect(
      screen.getByRole('button', { name: 'downloadEpisodeDownloading' }).hasAttribute('disabled')
    ).toBe(true)
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(refreshMock).not.toHaveBeenCalled()
  })

  it('refreshes status after download succeeds', async () => {
    render(<DownloadEpisodeButton {...requiredRemoteProps} />)

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledTimes(1)
    })
  })
})
