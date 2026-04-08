import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { TRACK_SOURCE } from '../../db/types'
import type { Favorite, PlaybackSession } from '../../dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../../discovery'
import { PLAYBACK_REQUEST_MODE } from '../playbackMode'
import {
  playFavoriteWithDeps,
  playFeedEpisodeWithDeps,
  playHistorySessionWithDeps,
  playSearchEpisodeWithDeps,
  playStreamWithoutTranscriptWithDeps,
} from '../remotePlayback'

const autoIngestEpisodeTranscriptMock = vi.fn()
const trackExistsMock = vi.fn().mockResolvedValue(true)

vi.mock('../../remoteTranscript', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../remoteTranscript')>()
  return {
    ...actual,
    autoIngestEpisodeTranscript: (...args: unknown[]) => autoIngestEpisodeTranscriptMock(...args),
    getAsrSettingsSnapshot: vi.fn().mockReturnValue({
      asrProvider: 'groq',
      asrModel: 'whisper-large-v3',
    }),
  }
})

vi.mock('../playbackSource', () => ({
  resolvePlaybackSource: vi.fn().mockImplementation((url: string) => Promise.resolve({ url })),
}))

vi.mock('../../dexieDb', () => ({
  db: {
    tracks: {
      get: vi
        .fn()
        .mockImplementation((_id: string) =>
          Promise.resolve(
            _id === 'track-1' ? { id: _id, sourceType: TRACK_SOURCE.USER_UPLOAD } : null
          )
        ),
    },
  },
}))

const { getJsonMock, downloadEpisodeMock } = vi.hoisted(() => ({
  getJsonMock: vi.fn().mockReturnValue(null),
  downloadEpisodeMock: vi.fn().mockResolvedValue({ ok: true }),
}))

vi.mock('../../storage', () => ({
  getJson: (...args: unknown[]) => getJsonMock(...args),
}))

vi.mock('../../downloadService', () => ({
  downloadEpisode: (...args: unknown[]) => downloadEpisodeMock(...args),
}))

vi.mock('../../db/credentialsRepository', () => ({
  getCredential: vi.fn().mockResolvedValue('fake-key'),
  getAsrCredentialKey: vi.fn().mockReturnValue('asrKey'),
}))

vi.mock('../../repositories/PlaybackRepository', () => ({
  PlaybackRepository: {
    trackExists: (...args: unknown[]) => trackExistsMock(...args),
  },
}))

describe('remotePlayback', () => {
  beforeEach(() => {
    autoIngestEpisodeTranscriptMock.mockReset()
    getJsonMock.mockReset().mockReturnValue(null)
    downloadEpisodeMock.mockReset().mockResolvedValue({ ok: true })
    trackExistsMock.mockReset().mockResolvedValue(true)
    useTranscriptStore.getState().resetTranscript()
  })

  it('starts transcript-bearing feed episode playback without blocking on transcript fetch', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const episode = {
      id: 'ep-1',
      title: 'Episode',
      audioUrl: 'https://example.com/audio.mp3',
      transcriptUrl: 'https://example.com/ep.srt',
    } as Episode
    const podcast = { collectionName: 'Podcast' } as Podcast

    const startPromise = playFeedEpisodeWithDeps(
      { setAudioUrl, play, pause, setPlaybackTrackId },
      episode,
      podcast,
      {
        countryAtSave: 'us',
      }
    )

    await startPromise

    expect(setAudioUrl).toHaveBeenCalledTimes(2)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)
    expect(setPlaybackTrackId).not.toHaveBeenCalled()
    expect(setAudioUrl.mock.invocationCallOrder[1]).toBeLessThan(play.mock.invocationCallOrder[0])
    expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
      'https://example.com/ep.srt',
      'https://example.com/audio.mp3'
    )
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('loading')
  })

  it('does not enter blocking download when transcriptUrl exists even if ASR is configured', async () => {
    getJsonMock.mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper-large-v3' })
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const episode = {
      id: 'ep-transcript-first',
      title: 'Transcript First Episode',
      audioUrl: 'https://example.com/transcript-first.mp3',
      transcriptUrl: 'https://example.com/transcript-first.vtt',
    } as Episode

    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause, setPlaybackTrackId }, episode, {
      collectionName: 'Podcast',
    } as Podcast)

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalledTimes(1)
    expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
      'https://example.com/transcript-first.vtt',
      'https://example.com/transcript-first.mp3'
    )
  })

  it('enforces ASR download blocking logic and passes AbortSignal when ASR is configured', async () => {
    getJsonMock.mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper' })
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setPlaybackTrackId = vi.fn()

    const episode = { audioUrl: 'https://example.com/no-transcript.mp3' } as Episode

    await playFeedEpisodeWithDeps(
      { setAudioUrl, play, pause, setPlaybackTrackId },
      episode,
      {} as Podcast
    )

    expect(downloadEpisodeMock).toHaveBeenCalledTimes(1)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(downloadEpisodeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        audioUrl: 'https://example.com/no-transcript.mp3',
        signal: expect.any(Object),
      })
    )
    // setPlaybackTrackId is called only if a local track is resolved.
    expect(setPlaybackTrackId).not.toHaveBeenCalled()
    // setAudioUrl called twice:
    // 1. Immediate reset (null URL)
    // 2. After download completion (same URL as original payload in this test)
    expect(setAudioUrl).toHaveBeenCalledTimes(2)
  })

  it('plays search episode and invokes transcript ingest with undefined transcript URL', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const episode = {
      episodeUrl: 'https://example.com/search.mp3',
      trackName: 'Search',
      providerEpisodeId: 999,
      collectionName: 'Podcast',
    } as SearchEpisode

    await playSearchEpisodeWithDeps({ setAudioUrl, play, pause }, episode, { countryAtSave: 'jp' })
    // 1. Immediate reset (null URL)
    // 2. Final resolution (remote URL)
    expect(setAudioUrl).toHaveBeenCalledTimes(2)
    expect(play).toHaveBeenCalledTimes(1)
    expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
      undefined,
      'https://example.com/search.mp3'
    )
  })

  it('plays favorite with transcript ingest', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const favorite = {
      id: 'fav-1',
      key: 'k',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/favorite.mp3',
      episodeTitle: 'Favorite',
      podcastTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      addedAt: Date.now(),
      transcriptUrl: 'https://example.com/favorite.srt',
    } as Favorite

    await playFavoriteWithDeps({ setAudioUrl, play, pause }, favorite)
    expect(setAudioUrl).toHaveBeenCalledTimes(2)
    expect(setAudioUrl.mock.calls[0]).toEqual([
      null,
      'Favorite',
      'https://example.com/art.jpg',
      expect.objectContaining({
        originalAudioUrl: 'https://example.com/favorite.mp3',
        transcriptUrl: 'https://example.com/favorite.srt',
      }),
      true,
    ])
    expect(setAudioUrl.mock.calls[1]).toEqual([
      'https://example.com/favorite.mp3',
      'Favorite',
      'https://example.com/art.jpg',
      expect.any(Object),
      true,
    ])
    expect(play).toHaveBeenCalledTimes(1)
    expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
      'https://example.com/favorite.srt',
      'https://example.com/favorite.mp3'
    )
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
  })

  it('preserves history session semantics for setSessionId and setPlaybackTrackId', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const setSessionId = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const pause = vi.fn()
    const session = {
      id: 'session-1',
      source: 'local', // Must be 'local' for setPlaybackTrackId to be called
      title: 'History',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 0,
      durationSeconds: 60,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/history.mp3',
      localTrackId: 'track-1',
      transcriptUrl: 'https://example.com/history.srt',
    } as PlaybackSession

    const result = await playHistorySessionWithDeps(
      { setAudioUrl, play, pause, setSessionId, setPlaybackTrackId },
      session
    )

    expect(result).toBe(true)
    expect(pause).toHaveBeenCalledTimes(1)
    expect(setPlaybackTrackId).toHaveBeenCalledWith('track-1')
    expect(setSessionId).toHaveBeenCalledWith('session-1')
    expect(autoIngestEpisodeTranscriptMock).toHaveBeenCalledWith(
      'https://example.com/history.srt',
      'https://example.com/history.mp3'
    )
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
  })

  it('implements latest-request-wins via epoch guard', async () => {
    // We need to mock resolvePlaybackSource and delay it
    const playbackSource = await import('../playbackSource')
    vi.mocked(playbackSource.resolvePlaybackSource).mockImplementation(async (url) => {
      if (url === 'https://example.com/slow.mp3') {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return { url }
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const deps = { setAudioUrl, play, pause }

    const ep1 = { audioUrl: 'https://example.com/slow.mp3', title: 'Slow' } as Episode
    const ep2 = { audioUrl: 'https://example.com/fast.mp3', title: 'Fast' } as Episode
    const pod = { collectionName: 'Pod' } as Podcast

    // Start slow playback, then immediately start fast playback
    const p1 = playFeedEpisodeWithDeps(deps, ep1, pod)
    const p2 = playFeedEpisodeWithDeps(deps, ep2, pod)

    await Promise.all([p1, p2])

    // ep1 (slow) should have been aborted by the epoch guard after resolvePlaybackSource.
    // However, BOTH ep1 and ep2 call pause() and setAudioUrl(null, ...) immediately.
    // Then ep2 finishes resolve and calls setAudioUrl with final URL.
    // 1. ep1.setAudioUrl(null, ...)
    // 2. ep2.setAudioUrl(null, ...)
    // 3. ep2.setAudioUrl(fast.mp3, ...)
    expect(setAudioUrl).toHaveBeenCalledTimes(3)
    expect(pause).toHaveBeenCalledTimes(2)
    // The LAST call should be ep2's final resolution
    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'https://example.com/fast.mp3',
      'Fast',
      expect.anything(),
      expect.anything(),
      true
    )
  })

  it('does NOT clear audio source when ASR download finishes but request is stale', async () => {
    getJsonMock.mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper' })
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()

    const ep1 = {
      id: 'ep-1',
      title: 'Slow Episode',
      audioUrl: 'https://example.com/slow.mp3',
    } as Episode
    const ep2 = {
      id: 'ep-2',
      title: 'Fast Episode',
      audioUrl: 'https://example.com/fast.mp3',
    } as Episode
    const pod = { collectionName: 'Podcast' } as Podcast

    // ep1 will be slow because we'll delay the download
    downloadEpisodeMock.mockImplementation(async (options) => {
      if (options.audioUrl === 'https://example.com/slow.mp3') {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return { ok: true }
    })

    const p1 = playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, ep1, pod)
    // Synchronously bump epoch by starting ep2 immediately
    const p2 = playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, ep2, pod)

    await Promise.all([p1, p2])

    // With "Immediate Null" pattern, we expect:
    // 1. ep1 calls setAudioUrl(null, ...)
    // 2. ep2 calls setAudioUrl(null, ...)
    // 3. ep2 calls setAudioUrl(remoteUrl, ...)
    // ep1 (slow) should NOT call setAudioUrl again after its stale download finishes.
    expect(setAudioUrl).toHaveBeenCalledTimes(3)

    // Verify ep1 didn't call setAudioUrl(null) again after p2 started
    // The first two calls are the null-metadata resets.
    expect(setAudioUrl.mock.calls[0][0]).toBeNull()
    expect(setAudioUrl.mock.calls[0][1]).toBe('Slow Episode')
    expect(setAudioUrl.mock.calls[1][0]).toBeNull()
    expect(setAudioUrl.mock.calls[1][1]).toBe('Fast Episode')
    expect(setAudioUrl.mock.calls[2][0]).not.toBeNull()
  })

  it('clears audio source when ASR download fails and it is NOT stale', async () => {
    getJsonMock.mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper' })
    downloadEpisodeMock.mockResolvedValue({ ok: false }) // Failed
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()

    const ep = {
      id: 'ep-1',
      title: 'Failed Episode',
      audioUrl: 'https://example.com/fail.mp3',
    } as Episode

    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, ep, {} as Podcast)

    // First call is the immediate reset, second call is the failure cleanup setAudioUrl(null)
    expect(setAudioUrl).toHaveBeenCalledTimes(2)
    expect(setAudioUrl).toHaveBeenLastCalledWith(null)
  })

  it('skips ASR download blocking if API key is missing', async () => {
    const { getCredential } = await import('../../db/credentialsRepository')
    vi.mocked(getCredential).mockResolvedValue('') // Empty key

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()

    const ep = { audioUrl: 'https://example.com/audio.mp3' } as Episode
    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, ep, {} as Podcast)

    // Should NOT trigger download because key is missing
    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(play).toHaveBeenCalled()
  })

  it('streams without transcript by skipping download and auto-ingest, and clears stale transcript', async () => {
    getJsonMock.mockReturnValue({ asrProvider: 'groq', asrModel: 'whisper' })
    useTranscriptStore.getState().setSubtitles([{ start: 0, end: 1, text: 'stale' }])

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const episode = {
      audioUrl: 'https://example.com/no-transcript.mp3',
      title: 'Stream',
    } as Episode

    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, episode, {} as Podcast, {
      mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
    })

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(autoIngestEpisodeTranscriptMock).not.toHaveBeenCalled()
    expect(useTranscriptStore.getState().subtitles).toHaveLength(0)
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('prefers local downloaded audio in stream-without-transcript mode', async () => {
    const playbackSource = await import('../playbackSource')
    vi.mocked(playbackSource.resolvePlaybackSource).mockResolvedValueOnce({
      url: 'blob:downloaded-episode',
      trackId: 'track-local-1',
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const episode = {
      audioUrl: 'https://example.com/already-downloaded.mp3',
      title: 'Downloaded Episode',
    } as Episode

    await playFeedEpisodeWithDeps(
      { setAudioUrl, play, pause, setPlaybackTrackId },
      episode,
      {} as Podcast,
      { mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT }
    )

    expect(downloadEpisodeMock).not.toHaveBeenCalled()
    expect(autoIngestEpisodeTranscriptMock).not.toHaveBeenCalled()
    expect(playbackSource.resolvePlaybackSource).toHaveBeenCalledWith(
      'https://example.com/already-downloaded.mp3'
    )
    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'blob:downloaded-episode',
      'Downloaded Episode',
      expect.any(String),
      expect.any(Object),
      true
    )
    expect(setPlaybackTrackId).toHaveBeenCalledWith(null)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('uses podcastTitle as fallback title and does not leak episodeId', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const episode = {
      audioUrl: 'https://example.com/title-fallback.mp3',
      title: '   ',
      podcastTitle: 'Podcast Fallback Title',
      providerEpisodeId: 'episode-id-should-not-leak',
    } as unknown as Episode
    const podcast = { collectionName: 'Podcast Fallback Title' } as Podcast

    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, episode, podcast)

    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'https://example.com/title-fallback.mp3',
      'Podcast Fallback Title',
      expect.any(String),
      expect.any(Object),
      true
    )
    expect(setAudioUrl).not.toHaveBeenLastCalledWith(
      expect.anything(),
      'episode-id-should-not-leak',
      expect.anything(),
      expect.anything(),
      expect.anything()
    )
  })

  it('falls back to neutral untitled title when title and podcastTitle are empty', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const episode = {
      audioUrl: 'https://example.com/untitled-fallback.mp3',
      title: '   ',
      transcriptUrl: 'https://example.com/untitled.srt',
    } as Episode

    await playFeedEpisodeWithDeps({ setAudioUrl, play, pause }, episode, {} as Podcast)

    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'https://example.com/untitled-fallback.mp3',
      'Untitled',
      expect.any(String),
      expect.any(Object),
      true
    )
  })

  it('allows stream-without-transcript playback with local source candidate only', async () => {
    const playbackSource = await import('../playbackSource')
    vi.mocked(playbackSource.resolvePlaybackSource).mockResolvedValueOnce({
      url: 'blob:downloads-only-source',
      trackId: 'track-local-2',
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const startResult = await playStreamWithoutTranscriptWithDeps(
      { setAudioUrl, play, pause },
      {
        streamTarget: {
          sourceUrlNormalized: 'https://example.com/downloads-only.mp3',
        },
        title: 'Downloads Only',
        artwork: '',
        metadata: { originalAudioUrl: 'https://example.com/downloads-only.mp3' },
      }
    )

    expect(startResult).toEqual({ started: true, reason: 'started' })
    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'blob:downloads-only-source',
      'Downloads Only',
      '',
      expect.any(Object),
      true
    )
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('returns false for stream-without-transcript when request becomes stale before start', async () => {
    const playbackSource = await import('../playbackSource')
    vi.mocked(playbackSource.resolvePlaybackSource).mockImplementation(async (url: string) => {
      if (url === 'https://example.com/stale-stream.mp3') {
        await new Promise((resolve) => setTimeout(resolve, 50))
      }
      return { url }
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()

    const staleRequest = playStreamWithoutTranscriptWithDeps(
      { setAudioUrl, play, pause },
      {
        streamTarget: { sourceUrlNormalized: 'https://example.com/stale-stream.mp3' },
        title: 'Stale Stream',
        artwork: '',
        metadata: { originalAudioUrl: 'https://example.com/stale-stream.mp3' },
      }
    )

    const episode = {
      audioUrl: 'https://example.com/next.mp3',
      title: 'Next Episode',
      transcriptUrl: 'https://example.com/next.srt',
    } as Episode
    const supersedingRequest = playFeedEpisodeWithDeps(
      { setAudioUrl, play, pause },
      episode,
      {} as Podcast
    )

    const [startResult] = await Promise.all([staleRequest, supersedingRequest])

    expect(startResult).toEqual({ started: false, reason: 'stale' })
  })

  it('does not call play for stale history request after async onReadyToPlay work', async () => {
    trackExistsMock.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
      return true
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setSessionId = vi.fn()
    const setPlaybackTrackId = vi.fn()

    const historySession = {
      id: 'session-slow-history',
      source: 'local',
      title: 'Slow History',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 0,
      durationSeconds: 60,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 0,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/slow-history.mp3',
      localTrackId: 'track-1',
      transcriptUrl: 'https://example.com/slow-history.srt',
    } as PlaybackSession

    const supersedingEpisode = {
      audioUrl: 'https://example.com/next-after-history.mp3',
      title: 'Next Episode',
      transcriptUrl: 'https://example.com/next-after-history.srt',
    } as Episode

    const slowHistory = playHistorySessionWithDeps(
      { setAudioUrl, play, pause, setSessionId, setPlaybackTrackId },
      historySession
    )
    const supersedingPlay = playFeedEpisodeWithDeps(
      { setAudioUrl, play, pause },
      supersedingEpisode,
      {} as Podcast
    )

    const [historyResult] = await Promise.all([slowHistory, supersedingPlay])

    expect(historyResult).toBe(false)
    expect(play).toHaveBeenCalledTimes(1)
    expect(setSessionId).not.toHaveBeenCalledWith('session-slow-history')
  })

  it('returns false for stream-without-transcript when no playable source candidate exists', async () => {
    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()

    const startResult = await playStreamWithoutTranscriptWithDeps(
      { setAudioUrl, play, pause },
      {
        streamTarget: {},
        title: 'No Source',
        artwork: '',
        metadata: {},
      }
    )

    expect(startResult).toEqual({ started: false, reason: 'no_playable_source' })
    expect(play).not.toHaveBeenCalled()
  })

  it('prefers local downloaded source for history stream-without-transcript playback', async () => {
    const playbackSource = await import('../playbackSource')
    vi.mocked(playbackSource.resolvePlaybackSource).mockResolvedValueOnce({
      url: 'blob:history-downloaded',
      trackId: 'history-track-1',
    })

    const setAudioUrl = vi.fn()
    const play = vi.fn()
    const pause = vi.fn()
    const setSessionId = vi.fn()
    const setPlaybackTrackId = vi.fn()
    const session = {
      id: 'session-stream',
      source: 'explore',
      title: 'History Stream',
      createdAt: 1,
      lastPlayedAt: 1,
      sizeBytes: 0,
      durationSeconds: 10,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 5,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/history-downloaded.mp3',
      localTrackId: 'history-track-1',
    } as PlaybackSession

    const didPlay = await playHistorySessionWithDeps(
      { setAudioUrl, play, pause, setSessionId, setPlaybackTrackId },
      session,
      { mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT }
    )

    expect(didPlay).toBe(true)
    expect(setAudioUrl).toHaveBeenLastCalledWith(
      'blob:history-downloaded',
      'History Stream',
      '',
      expect.any(Object),
      true
    )
    expect(setSessionId).toHaveBeenCalledWith('session-stream')
    expect(setPlaybackTrackId).toHaveBeenCalledWith(null)
    expect(play).toHaveBeenCalledTimes(1)
  })
})
