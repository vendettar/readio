import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../dexieDb'
import { loadPlayerSessionRestore } from '../session/playerSessionRestoreService'

vi.mock('../../logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-restore-url')
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

function makePodcastDownloadInput(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Test Episode',
    audioId: 'audio-1',
    sourceUrlNormalized: 'https://example.com/ep.mp3',
    downloadedAt: Date.now(),
    sizeBytes: 1024,
    countryAtSave: 'US',
    sourcePodcastItunesId: 'podcast-1',
    sourceEpisodeGuid: 'episode-guid-1',
    sourcePodcastTitle: 'Podcast Title',
    sourceEpisodeTitle: 'Episode Title',
    sourceDescription: 'Episode description',
    sourceArtworkUrl: 'https://example.com/cover.jpg',
    ...overrides,
  }
}

describe('loadPlayerSessionRestore', () => {
  beforeEach(async () => {
    await DB.clearAllData()
    vi.clearAllMocks()
  })

  it('returns an empty result when there is no resumable session', async () => {
    const restored = await loadPlayerSessionRestore()

    expect(restored.hasResumableSession).toBe(false)
    expect(restored.durationSeconds).toBeNull()
    expect(restored.restoredState).toBeNull()
    expect(restored.subtitleCues).toBeNull()
  })

  it('restores a local session from its stored audio blob and subtitles', async () => {
    const audioBlob = new Blob(['local audio'], { type: 'audio/mp3' })
    const subtitleId = await DB.addSubtitle([{ start: 0, end: 1, text: 'hello' }], 'local.vtt')
    const audioId = await DB.addAudioBlob(audioBlob, 'local-file.mp3')

    await DB.createPlaybackSession({
      id: 'session-local',
      audioId,
      subtitleId,
      audioFilename: 'local-file.mp3',
      hasAudioBlob: true,
      progress: 120,
      durationSeconds: 240,
      source: 'local',
      title: 'local-file.mp3',
      localTrackId: 'local-track-1',
    })

    const restored = await loadPlayerSessionRestore()

    expect(restored.hasResumableSession).toBe(true)
    expect(restored.durationSeconds).toBe(240)
    expect(restored.restoredState).toEqual(
      expect.objectContaining({
        sessionId: 'session-local',
        audioUrl: 'blob:mock-restore-url',
        audioTitle: 'local-file.mp3',
        localTrackId: 'local-track-1',
        progress: 120,
      })
    )
    expect(restored.subtitleCues).toEqual([{ start: 0, end: 1, text: 'hello' }])
  })

  it('prefers the canonical local download when restoring an explore session', async () => {
    const remoteUrl = 'https://example.com/episodes/my-episode.mp3'
    const audioBlob = new Blob(['downloaded audio'], { type: 'audio/mp3' })
    const audioId = await DB.addAudioBlob(audioBlob, 'my-episode.mp3')

    await DB.createPlaybackSession({
      id: 'session-remote',
      audioUrl: remoteUrl,
      progress: 95,
      durationSeconds: 300,
      source: 'explore',
      title: 'My Episode',
      artworkUrl: 'https://example.com/my-episode-cover.jpg',
      showTitle: 'My Podcast',
      episodeGuid: 'my-episode-guid',
      podcastItunesId: 'my-podcast-id',
      countryAtSave: 'us',
    })

    const downloadedTrackId = await DB.addPodcastDownload(
      makePodcastDownloadInput({
        name: 'my-episode.mp3',
        audioId,
        sizeBytes: audioBlob.size,
        sourceUrlNormalized: remoteUrl,
        sourcePodcastItunesId: 'my-podcast-id',
        sourceEpisodeGuid: 'my-episode-guid',
      })
    )

    const restored = await loadPlayerSessionRestore()

    expect(restored.hasResumableSession).toBe(true)
    expect(restored.restoredState).toEqual(
      expect.objectContaining({
        sessionId: 'session-remote',
        audioUrl: 'blob:mock-restore-url',
        localTrackId: downloadedTrackId,
      })
    )
    expect(restored.restoredState?.episodeMetadata).toEqual(
      expect.objectContaining({
        kind: 'remote-episode',
        podcastItunesId: 'my-podcast-id',
        episodeGuid: 'my-episode-guid',
        originalAudioUrl: remoteUrl,
      })
    )
  })

  it('falls back to the remote audio url when the canonical download blob is missing', async () => {
    const remoteUrl = 'https://example.com/episodes/missing-blob.mp3'

    await DB.createPlaybackSession({
      id: 'session-remote-missing-blob',
      audioUrl: remoteUrl,
      progress: 30,
      durationSeconds: 180,
      source: 'explore',
      title: 'Missing Blob Episode',
      artworkUrl: 'https://example.com/missing-blob-cover.jpg',
      showTitle: 'Missing Blob Podcast',
      episodeGuid: 'missing-blob-guid',
      podcastItunesId: 'missing-blob-podcast-id',
      countryAtSave: 'us',
    })

    await DB.addPodcastDownload(
      makePodcastDownloadInput({
        name: 'missing-blob.mp3',
        audioId: 'non-existent-audio-id',
        sizeBytes: 0,
        sourceUrlNormalized: remoteUrl,
        sourcePodcastItunesId: 'missing-blob-podcast-id',
        sourceEpisodeGuid: 'missing-blob-guid',
      })
    )

    const restored = await loadPlayerSessionRestore()

    expect(restored.hasResumableSession).toBe(true)
    expect(restored.restoredState).toEqual(
      expect.objectContaining({
        sessionId: 'session-remote-missing-blob',
        audioUrl: remoteUrl,
        coverArtUrl: 'https://example.com/missing-blob-cover.jpg',
      })
    )
  })
})
