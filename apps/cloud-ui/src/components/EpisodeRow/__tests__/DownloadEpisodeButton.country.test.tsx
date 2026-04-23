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

vi.mock('../../../lib/downloadService', () => ({
  downloadEpisode: downloadEpisodeMock,
}))

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

vi.mock('../../../lib/runtimeConfig', () => ({
  getAppConfig: () => ({ DEFAULT_COUNTRY: 'us' }),
}))

describe('DownloadEpisodeButton country normalization', () => {
  beforeEach(() => {
    downloadEpisodeMock.mockClear()
    refreshMock.mockClear()
    vi.mocked(ensurePodcastDetail).mockReset()
  })

  it.each([
    { name: 'falls back when countryAtSave is missing', input: undefined, expected: 'us' },
    { name: 'falls back when countryAtSave is invalid', input: 'zz', expected: 'us' },
    { name: 'normalizes uppercase countryAtSave', input: 'US', expected: 'us' },
  ])('$name', async ({ input, expected }) => {
    render(
      <DownloadEpisodeButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        countryAtSave={input}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    })
    expect(downloadEpisodeMock).toHaveBeenCalledWith(expect.objectContaining({ countryAtSave: expected }))
  })

  it('resolves canonical feedUrl from PI when direct feedUrl is absent', async () => {
    vi.mocked(ensurePodcastDetail).mockResolvedValue({
      podcastItunesId: '123',
      title: 'Podcast',
      author: 'Host',
      artwork: 'https://example.com/art.jpg',
      description: 'desc',
      feedUrl: 'https://example.com/canonical-feed.xml',
      lastUpdateTime: 1,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
    })

    render(
      <DownloadEpisodeButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        countryAtSave="us"
        podcastItunesId="123"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(ensurePodcastDetail).toHaveBeenCalledWith(expect.anything(), '123', 'us')
    })
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedUrl: 'https://example.com/canonical-feed.xml' })
    )
  })

  it('skips PI lookup when feedUrl is already provided', async () => {
    render(
      <DownloadEpisodeButton
        episodeTitle="Episode"
        showTitle="Podcast"
        audioUrl="https://example.com/audio.mp3"
        countryAtSave="us"
        podcastItunesId="123"
        feedUrl="https://example.com/already-known.xml"
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'downloadEpisode' }))

    await waitFor(() => {
      expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    })
    expect(ensurePodcastDetail).not.toHaveBeenCalled()
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({ feedUrl: 'https://example.com/already-known.xml' })
    )
  })
})
