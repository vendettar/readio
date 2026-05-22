import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSearchResult } from '../../hooks/useGlobalSearch'
import type { PlaybackSession } from '../dexieDb'
import { executeLocalSearchAction, type LocalSearchActionDeps } from '../localSearchActions'

const setPlayableContextMock = vi.fn()
const toDockedMock = vi.fn()
const toMiniMock = vi.fn()
const playFavoriteWithDepsMock = vi.fn()
const playHistorySessionWithDepsMock = vi.fn()
const restoreLocalHistoryPlaybackMock = vi.fn()
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

vi.mock('../player/localHistoryPlayback', () => ({
  restoreLocalHistoryPlayback: (...args: unknown[]) => restoreLocalHistoryPlaybackMock(...args),
}))

vi.mock('../logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../dexieDb', () => ({
  isNavigableExplorePlaybackSession: (session: PlaybackSession) =>
    session.source === 'explore' &&
    !!session.countryAtSave &&
    !!session.podcastItunesId &&
    !!session.episodeGuid,
}))

vi.mock('../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    getAudioBlob: vi.fn(),
    getSubtitle: vi.fn(),
  },
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
    playHistorySessionWithDepsMock.mockResolvedValue({ started: true, reason: 'started' })
    restoreLocalHistoryPlaybackMock.mockResolvedValue({ started: true, reason: 'started' })
  })

  it('fails closed for favorite when canonical identity is missing', async () => {
    const deps = createDeps()
    const result = {
      type: 'favorite',
      id: 'fav-fallback',
      title: 'Fallback Episode',
      subtitle: 'Podcast',
      badges: ['favorite'],
      data: {
        id: 'fav-db-id',
        key: '::',
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Fallback Episode',
        podcastTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeArtworkUrl: '',
        description: 'Test',
        pubDate: 1738368000,
        durationSeconds: 0,
        addedAt: Date.now(),
        countryAtSave: 'us',
        podcastItunesId: '',
        episodeGuid: '',
      },
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(playFavoriteWithDepsMock).not.toHaveBeenCalled()
    expect(deps.navigate).not.toHaveBeenCalled()
    expect(setPlayableContextMock).not.toHaveBeenCalled()
    expect(toDockedMock).not.toHaveBeenCalled()
    expect(toMiniMock).not.toHaveBeenCalled()
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
        artworkUrl: 'https://example.com/history.jpg',
        showTitle: 'History Podcast',
        podcastItunesId: '',
        episodeGuid: '',
        countryAtSave: 'us',
      },
    } as unknown as LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(playHistorySessionWithDepsMock).toHaveBeenCalledTimes(1)
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
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('does not open surface when shared remote history helper does not start playback', async () => {
    playHistorySessionWithDepsMock.mockResolvedValue({ started: false, reason: 'stale' })
    const deps = createDeps()
    const result = {
      type: 'history',
      id: 'history-2',
      title: 'History Episode',
      subtitle: 'Podcast',
      badges: ['history'],
      data: {
        id: 'session-2',
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
        audioUrl: 'https://example.com/history-2.mp3',
        artworkUrl: 'https://example.com/history-2.jpg',
        showTitle: 'History Podcast',
        podcastItunesId: '',
        episodeGuid: '',
        countryAtSave: 'us',
      },
    } as unknown as LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(playHistorySessionWithDepsMock).toHaveBeenCalledTimes(1)
    expect(setPlayableContextMock).not.toHaveBeenCalled()
    expect(toDockedMock).not.toHaveBeenCalled()
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('does not navigate away when local history restore is superseded as stale', async () => {
    restoreLocalHistoryPlaybackMock.mockResolvedValue({ started: false, reason: 'stale' })
    const deps = createDeps()
    const result = {
      type: 'history',
      id: 'history-local-stale',
      title: 'Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-local-1',
        source: 'local',
        title: 'Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 30,
        audioId: 'blob-1',
        subtitleId: 'subtitle-1',
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'local.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-1',
      },
    } as unknown as LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(restoreLocalHistoryPlaybackMock).toHaveBeenCalledTimes(1)
    expect(deps.navigate).not.toHaveBeenCalled()
  })
})
