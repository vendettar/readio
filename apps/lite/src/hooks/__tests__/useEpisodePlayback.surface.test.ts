import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Favorite } from '../../lib/dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../../lib/discovery'
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

describe('useEpisodePlayback surface mode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens docked when playing a feed episode', () => {
    const episode = {
      id: 'ep-1',
      title: 'Episode',
      audioUrl: 'https://example.com/episode.mp3',
      description: '',
      pubDate: '2024-01-01',
      transcriptUrl: '',
    } as unknown as Episode
    const podcast = {
      providerPodcastId: 1,
      collectionName: 'Podcast',
    } as unknown as Podcast

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
    const episode = {
      id: 'ep-2',
      title: 'Episode 2',
      audioUrl: 'https://example.com/episode-2.mp3',
      description: '',
      pubDate: '2024-01-01',
    } as unknown as Episode
    const podcast = {
      providerPodcastId: 2,
      collectionName: 'Podcast',
    } as unknown as Podcast

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

  it('opens docked when playing a search episode', () => {
    const episode = {
      providerEpisodeId: 1,
      providerPodcastId: 2,
      trackName: 'Search Episode',
      collectionName: 'Podcast',
      episodeUrl: 'https://example.com/search.mp3',
    } as unknown as SearchEpisode

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playSearchEpisode(episode, 'https://example.com/feed.xml', 'us')
    })

    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playSearchEpisodeWithDepsMock).toHaveBeenCalledTimes(1)
  })

  it('forwards stream_without_transcript mode for search action', () => {
    const episode = {
      providerEpisodeId: 3,
      providerPodcastId: 4,
      trackName: 'Search Stream',
      collectionName: 'Podcast',
      episodeUrl: 'https://example.com/search-stream.mp3',
    } as unknown as SearchEpisode

    const { result } = renderHook(() => useEpisodePlayback())
    act(() => {
      result.current.playSearchEpisode(episode, 'https://example.com/feed.xml', 'us', {
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    })

    expect(playSearchEpisodeWithDepsMock).toHaveBeenCalledWith(
      expect.anything(),
      episode,
      expect.objectContaining({
        mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
      })
    )
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
