import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryClientWrapper } from '../../__tests__/queryClient'
import { DB, type Favorite } from '../../lib/dexieDb'
import type { FeedEpisode, Podcast } from '../../lib/discovery'
import {
  __resetRemoteTranscriptStateForTests,
  normalizeTranscriptUrl,
} from '../../lib/remoteTranscript'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useEpisodePlayback } from '../useEpisodePlayback'

const { fetchTextWithFallbackMock } = vi.hoisted(() => ({
  fetchTextWithFallbackMock: vi.fn(),
}))

vi.mock('../../lib/fetchUtils', () => ({
  CLOUD_BACKEND_FALLBACK_CLASSES: {
    TRANSCRIPT: 'transcript',
  },
  fetchTextWithFallback: fetchTextWithFallbackMock,
}))

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  warn: vi.fn(),
}))

function makeEpisode(
  overrides: Partial<FeedEpisode> &
    Pick<FeedEpisode, 'audioUrl' | 'title' | 'description' | 'pubDate'> & {
      id?: string
    }
): FeedEpisode {
  const { audioUrl, title, episodeGuid, description, pubDate, ...rest } = overrides
  return {
    audioUrl,
    title,
    episodeGuid: episodeGuid ?? `guid-${audioUrl}`,
    description,
    pubDate,
    ...rest,
  }
}

function makePodcast(overrides: Partial<Podcast> = {}): Podcast {
  return {
    podcastItunesId: '100',
    title: 'Podcast',
    author: 'Host',
    artwork: 'https://example.com/art.jpg',
    description: 'A podcast',
    feedUrl: 'https://example.com/feed.xml',
    lastUpdateTime: 1613394044,
    episodeCount: 50,
    language: 'en',
    genres: ['Technology'],
    ...overrides,
  }
}

function makeFavorite(overrides: Partial<Favorite> = {}): Favorite {
  return {
    id: 'fav-1',
    key: 'https://example.com/feed.xml::https://example.com/fav.mp3',
    feedUrl: 'https://example.com/feed.xml',
    audioUrl: 'https://example.com/fav.mp3',
    episodeTitle: 'Favorite Episode',
    podcastTitle: 'Favorite Podcast',
    artworkUrl: 'https://example.com/art.jpg',
    addedAt: Date.now(),
    transcriptUrl: 'https://example.com/fav.srt',
    countryAtSave: 'us',
    ...overrides,
  }
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

describe('useEpisodePlayback transcript ingestion', () => {
  beforeEach(async () => {
    fetchTextWithFallbackMock.mockReset()
    __resetRemoteTranscriptStateForTests()
    await DB.clearAllData()
    usePlayerStore.getState().reset()
  })

  it('triggers transcript ingestion when transcriptUrl exists', async () => {
    fetchTextWithFallbackMock.mockResolvedValueOnce(`1
00:00:00,000 --> 00:00:01,000
Hello transcript
`)

    const episode = makeEpisode({
      id: 'ep-1',
      audioUrl: 'https://example.com/ep-1.mp3',
      title: 'Episode 1',
      description: 'Desc',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      transcriptUrl: 'https://example.com/ep-1.srt',
    })
    const podcast = makePodcast({ feedUrl: 'https://example.com/feed.xml' })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(episode, podcast)
    })

    await waitFor(() =>
      expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    )
    expect(fetchTextWithFallbackMock).toHaveBeenCalledWith(
      normalizeTranscriptUrl('https://example.com/ep-1.srt'),
      expect.any(Object)
    )
  })

  it('keeps playback non-blocking while transcript fetch is pending', async () => {
    fetchTextWithFallbackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(`1
00:00:00,000 --> 00:00:01,000
Delayed transcript
`),
            80
          )
        })
    )

    const episode = makeEpisode({
      id: 'ep-2',
      audioUrl: 'https://example.com/ep-2.mp3',
      title: 'Episode 2',
      description: 'Desc',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      transcriptUrl: 'https://example.com/ep-2.srt',
    })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(episode, makePodcast())
    })

    await waitFor(() => {
      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBe('https://example.com/ep-2.mp3')
    })
    const state = usePlayerStore.getState()
    const transcriptState = useTranscriptStore.getState()
    expect(state.audioLoaded).toBe(true)
    expect(state.episodeMetadata?.transcriptUrl).toBe('https://example.com/ep-2.srt')
    expect(transcriptState.transcriptIngestionStatus).toBe('loading')
    expect(transcriptState.subtitlesLoaded).toBe(false)

    await waitFor(() => {
      const playerState = usePlayerStore.getState()
      const transcriptState = useTranscriptStore.getState()
      expect(playerState.audioUrl).toBe('https://example.com/ep-2.mp3')
      expect(playerState.audioLoaded).toBe(true)
      expect(playerState.episodeMetadata?.transcriptUrl).toBe('https://example.com/ep-2.srt')
      expect(transcriptState.subtitlesLoaded).toBe(true)
      expect(transcriptState.subtitles[0]?.text).toContain('Delayed transcript')
    })
  })

  it('enters transcript-loading immediately for transcript-bearing playback before preload resolves', async () => {
    fetchTextWithFallbackMock.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(`1
00:00:00,000 --> 00:00:01,000
Delayed transcript
`),
            80
          )
        })
    )

    const episode = makeEpisode({
      id: 'ep-loading',
      audioUrl: 'https://example.com/ep-loading.mp3',
      title: 'Loading Episode',
      description: 'Desc',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      transcriptUrl: 'https://example.com/ep-loading.srt',
    })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(episode, makePodcast())
    })

    await waitFor(() => {
      expect(usePlayerStore.getState().audioUrl).toBe('https://example.com/ep-loading.mp3')
    })

    const playerState = usePlayerStore.getState()
    const transcriptState = useTranscriptStore.getState()
    expect(playerState.audioTitle).toBe('Loading Episode')
    expect(playerState.episodeMetadata?.transcriptUrl).toBe('https://example.com/ep-loading.srt')
    expect(transcriptState.transcriptIngestionStatus).toBe('loading')
    expect(transcriptState.subtitlesLoaded).toBe(false)
  })

  it('prevents late transcript response from overriding the newer track', async () => {
    let now = 1000
    const dateSpy = vi.spyOn(Date, 'now').mockImplementation(() => {
      now += 1
      return now
    })

    fetchTextWithFallbackMock.mockImplementation((url) => {
      if (url.includes('old.srt')) {
        return new Promise((resolve) => {
          setTimeout(() => resolve('1\n00:00:00,000 --> 00:00:01,000\nOld transcript\n'), 60)
        })
      }
      if (url.includes('new.srt')) {
        return new Promise((resolve) => {
          setTimeout(() => resolve('1\n00:00:00,000 --> 00:00:01,000\nNew transcript\n'), 5)
        })
      }
      return Promise.reject(new Error('Unknown URL'))
    })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(
        makeEpisode({
          id: 'ep-old',
          audioUrl: 'https://example.com/old.mp3',
          title: 'Old',
          description: 'Old',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
          transcriptUrl: 'https://example.com/old.srt',
        }),
        makePodcast()
      )
      result.current.playEpisode(
        makeEpisode({
          id: 'ep-new',
          audioUrl: 'https://example.com/new.mp3',
          title: 'New',
          description: 'New',
          pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
          transcriptUrl: 'https://example.com/new.srt',
        }),
        makePodcast()
      )
    })

    await wait(120)
    await waitFor(() => {
      const state = usePlayerStore.getState()
      const tState = useTranscriptStore.getState()
      expect(state.audioUrl).toBe('https://example.com/new.mp3')
      expect(tState.subtitlesLoaded).toBe(true)
      expect(tState.transcriptIngestionStatus).toBe('idle')
    })
    const tState = useTranscriptStore.getState()
    expect(tState.subtitles[0]?.text).toBe('New transcript')
    expect(tState.subtitles.some((cue) => cue.text.includes('Old transcript'))).toBe(false)

    dateSpy.mockRestore()
  })

  it('keeps playback active and marks transcript source as retryable when ingestion fails', async () => {
    fetchTextWithFallbackMock.mockRejectedValueOnce(new Error('network error'))

    const episode = makeEpisode({
      id: 'ep-3',
      audioUrl: 'https://example.com/ep-3.mp3',
      title: 'Episode 3',
      description: 'Desc',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      transcriptUrl: 'https://example.com/ep-3.srt',
    })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(episode, makePodcast())
    })

    await waitFor(() =>
      expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('loading')
    )
    await waitFor(() =>
      expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('failed')
    )
    await waitFor(() => {
      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBe('https://example.com/ep-3.mp3')
    })
    const state = usePlayerStore.getState()
    const transcriptState = useTranscriptStore.getState()
    expect(state.audioLoaded).toBe(true)
    expect(state.status).not.toBe('error')
    expect(transcriptState.transcriptIngestionError?.code).toBe('transcript_fetch_failed')
  })

  it('triggers transcript ingestion when favorite includes transcriptUrl', async () => {
    fetchTextWithFallbackMock.mockResolvedValueOnce(`1
00:00:00,000 --> 00:00:01,000
Favorite transcript
`)

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playFavorite(makeFavorite())
    })

    await wait(20)
    expect(fetchTextWithFallbackMock).toHaveBeenCalledWith(
      normalizeTranscriptUrl('https://example.com/fav.srt'),
      expect.any(Object)
    )
    expect(usePlayerStore.getState().episodeMetadata?.transcriptUrl).toBe(
      'https://example.com/fav.srt'
    )
  })

  it('applies Omny TextWithTimestamps transcript payloads to transcript-bearing playback', async () => {
    fetchTextWithFallbackMock.mockResolvedValueOnce(`00:00:48
If you live in the Northeastern U.S. then you may know someone who has had Lyme disease.

00:01:04
But it's spreading all over the country and parts of the world.

00:01:25
Learn all about this tick-borne disease in this classic episode.`)

    const episode = makeEpisode({
      id: 'ep-omny',
      audioUrl: 'https://example.com/ep-omny.mp3',
      title: 'Episode Omny',
      description: 'Desc',
      pubDate: 'Mon, 01 Jan 2024 00:00:00 GMT',
      transcriptUrl: 'https://api.omny.fm/transcript?format=TextWithTimestamps',
    })

    const { result } = renderHook(() => useEpisodePlayback(), {
      wrapper: createQueryClientWrapper(),
    })
    act(() => {
      result.current.playEpisode(episode, makePodcast())
    })

    await waitFor(() => {
      const transcriptState = useTranscriptStore.getState()
      expect(transcriptState.subtitlesLoaded).toBe(true)
      expect(transcriptState.subtitles[0]?.start).toBe(48)
      expect(transcriptState.subtitles[0]?.text).toContain('Lyme disease')
      expect(transcriptState.subtitles[1]?.start).toBe(64)
      expect(transcriptState.subtitles[1]?.text).toContain('parts of the world')
      expect(transcriptState.subtitles[2]?.start).toBe(85)
      expect(transcriptState.subtitles[2]?.text).toContain('classic episode')
    })
  })
})
