import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { FeedEpisode } from '../../discovery'
import { downloadEpisode, removeDownloadedTrack } from '../../downloadService'
import * as playbackSource from '../playbackSource'
import { bumpPlaybackEpoch, playFeedEpisodeWithDeps } from '../remotePlayback'

// Mock dependencies
vi.mock('../../downloadService', () => ({
  downloadEpisode: vi.fn(),
  removeDownloadedTrack: vi.fn().mockResolvedValue(true),
  normalizePodcastAudioUrl: (url: string) => url,
  findDownloadedTrack: vi.fn(),
}))

vi.mock('../../remoteTranscript', () => ({
  autoIngestEpisodeTranscript: vi.fn(),
  getAsrSettingsSnapshot: () => ({ asrProvider: 'groq', asrModel: 'whisper-1' }),
  getValidTranscriptUrl: (url: string | null | undefined) => url || null,
}))

vi.mock('../../db/credentialsRepository', () => ({
  getCredential: vi.fn().mockResolvedValue('fake-api-key-value'),
  getAsrCredentialKey: () => 'provider_asr_key',
}))

describe('remotePlayback ASR-Fallback Regression', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    bumpPlaybackEpoch()
  })

  it('detects dirty track and retries download once', async () => {
    const setAudioUrlSpy = vi.fn()
    const playSpy = vi.fn()
    const pauseSpy = vi.fn()
    const setPlaybackTrackIdSpy = vi.fn()

    const audioUrl = 'https://example.com/audio.mp3'
    // Ensure transcriptUrl is missing to trigger ASR blocking
    const episode: FeedEpisode = {
      episodeGuid: 'ep1',
      audioUrl,
      title: 'Test',
      description: 'Desc',
      descriptionHtml: undefined,
      pubDate: '2025-01-01T00:00:00.000Z',
      transcriptUrl: undefined,
    }
    const podcast = {
      podcastItunesId: '123',
      title: 'Pod',
      feedUrl: 'https://feed.com',
      author: 'Author',
      artwork: 'https://example.com/art.jpg',
      description: 'Description',
      lastUpdateTime: 1700000000000,
      episodeCount: 10,
      language: 'en',
      genres: ['Technology'],
      dead: false,
    }

    const resolveSpy = vi.spyOn(playbackSource, 'resolvePlaybackSource')

    // Attempt 1: Returns a remote URL but WITH a trackId (the "dirty track" marker)
    resolveSpy.mockResolvedValueOnce({ url: audioUrl, trackId: 'dirty-track-123' })

    // Attempt 2: After the first retry in downloadAndResolve, we return the fake remote URL again (so it recurses once)
    // Wait, downloadAndResolve will call resolvePlaybackSource AGAIN.
    // 1st resolve in playRemotePayload -> returns dirty-track-123
    // 2nd resolve in downloadAndResolve -> returns dirty-track-123 (triggers retry)
    // 3rd resolve in the retried downloadAndResolve -> returns clean-blob-url (success)

    resolveSpy.mockResolvedValueOnce({ url: audioUrl, trackId: 'dirty-track-123' }) // for 1st downloadAndResolve
    resolveSpy.mockResolvedValueOnce({ url: 'blob:local-audio-123', trackId: 'clean-track-123' }) // for 2nd (retry) downloadAndResolve

    vi.mocked(downloadEpisode).mockResolvedValue({ ok: true, trackId: 'existing-id' })

    await playFeedEpisodeWithDeps(
      {
        setAudioUrl: setAudioUrlSpy,
        play: playSpy,
        pause: pauseSpy,
        setPlaybackTrackId: setPlaybackTrackIdSpy,
      },
      episode,
      podcast,
      { countryAtSave: 'us' }
    )

    // Verify it called removeDownloadedTrack for the dirty track
    expect(removeDownloadedTrack).toHaveBeenCalledWith('dirty-track-123')

    // Verify it eventually set the blob URL
    expect(setAudioUrlSpy).toHaveBeenCalledWith(
      'blob:local-audio-123',
      expect.any(String),
      expect.anything(),
      expect.anything(),
      true
    )

    expect(setPlaybackTrackIdSpy).toHaveBeenCalledWith('clean-track-123')

    resolveSpy.mockRestore()
  })
})
