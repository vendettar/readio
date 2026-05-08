import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Favorite } from '../../lib/dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../../lib/discovery'
import { ensurePodcastDetail } from '../../lib/discovery/queryCache'
import { PLAYBACK_REQUEST_MODE } from '../../lib/player/playbackMode'
import { useEpisodePlayback } from '../useEpisodePlayback'

const setAudioUrlMock = vi.fn()
const playMock = vi.fn()
const pauseMock = vi.fn()
const setPlaybackTrackIdMock = vi.fn()
const setPlayableContextMock = vi.fn()
const toDockedMock = vi.fn()
const toMiniMock = vi.fn()

const playEpisodeWithDepsMock = vi.fn()
const playSearchEpisodeWithDepsMock = vi.fn()
const playFavoriteWithDepsMock = vi.fn()

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({}),
}))

vi.mock('../../store/playerStore', () => ({
  usePlayerStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setAudioUrl: setAudioUrlMock,
      play: playMock,
      pause: pauseMock,
      setPlaybackTrackId: setPlaybackTrackIdMock,
    }),
}))

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
      toMini: toMiniMock,
    }),
}))

vi.mock('../../store/exploreStore', () => ({
  useExploreStore: Object.assign(
    (selector: (state: Record<string, unknown>) => unknown) =>
      selector({
        country: 'us',
      }),
    {
      getState: () => ({ country: 'us' }),
    }
  ),
}))

vi.mock('../../lib/player/remotePlayback', () => ({
  playEpisodeWithDeps: (...args: unknown[]) => playEpisodeWithDepsMock(...args),
  playSearchEpisodeWithDeps: (...args: unknown[]) => playSearchEpisodeWithDepsMock(...args),
  playFavoriteWithDeps: (...args: unknown[]) => playFavoriteWithDepsMock(...args),
}))

vi.mock('../../lib/discovery/queryCache', () => ({
  ensurePodcastDetail: vi.fn(),
}))

describe('useEpisodePlayback surface mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens docked when playing a feed episode and falls back to normalized store country', () => {
    const episode: Episode = {
      guid: 'ep-1',
      title: 'Episode',
      audioUrl: 'https://example.com/episode.mp3',
      description: '',
      pubDate: '2024-01-01',
      artworkUrl: 'https://example.com/episode-art-1.jpg',
      fileSize: 1024,
      duration: 60,
      explicit: false,
      link: 'https://example.com/episodes/ep-1',
    }
    const podcast: Podcast = {
      podcastItunesId: '1',
      title: 'Podcast',
      author: '',
      artwork: '',
      description: '',
      lastUpdateTime: 0,
      episodeCount: 0,
      language: 'en',
      genres: ['Technology'],
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playEpisode(episode, podcast, 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playEpisodeWithDepsMock).toHaveBeenCalledTimes(1)
    expect(playEpisodeWithDepsMock).toHaveBeenCalledWith(
      expect.anything(),
      episode,
      podcast,
      expect.objectContaining({
        countryAtSave: 'us',
      })
    )
  })

  it('forwards stream_without_transcript mode for feed episode action', () => {
    const episode: Episode = {
      guid: 'ep-2',
      title: 'Episode 2',
      audioUrl: 'https://example.com/episode-2.mp3',
      description: '',
      pubDate: '2024-01-01',
      artworkUrl: 'https://example.com/episode-art-2.jpg',
      fileSize: 1024,
      duration: 60,
      explicit: false,
      link: 'https://example.com/episodes/ep-2',
    }
    const podcast: Podcast = {
      podcastItunesId: '2',
      title: 'Podcast 2',
      author: '',
      artwork: '',
      description: '',
      lastUpdateTime: 0,
      episodeCount: 0,
      language: 'en',
      genres: ['Technology'],
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playEpisode(episode, podcast, 'us', {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    })

    expect(playEpisodeWithDepsMock).toHaveBeenCalledWith(
      expect.anything(),
      episode,
      podcast,
      expect.objectContaining({
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    )
  })

  it('opens docked when playing a search episode', async () => {
    const episode = {
      podcastItunesId: '2',
      title: 'Search Episode',
      showTitle: 'Podcast',
      audioUrl: 'https://example.com/search.mp3',
      artwork: 'https://example.com/search.jpg',
      guid: 'search-guid-1',
    } as unknown as SearchEpisode

    vi.mocked(ensurePodcastDetail).mockResolvedValue(null)
    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playSearchEpisode(episode, 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(playSearchEpisodeWithDepsMock).toHaveBeenCalledTimes(1)
    })
    expect(playSearchEpisodeWithDepsMock).toHaveBeenCalledWith(
      expect.anything(),
      episode,
      expect.objectContaining({
        countryAtSave: 'us',
      })
    )
  })

  it('forwards stream_without_transcript mode for search action', async () => {
    const episode = {
      podcastItunesId: '4',
      title: 'Search Stream',
      showTitle: 'Podcast',
      audioUrl: 'https://example.com/search-stream.mp3',
      artwork: 'https://example.com/search-stream.jpg',
      guid: 'search-guid-3',
    } as unknown as SearchEpisode

    vi.mocked(ensurePodcastDetail).mockResolvedValue(null)
    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playSearchEpisode(episode, 'us', {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    })

    await waitFor(() => {
      expect(playSearchEpisodeWithDepsMock).toHaveBeenCalledWith(
        expect.anything(),
        episode,
        expect.objectContaining({
          mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
        })
      )
    })
  })

  it('opens docked when playing a favorite', () => {
    const favorite: Favorite = {
      id: 'fav-1',
      key: '101::favorite-guid-1',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'Favorite',
      podcastTitle: 'Podcast',
      artworkUrl: '',
      episodeArtworkUrl: '',
      addedAt: Date.now(),
      description: 'Test description',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      podcastItunesId: '101',
      episodeGuid: 'favorite-guid-1',
      transcriptUrl: '',
      countryAtSave: 'us',
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playFavorite(favorite, 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playFavoriteWithDepsMock).toHaveBeenCalledTimes(1)
  })

  it('fails closed when favorite playback caller passes an invalid country snapshot', () => {
    const favorite: Favorite = {
      id: 'fav-invalid-country',
      key: '103::favorite-guid-3',
      audioUrl: 'https://example.com/favorite-3.mp3',
      episodeTitle: 'Favorite 3',
      podcastTitle: 'Podcast',
      artworkUrl: '',
      episodeArtworkUrl: '',
      addedAt: Date.now(),
      description: 'Test description',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      podcastItunesId: '103',
      episodeGuid: 'favorite-guid-3',
      transcriptUrl: '',
      countryAtSave: 'us',
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playFavorite(favorite, '')
    })

    expect(playFavoriteWithDepsMock).not.toHaveBeenCalled()
    expect(setPlayableContextMock).not.toHaveBeenCalled()
  })

  it('forwards stream_without_transcript mode for favorite action', () => {
    const favorite: Favorite = {
      id: 'fav-2',
      key: '102::favorite-guid-2',
      audioUrl: 'https://example.com/favorite-2.mp3',
      episodeTitle: 'Favorite 2',
      podcastTitle: 'Podcast',
      artworkUrl: '',
      episodeArtworkUrl: '',
      addedAt: Date.now(),
      description: 'Test description',
      pubDate: '2025-02-01',
      durationSeconds: 180,
      podcastItunesId: '102',
      episodeGuid: 'favorite-guid-2',
      countryAtSave: 'us',
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playFavorite(favorite, 'us', {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    })

    expect(playFavoriteWithDepsMock).toHaveBeenCalledWith(
      expect.anything(),
      favorite,
      expect.objectContaining({
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    )
  })
})
