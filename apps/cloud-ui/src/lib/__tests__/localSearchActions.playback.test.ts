import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSearchResult } from '../../hooks/useGlobalSearch'
import { executeLocalSearchAction, type LocalSearchActionDeps } from '../localSearchActions'

const setPlayableContextMock = vi.fn()
const toDockedMock = vi.fn()
const toMiniMock = vi.fn()
const playFavoriteWithDepsMock = vi.fn()
const playHistorySessionWithDepsMock = vi.fn()
let playbackEpoch = 0

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: {
    getState: () => ({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
      toMini: toMiniMock,
    }),
  },
}))

vi.mock('../player/remotePlayback', () => ({
  playFavoriteWithDeps: (...args: unknown[]) => playFavoriteWithDepsMock(...args),
  playHistorySessionWithDeps: (...args: unknown[]) => playHistorySessionWithDepsMock(...args),
  bumpPlaybackEpoch: () => ++playbackEpoch,
  getPlaybackEpoch: () => playbackEpoch,
}))

vi.mock('../logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../dexieDb', () => ({
  DB: {
    getAudioBlob: vi.fn(),
    getSubtitle: vi.fn(),
  },
  isNavigableExplorePlaybackSession: (session: { source?: string; countryAtSave?: string; podcastItunesId?: string; episodeGuid?: string }) =>
    session.source === 'explore' &&
    !!session.countryAtSave &&
    (!!session.podcastItunesId || !!session.episodeGuid),
}))

function createDeps(): LocalSearchActionDeps {
  return {
    navigate: vi.fn(),
    setAudioUrl: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    loadAudioBlob: vi.fn(),
    setSubtitles: vi.fn(),
  }
}

describe('localSearchActions remote playback delegation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    playbackEpoch = 0
    playHistorySessionWithDepsMock.mockReturnValue(true)
  })

  it('delegates favorite fallback playback to shared remotePlayback helper', async () => {
    const deps = createDeps()
    const result = {
      type: 'favorite',
      id: 'fav-fallback',
      title: 'Fallback Episode',
      subtitle: 'Podcast',
      badges: ['favorite'],
      data: {
        id: 'fav-db-id',
        key: 'feed::audio',
        feedUrl: 'https://example.com/feed.xml',
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Fallback Episode',
        podcastTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        addedAt: Date.now(),
        countryAtSave: 'us',
      },
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(playFavoriteWithDepsMock).toHaveBeenCalledTimes(1)
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playFavoriteWithDepsMock).toHaveBeenCalledWith(
      { setAudioUrl: deps.setAudioUrl, play: deps.play, pause: deps.pause },
      result.data,
      { countryAtSave: 'us' }
    )
  })

  it('delegates history remote fallback playback to shared helper', async () => {
    const deps = createDeps()
    const setSessionId = vi.fn()
    const setPlaybackTrackId = vi.fn()
    deps.setSessionId = setSessionId
    deps.setPlaybackTrackId = setPlaybackTrackId
    const result = {
      type: 'history',
      id: 'history-1',
      title: 'History Episode',
      subtitle: 'Podcast',
      badges: ['history'],
      data: {
        id: 'session-1',
        source: 'explore',
        title: 'History Episode',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 30,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        progress: 0,
        audioFilename: '',
        subtitleFilename: '',
        audioUrl: 'https://example.com/history.mp3',
      },
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(playHistorySessionWithDepsMock).toHaveBeenCalledTimes(1)
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
    expect(playHistorySessionWithDepsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        setAudioUrl: deps.setAudioUrl,
        play: deps.play,
        pause: deps.pause,
        setSessionId,
        setPlaybackTrackId,
      }),
      result.data
    )
  })
})
