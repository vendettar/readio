import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLocalSearch } from '../useLocalSearch'

const loadSubscriptionsMock = vi.fn()
const loadFavoritesMock = vi.fn()
const loadLocalSearchDbSnapshotMock = vi.fn()
const translationState = {
  t: (key: string) => key,
  i18n: { language: 'en', resolvedLanguage: 'en' },
}
const exploreStoreState = {
  subscriptions: [] as Array<{
    id: string
    podcastItunesId: string
    title: string
    author: string
    artworkUrl: string
    addedAt: number
    countryAtSave: string
  }>,
  favorites: [] as Array<Record<string, unknown>>,
  subscriptionsLoaded: true,
  favoritesLoaded: true,
  loadSubscriptions: loadSubscriptionsMock,
  loadFavorites: loadFavoritesMock,
}

vi.mock('react-i18next', () => ({
  useTranslation: () => translationState,
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: (selector: (state: typeof exploreStoreState) => unknown) =>
    selector(exploreStoreState),
}))

vi.mock('../../lib/localSearchService', () => ({
  loadLocalSearchDbSnapshot: (...args: unknown[]) => loadLocalSearchDbSnapshotMock(...args),
}))

describe('useLocalSearch subscription identity', () => {
  beforeEach(() => {
    loadLocalSearchDbSnapshotMock.mockReset()
    loadLocalSearchDbSnapshotMock.mockResolvedValue({
      sessions: [],
      tracks: [],
      downloads: [],
    })
  })

  it('keys subscription results by podcastItunesId instead of feedUrl', async () => {
    exploreStoreState.subscriptions = [
      {
        id: 'sub-row-1',
        podcastItunesId: 'podcast-123',
        title: 'Podcast Result',
        author: 'Host',
        artworkUrl: '',
        addedAt: 1,
        countryAtSave: 'us',
      },
    ]
    exploreStoreState.favorites = []

    const { result } = renderHook(() => useLocalSearch('podcast', true))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.localResults).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'subscription',
          id: 'sub-podcast-123',
          title: 'Podcast Result',
        }),
      ])
    )
  })

  it('merges canonical favorite, history, and download results into one entry', async () => {
    exploreStoreState.subscriptions = []
    exploreStoreState.favorites = [
      {
        id: 'fav-1',
        key: 'pod-1::ep-1',
        audioUrl: 'https://example.com/ep-1.mp3',
        episodeTitle: 'Episode Result',
        podcastTitle: 'Podcast Result',
        artworkUrl: 'https://example.com/podcast.jpg',
        episodeArtworkUrl: 'https://example.com/episode.jpg',
        description: 'desc',
        pubDate: 1738368000,
        durationSeconds: 180,
        addedAt: 1,
        podcastItunesId: 'pod-1',
        episodeGuid: 'ep-1',
        countryAtSave: 'us',
      },
    ]
    loadLocalSearchDbSnapshotMock.mockResolvedValue({
      sessions: [
        {
          id: 'session-1',
          source: 'explore',
          title: 'Episode Result',
          createdAt: 1,
          lastPlayedAt: 1,
          sizeBytes: 0,
          durationSeconds: 180,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioUrl: 'https://example.com/ep-1.mp3',
          artworkUrl: 'https://example.com/episode.jpg',
          showTitle: 'Podcast Result',
          publishedAt: 1,
          episodeGuid: 'ep-1',
          podcastItunesId: 'pod-1',
          countryAtSave: 'us',
          localTrackId: 'download-track-1',
        },
      ],
      tracks: [],
      downloads: [
        {
          download: {
            id: 'download-1',
            name: 'Episode Result',
            audioId: 'audio-1',
            sizeBytes: 1024,
            durationSeconds: 180,
            createdAt: 1,
            sourceUrlNormalized: 'https://example.com/ep-1.mp3',
            sourcePodcastTitle: 'Podcast Result',
            sourceEpisodeTitle: 'Episode Result',
            sourceDescription: 'desc',
            sourceArtworkUrl: 'https://example.com/episode.jpg',
            downloadedAt: 1,
            countryAtSave: 'us',
            sourcePodcastItunesId: 'pod-1',
            sourceEpisodeGuid: 'ep-1',
            sourceType: 'podcast_download',
          },
        },
      ],
    })

    const { result } = renderHook(() => useLocalSearch('episode', true))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(loadLocalSearchDbSnapshotMock).toHaveBeenCalledWith(
      expect.objectContaining({
        favoriteCanonicalIdentities: [
          {
            podcastItunesId: 'pod-1',
            episodeGuid: 'ep-1',
          },
        ],
      })
    )
    expect(result.current.localResults).toHaveLength(1)
    expect(result.current.localResults[0]).toMatchObject({
      type: 'favorite',
      title: 'Episode Result',
      artworkUrl: 'https://example.com/episode.jpg',
    })
    expect(result.current.localResults[0].badges).toEqual(
      expect.arrayContaining(['favorite', 'history', 'download'])
    )
  })

  it('does not collapse partial canonical remote history rows by weak episodeGuid fallback', async () => {
    exploreStoreState.subscriptions = []
    exploreStoreState.favorites = []
    loadLocalSearchDbSnapshotMock.mockResolvedValue({
      sessions: [
        {
          id: 'session-a',
          source: 'explore',
          title: 'Episode Shared A',
          createdAt: 1,
          lastPlayedAt: 1,
          sizeBytes: 0,
          durationSeconds: 180,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioUrl: 'https://example.com/a.mp3',
          artworkUrl: 'https://example.com/a.jpg',
          showTitle: 'Podcast A',
          episodeGuid: 'ep-shared',
        },
        {
          id: 'session-b',
          source: 'explore',
          title: 'Episode Shared B',
          createdAt: 2,
          lastPlayedAt: 2,
          sizeBytes: 0,
          durationSeconds: 181,
          audioId: null,
          subtitleId: null,
          hasAudioBlob: false,
          progress: 0,
          audioFilename: '',
          subtitleFilename: '',
          audioUrl: 'https://example.com/b.mp3',
          artworkUrl: 'https://example.com/b.jpg',
          showTitle: 'Podcast B',
          episodeGuid: 'ep-shared',
        },
      ],
      tracks: [],
      downloads: [],
    })

    const { result } = renderHook(() => useLocalSearch('episode', true))

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false)
    })

    expect(result.current.localResults).toHaveLength(2)
    expect(result.current.localResults.map((item) => item.id)).toEqual(
      expect.arrayContaining(['history-session-a', 'history-session-b'])
    )
  })
})
