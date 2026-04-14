import { act, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../lib/dexieDb'
import { usePlayerStore } from '../playerStore'
import { usePlayerSurfaceStore } from '../playerSurfaceStore'

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
}))

vi.mock('../../hooks/useImageObjectUrl', () => ({ useImageObjectUrl: () => null }))
vi.mock('../../hooks/useMediaSession', () => ({ useMediaSession: vi.fn() }))
vi.mock('../../hooks/usePageVisibility', () => ({ usePageVisibility: () => true }))
vi.mock('../../hooks/useSession', () => ({
  useSession: () => ({ restoreProgress: vi.fn() }),
}))
vi.mock('../../hooks/useTabSync', () => ({ useTabSync: vi.fn() }))
vi.mock('../../lib/toast', () => ({ toast: { infoKey: vi.fn(), errorKey: vi.fn() } }))

vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-local-url')
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

describe('playerStore - Session Restore Prefer Local Download', () => {
  beforeEach(async () => {
    const { result } = renderHook(() => usePlayerStore())
    act(() => {
      result.current.reset()
      usePlayerSurfaceStore.getState().reset()
    })
    await DB.clearAllData()
    vi.clearAllMocks()
  })

  it('restores from local blob when remote session matches a later download', async () => {
    const remoteUrl = 'https://example.com/episodes/my-episode.mp3'

    await DB.createPlaybackSession({
      id: 'session-remote-1',
      audioUrl: remoteUrl,
      progress: 95,
      durationSeconds: 300,
      source: 'explore',
      title: 'My Episode',
      podcastTitle: 'My Podcast',
    })

    const mockAudioBlob = new Blob(['downloaded audio'], { type: 'audio/mp3' })
    const audioId = await DB.addAudioBlob(mockAudioBlob, 'my-episode.mp3')

    const downloadedTrackId = await DB.addPodcastDownload({
      name: 'my-episode.mp3',
      audioId,
      sizeBytes: mockAudioBlob.size,
      sourceUrlNormalized: remoteUrl,
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      countryAtSave: 'US',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.audioUrl).toBe('blob:mock-local-url')
    expect(result.current.audioLoaded).toBe(true)
    expect(result.current.localTrackId).toBe(downloadedTrackId)
    expect(result.current.progress).toBe(95)
    expect(result.current.sessionId).toBe('session-remote-1')
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(true)
    expect(result.current.isPlaying).toBe(false)
  })

  it('falls back to remote URL when no matching download exists', async () => {
    const remoteUrl = 'https://example.com/episodes/unique-episode.mp3'

    await DB.createPlaybackSession({
      id: 'session-remote-2',
      audioUrl: remoteUrl,
      progress: 60,
      source: 'explore',
      title: 'Unique Episode',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.audioUrl).toBe(remoteUrl)
    expect(result.current.audioLoaded).toBe(true)
    expect(result.current.progress).toBe(60)
    expect(result.current.sessionId).toBe('session-remote-2')
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(true)
  })

  it('falls back to remote when download record exists but blob is missing', async () => {
    const remoteUrl = 'https://example.com/episodes/missing-blob.mp3'

    await DB.createPlaybackSession({
      id: 'session-remote-3',
      audioUrl: remoteUrl,
      progress: 30,
      source: 'explore',
      title: 'Missing Blob Episode',
    })

    await DB.addPodcastDownload({
      name: 'missing-blob.mp3',
      audioId: 'non-existent-audio-id',
      sizeBytes: 0,
      sourceUrlNormalized: remoteUrl,
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      countryAtSave: 'US',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.audioUrl).toBe(remoteUrl)
    expect(result.current.audioLoaded).toBe(true)
    expect(result.current.progress).toBe(30)
    expect(result.current.sessionId).toBe('session-remote-3')
  })

  it('existing local-session restore path still works unchanged', async () => {
    const mockBlob = new Blob(['local audio'], { type: 'audio/mp3' })
    const audioId = await DB.addAudioBlob(mockBlob, 'local-file.mp3')

    await DB.createPlaybackSession({
      id: 'session-local',
      audioId,
      audioFilename: 'local-file.mp3',
      hasAudioBlob: true,
      progress: 120,
      durationSeconds: 240,
      source: 'local',
      title: 'local-file.mp3',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.audioUrl).toBe('blob:mock-local-url')
    expect(result.current.audioLoaded).toBe(true)
    expect(result.current.progress).toBe(120)
    expect(result.current.duration).toBe(240)
    expect(result.current.sessionId).toBe('session-local')
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(true)
  })

  it('preserves session identity and progress after local preference', async () => {
    const remoteUrl = 'https://cdn.podcast.com/shows/ep42.mp3?utm_source=foo'

    await DB.createPlaybackSession({
      id: 'session-identity',
      audioUrl: remoteUrl,
      progress: 180.5,
      durationSeconds: 360,
      source: 'explore',
      title: 'Episode 42',
      podcastTitle: 'Test Show',
      podcastFeedUrl: 'https://feeds.example.com/test-show',
      description: 'A great episode',
      artworkUrl: 'https://example.com/art.jpg',
      publishedAt: 1700000000,
      episodeGuid: 'ep-guid-42',
      podcastItunesId: 'pod-123',
      providerEpisodeId: 'ep-456',
      transcriptUrl: 'https://example.com/transcript.vtt',
      countryAtSave: 'US',
    })

    const mockBlob = new Blob(['ep42 audio'], { type: 'audio/mpeg' })
    const audioId = await DB.addAudioBlob(mockBlob, 'ep42.mp3')

    const downloadedTrackId = await DB.addPodcastDownload({
      name: 'ep42.mp3',
      audioId,
      sizeBytes: mockBlob.size,
      sourceUrlNormalized: 'https://cdn.podcast.com/shows/ep42.mp3',
      lastAccessedAt: Date.now(),
      downloadedAt: Date.now(),
      countryAtSave: 'US',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.sessionId).toBe('session-identity')
    expect(result.current.localTrackId).toBe(downloadedTrackId)
    expect(result.current.progress).toBe(180.5)
    expect(result.current.audioTitle).toBe('Episode 42')

    const meta = result.current.episodeMetadata
    expect(meta?.podcastTitle).toBe('Test Show')
    expect(meta?.podcastFeedUrl).toBe('https://feeds.example.com/test-show')
    expect(meta?.description).toBe('A great episode')
    expect(meta?.artworkUrl).toBe('https://example.com/art.jpg')
    expect(meta?.publishedAt).toBe(1700000000)
    expect(meta?.episodeGuid).toBe('ep-guid-42')
    expect(meta?.podcastItunesId).toBe('pod-123')
    expect(meta?.providerEpisodeId).toBe('ep-456')
    expect(meta?.transcriptUrl).toBe('https://example.com/transcript.vtt')

    expect(result.current.audioUrl).toBe('blob:mock-local-url')
    expect(result.current.audioLoaded).toBe(true)
  })
})
