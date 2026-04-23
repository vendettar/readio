import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Favorite } from '../../lib/dexieDb'
import { type FeedEpisode, type Podcast, type SearchEpisode } from '../../lib/discovery'
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

const playFeedEpisodeWithDepsMock = vi.fn()
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
  playFeedEpisodeWithDeps: (...args: unknown[]) => playFeedEpisodeWithDepsMock(...args),
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

  it('opens docked when playing a feed episode', () => {
    const episode: FeedEpisode = {
      episodeGuid: 'ep-1',
      title: 'Episode',
      audioUrl: 'https://example.com/episode.mp3',
      description: '',
      pubDate: '2024-01-01',
    }
    const podcast: Podcast = {
      podcastItunesId: '1',
      title: 'Podcast',
      feedUrl: 'https://example.com/feed.xml',
      author: '',
      artwork: '',
      description: '',
      lastUpdateTime: 0,
      episodeCount: 0,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playEpisode(episode, podcast, 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playFeedEpisodeWithDepsMock).toHaveBeenCalledTimes(1)
  })

  it('forwards stream_without_transcript mode for feed episode action', () => {
    const episode: FeedEpisode = {
      episodeGuid: 'ep-2',
      title: 'Episode 2',
      audioUrl: 'https://example.com/episode-2.mp3',
      description: '',
      pubDate: '2024-01-01',
    }
    const podcast: Podcast = {
      podcastItunesId: '2',
      title: 'Podcast 2',
      feedUrl: 'https://example.com/feed.xml',
      author: '',
      artwork: '',
      description: '',
      lastUpdateTime: 0,
      episodeCount: 0,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    }

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playEpisode(episode, podcast, 'us', {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    })

    expect(playFeedEpisodeWithDepsMock).toHaveBeenCalledWith(
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
      providerEpisodeId: '1',
      podcastItunesId: '2',
      title: 'Search Episode',
      podcastTitle: 'Podcast',
      episodeUrl: 'https://example.com/search.mp3',
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
  })

  it('forwards stream_without_transcript mode for search action', async () => {
    const episode = {
      providerEpisodeId: '3',
      podcastItunesId: '4',
      title: 'Search Stream',
      podcastTitle: 'Podcast',
      episodeUrl: 'https://example.com/search-stream.mp3',
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
    const favorite = {
      id: 'fav-1',
      key: 'feed::audio',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'Favorite',
      podcastTitle: 'Podcast',
      artworkUrl: '',
      addedAt: Date.now(),
      transcriptUrl: '',
      countryAtSave: 'us',
    } as Favorite

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playFavorite(favorite, 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playFavoriteWithDepsMock).toHaveBeenCalledTimes(1)
  })

  it('forwards stream_without_transcript mode for favorite action', () => {
    const favorite = {
      id: 'fav-2',
      key: 'feed::audio-2',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/favorite-2.mp3',
      episodeTitle: 'Favorite 2',
      podcastTitle: 'Podcast',
      artworkUrl: '',
      addedAt: Date.now(),
      countryAtSave: 'us',
    } as Favorite

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
