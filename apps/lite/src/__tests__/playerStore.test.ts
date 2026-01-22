// src/__tests__/playerStore.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../lib/dexieDb'
import { usePlayerStore } from '../store/playerStore'

// Mock DB
vi.mock('../lib/dexieDb', () => ({
  DB: {
    addAudioBlob: vi.fn().mockResolvedValue('audio-1'),
    updatePlaybackSession: vi.fn().mockResolvedValue(undefined),
    getLastPlaybackSession: vi.fn(),
    getAudioBlob: vi.fn(),
    getSubtitle: vi.fn(),
  },
}))

// Mock URL
vi.stubGlobal('URL', {
  createObjectURL: vi.fn(() => 'mock-blob-url'),
  revokeObjectURL: vi.fn(),
})

describe('PlayerStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store between tests
    usePlayerStore.setState({
      audioLoaded: false,
      audioUrl: null,
      audioTitle: '',
      coverArtUrl: '',
      isPlaying: false,
      progress: 0,
      duration: 0,
      sessionId: null,
      initializationStatus: 'idle',
      subtitles: [],
      subtitlesLoaded: false,
      currentIndex: -1,
    })
  })

  describe('Audio State', () => {
    it('should reset session when manually loading audio', async () => {
      const { loadAudio } = usePlayerStore.getState()
      usePlayerStore.setState({ sessionId: 'existing-session', progress: 50 })

      const file = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
      await loadAudio(file)

      const state = usePlayerStore.getState()
      expect(state.sessionId).toBeNull()
      expect(state.progress).toBe(0)
      expect(state.audioUrl).toBe('mock-blob-url')
    })

    it('should set audio URL and metadata atomically', () => {
      const { setAudioUrl } = usePlayerStore.getState()
      const metadata = { description: 'New metadata', podcastTitle: 'New Podcast' }

      setAudioUrl(
        'http://example.com/audio.mp3',
        'Test Episode',
        'http://example.com/cover.jpg',
        metadata
      )

      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBe('http://example.com/audio.mp3')
      expect(state.episodeMetadata).toEqual(metadata)
    })

    it('should update progress and handle setProgress', () => {
      const { setProgress } = usePlayerStore.getState()
      setProgress(30.5)
      expect(usePlayerStore.getState().progress).toBe(30.5)
    })
  })

  describe('Session Restoration', () => {
    it('should restore session atomically', async () => {
      const { restoreSession } = usePlayerStore.getState()
      const mockSession = {
        id: 'restored-id',
        progress: 120,
        duration: 300,
        audioId: 'audio-1',
        audioFilename: 'restored.mp3',
        source: 'local' as const,
        hasAudioBlob: true,
      }

      // biome-ignore lint/suspicious/noExplicitAny: Mocking DB return
      vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(mockSession as any)
      vi.mocked(DB.getAudioBlob).mockResolvedValue({
        id: 'audio-1',
        blob: new Blob(['audio']),
        filename: 'restored.mp3',
        type: 'audio/mpeg',
        size: 5,
        storedAt: Date.now(),
      })

      await restoreSession()

      const state = usePlayerStore.getState()
      expect(state.initializationStatus).toBe('ready')
      expect(state.sessionId).toBe('restored-id')
      expect(state.progress).toBe(120)
      expect(state.audioLoaded).toBe(true)
      expect(state.audioTitle).toBe('restored.mp3')
    })

    it('should restore remote podcast session atomically', async () => {
      const { restoreSession } = usePlayerStore.getState()
      const mockSession = {
        id: 'podcast-id',
        audioUrl: 'https://example.com/podcast.mp3',
        progress: 45,
        title: 'Podcast Episode',
        artworkUrl: 'https://example.com/cover.jpg',
      }
      // biome-ignore lint/suspicious/noExplicitAny: Mocking DB return
      vi.mocked(DB.getLastPlaybackSession).mockResolvedValue(mockSession as any)

      await restoreSession()

      const state = usePlayerStore.getState()
      expect(state.sessionId).toBe('podcast-id')
      expect(state.audioUrl).toBe('https://example.com/podcast.mp3')
      expect(state.progress).toBe(45)
      expect(state.audioLoaded).toBe(true)
      expect(state.coverArtUrl).toBe('https://example.com/cover.jpg')
    })

    it('should fail gracefully if restoration throws', async () => {
      const { restoreSession } = usePlayerStore.getState()
      vi.mocked(DB.getLastPlaybackSession).mockRejectedValue(new Error('DB Error'))

      await restoreSession()

      const state = usePlayerStore.getState()
      expect(state.initializationStatus).toBe('failed')
      expect(state.sessionId).toBeNull()
    })
  })

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const { setAudioUrl, setProgress, reset } = usePlayerStore.getState()

      setAudioUrl('http://example.com/audio.mp3')
      setProgress(100)
      reset()

      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBeNull()
      expect(state.progress).toBe(0)
      expect(state.audioLoaded).toBe(false)
    })
  })

  describe('Clear audio URL', () => {
    it('should clear session state when audio URL is cleared', () => {
      const { setAudioUrl } = usePlayerStore.getState()

      usePlayerStore.setState({
        sessionId: 'session-1',
        progress: 120,
        localTrackId: 'track-1',
        duration: 300,
      })

      setAudioUrl(null)

      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBeNull()
      expect(state.sessionId).toBeNull()
      expect(state.progress).toBe(0)
      expect(state.localTrackId).toBeNull()
      expect(state.duration).toBe(0)
    })
  })
})
