import { waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LocalSearchResult } from '../../hooks/useGlobalSearch'
import { DB } from '../dexieDb'
import { buildEpisodeCompactKey } from '../discovery/editorPicks'
import { executeLocalSearchAction, type LocalSearchActionDeps } from '../localSearchActions'

const setPlayableContextMock = vi.fn()
const toDockedMock = vi.fn()
const toMiniMock = vi.fn()

vi.mock('../../store/playerSurfaceStore', () => ({
  usePlayerSurfaceStore: {
    getState: () => ({
      setPlayableContext: setPlayableContextMock,
      toDocked: toDockedMock,
      toMini: toMiniMock,
    }),
  },
}))

vi.mock('../imageUtils', () => ({
  getDiscoveryArtworkUrl: (value: string) => value,
}))

vi.mock('../remoteTranscript', () => ({
  autoIngestEpisodeTranscript: vi.fn(),
  getAsrSettingsSnapshot: vi.fn().mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper' }),
  getValidTranscriptUrl: vi.fn().mockReturnValue(null),
}))

vi.mock('../logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../dexieDb', () => ({
  DB: {
    getAudioBlob: vi.fn(),
    getSubtitle: vi.fn(),
  },
  db: {
    tracks: {
      where: vi.fn().mockReturnThis(),
      equals: vi.fn().mockReturnThis(),
      first: vi.fn().mockResolvedValue(null),
    },
    audioBlobs: {
      get: vi.fn(),
    },
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
    setPlaybackTrackId: vi.fn(),
  }
}

describe('executeLocalSearchAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates favorite result to canonical episode detail instead of direct play', async () => {
    const deps = createDeps()
    const result = {
      type: 'favorite',
      id: 'fav-1',
      title: 'Episode Title',
      subtitle: 'Podcast',
      badges: ['favorite'],
      data: {
        id: 'fav-db-id',
        key: 'feed::audio',
        feedUrl: 'https://example.com/feed.xml',
        audioUrl: 'https://example.com/audio.mp3',
        episodeTitle: 'Episode Title',
        podcastTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        addedAt: Date.now(),
        countryAtSave: 'us',
        podcastItunesId: '123',
        episodeGuid: '75f3241b-439d-4786-8968-07e05e548074',
      },
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(deps.navigate).toHaveBeenCalledWith({
      to: '/podcast/$country/$id/$episodeKey',
      params: {
        country: 'us',
        id: '123',
        episodeKey: buildEpisodeCompactKey('75f3241b-439d-4786-8968-07e05e548074'),
      },
    })
    expect(deps.play).not.toHaveBeenCalled()
    expect(deps.setAudioUrl).not.toHaveBeenCalled()
  })

  it('navigates history explore result to canonical episode detail when metadata exists', async () => {
    const deps = createDeps()
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
        countryAtSave: 'jp',
        podcastItunesId: '456',
        providerEpisodeId: '75f3241b-439d-4786-8968-07e05e548074',
        audioUrl: 'https://example.com/history.mp3',
      },
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(deps.navigate).toHaveBeenCalledWith({
      to: '/podcast/$country/$id/$episodeKey',
      params: {
        country: 'jp',
        id: '456',
        episodeKey: buildEpisodeCompactKey('75f3241b-439d-4786-8968-07e05e548074'),
      },
    })
    expect(deps.play).not.toHaveBeenCalled()
  })

  it('falls back to direct play for favorite when canonical route metadata is incomplete', async () => {
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

    expect(deps.navigate).not.toHaveBeenCalled()
    await waitFor(() => expect(deps.setAudioUrl).toHaveBeenCalledTimes(1))
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('falls back to local history blob restore when canonical route metadata is missing', async () => {
    const deps = createDeps()
    const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    const subtitleCues = [{ start: 0, end: 1, text: 'subtitle line' }]
    vi.mocked(DB.getAudioBlob).mockResolvedValueOnce({
      id: 'blob-1',
      blob: audioBlob,
      size: audioBlob.size,
      type: audioBlob.type,
      filename: 'local.mp3',
      storedAt: Date.now(),
    })
    vi.mocked(DB.getSubtitle).mockResolvedValueOnce({
      id: 'subtitle-1',
      cues: subtitleCues,
      cueSchemaVersion: 1,
      size: 1,
      filename: 'local.srt',
      storedAt: Date.now(),
    })

    const result = {
      type: 'history',
      id: 'history-local-fallback',
      title: 'Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      artworkBlob: new Blob(['cover'], { type: 'image/jpeg' }),
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
    } satisfies LocalSearchResult

    await executeLocalSearchAction(result, deps)

    expect(deps.navigate).not.toHaveBeenCalled()
    expect(DB.getAudioBlob).toHaveBeenCalledWith('blob-1')
    expect(deps.loadAudioBlob).toHaveBeenCalledWith(
      audioBlob,
      'Local Session',
      result.artworkBlob,
      'session-local-1',
      undefined,
      expect.objectContaining({
        durationSeconds: 30,
      })
    )
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(deps.setSubtitles).toHaveBeenCalledWith(subtitleCues)
    expect(deps.setPlaybackTrackId).toHaveBeenCalledWith('local-track-1')
    expect(setPlayableContextMock).toHaveBeenCalledWith(true)
    expect(toDockedMock).toHaveBeenCalledTimes(1)
    expect(toMiniMock).not.toHaveBeenCalled()
  })

  it('drops stale local restore when a newer local result is triggered', async () => {
    const deps = createDeps()
    const slowBlob = new Blob(['slow'], { type: 'audio/mpeg' })
    const fastBlob = new Blob(['fast'], { type: 'audio/mpeg' })

    vi.mocked(DB.getAudioBlob).mockImplementation(async (id) => {
      if (id === 'audio-slow') {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          id: 'blob-slow',
          blob: slowBlob,
          size: slowBlob.size,
          type: slowBlob.type,
          filename: 'slow.mp3',
          storedAt: Date.now(),
        }
      }
      return {
        id: 'blob-fast',
        blob: fastBlob,
        size: fastBlob.size,
        type: fastBlob.type,
        filename: 'fast.mp3',
        storedAt: Date.now(),
      }
    })
    vi.mocked(DB.getSubtitle).mockResolvedValue(undefined)

    const slowResult = {
      type: 'history',
      id: 'history-slow',
      title: 'Slow Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-slow',
        source: 'local',
        title: 'Slow Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 20,
        audioId: 'audio-slow',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'slow.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-slow',
      },
    } satisfies LocalSearchResult

    const fastResult = {
      type: 'history',
      id: 'history-fast',
      title: 'Fast Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-fast',
        source: 'local',
        title: 'Fast Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 20,
        audioId: 'audio-fast',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'fast.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-fast',
      },
    } satisfies LocalSearchResult

    await Promise.all([
      executeLocalSearchAction(slowResult, deps),
      executeLocalSearchAction(fastResult, deps),
    ])

    expect(deps.loadAudioBlob).toHaveBeenCalledTimes(1)
    expect(deps.loadAudioBlob).toHaveBeenCalledWith(
      fastBlob,
      'Fast Local Session',
      null,
      'session-fast',
      undefined,
      expect.objectContaining({
        durationSeconds: 20,
      })
    )
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(deps.setPlaybackTrackId).toHaveBeenCalledWith('local-track-fast')
    expect(deps.setPlaybackTrackId).not.toHaveBeenCalledWith('local-track-slow')
  })

  it('does not navigate fallback when stale local request fails after newer request wins', async () => {
    const deps = createDeps()
    const fastBlob = new Blob(['fast'], { type: 'audio/mpeg' })

    vi.mocked(DB.getAudioBlob).mockImplementation(async (id) => {
      if (id === 'audio-slow-fail') {
        await new Promise((resolve) => setTimeout(resolve, 50))
        throw new Error('slow lookup failed')
      }
      return {
        id: 'blob-fast',
        blob: fastBlob,
        size: fastBlob.size,
        type: fastBlob.type,
        filename: 'fast.mp3',
        storedAt: Date.now(),
      }
    })
    vi.mocked(DB.getSubtitle).mockResolvedValue(undefined)

    const slowResult = {
      type: 'history',
      id: 'history-slow-fail',
      title: 'Slow Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-slow-fail',
        source: 'local',
        title: 'Slow Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 20,
        audioId: 'audio-slow-fail',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'slow.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-slow-fail',
      },
    } satisfies LocalSearchResult

    const fastResult = {
      type: 'history',
      id: 'history-fast-win',
      title: 'Fast Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-fast-win',
        source: 'local',
        title: 'Fast Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 20,
        audioId: 'audio-fast-win',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'fast.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-fast-win',
      },
    } satisfies LocalSearchResult

    await Promise.all([
      executeLocalSearchAction(slowResult, deps),
      executeLocalSearchAction(fastResult, deps),
    ])

    expect(deps.loadAudioBlob).toHaveBeenCalledTimes(1)
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(deps.navigate).not.toHaveBeenCalled()
  })

  it('keeps local playback when subtitle restore fails', async () => {
    const deps = createDeps()
    const audioBlob = new Blob(['audio'], { type: 'audio/mpeg' })
    vi.mocked(DB.getAudioBlob).mockResolvedValueOnce({
      id: 'blob-subtitle-fail',
      blob: audioBlob,
      size: audioBlob.size,
      type: audioBlob.type,
      filename: 'local.mp3',
      storedAt: Date.now(),
    })
    vi.mocked(DB.getSubtitle).mockRejectedValueOnce(new Error('subtitle lookup failed'))

    const result = {
      type: 'history',
      id: 'history-local-subtitle-fail',
      title: 'Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-local-subtitle-fail',
        source: 'local',
        title: 'Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 30,
        audioId: 'blob-subtitle-fail',
        subtitleId: 'subtitle-fail',
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'local.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-subtitle-fail',
      },
    } satisfies LocalSearchResult

    await expect(executeLocalSearchAction(result, deps)).resolves.toBeUndefined()

    expect(deps.navigate).not.toHaveBeenCalled()
    expect(deps.loadAudioBlob).toHaveBeenCalledTimes(1)
    expect(deps.play).toHaveBeenCalledTimes(1)
    expect(deps.setSubtitles).not.toHaveBeenCalled()
    expect(deps.setPlaybackTrackId).toHaveBeenCalledWith('local-track-subtitle-fail')
  })

  it('handles local blob restore errors deterministically without side effects', async () => {
    const deps = createDeps()
    vi.mocked(DB.getAudioBlob).mockRejectedValueOnce(new Error('blob read failed'))

    const result = {
      type: 'history',
      id: 'history-local-error',
      title: 'Broken Local Session',
      subtitle: 'Files',
      badges: ['history', 'file'],
      data: {
        id: 'session-local-error',
        source: 'local',
        title: 'Broken Local Session',
        createdAt: Date.now(),
        lastPlayedAt: Date.now(),
        sizeBytes: 0,
        durationSeconds: 20,
        audioId: 'audio-error',
        subtitleId: null,
        hasAudioBlob: true,
        progress: 0,
        audioFilename: 'error.mp3',
        subtitleFilename: '',
        localTrackId: 'local-track-error',
      },
    } satisfies LocalSearchResult

    await expect(executeLocalSearchAction(result, deps)).resolves.toBeUndefined()

    expect(deps.navigate).toHaveBeenCalledWith({ to: '/' })
    expect(deps.loadAudioBlob).not.toHaveBeenCalled()
    expect(deps.setSubtitles).not.toHaveBeenCalled()
    expect(deps.setPlaybackTrackId).not.toHaveBeenCalled()
    expect(deps.play).not.toHaveBeenCalled()
  })
})
