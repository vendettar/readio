// src/__tests__/playerStore.test.ts
import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerStore } from '../store/playerStore'

describe('PlayerStore', () => {
  beforeEach(() => {
    // Reset store between tests
    usePlayerStore.setState({
      audioLoaded: false,
      audioUrl: '',
      audioTitle: '',
      coverArtUrl: '',
      isPlaying: false,
      progress: 0,
      duration: 0,
      subtitles: [],
      subtitlesLoaded: false,
      currentIndex: -1,
    })
  })

  describe('Audio State', () => {
    it('should clear episodeMetadata by default when setting audio URL', () => {
      const { setAudioUrl, setEpisodeMetadata } = usePlayerStore.getState()

      // Set some metadata first
      setEpisodeMetadata({ description: 'Existing metadata' })
      expect(usePlayerStore.getState().episodeMetadata?.description).toBe('Existing metadata')

      // Change track without metadata
      setAudioUrl('http://example.com/new.mp3')

      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBe('http://example.com/new.mp3')
      expect(state.episodeMetadata).toBeNull()
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

    it('should toggle play/pause', () => {
      const { togglePlayPause } = usePlayerStore.getState()

      expect(usePlayerStore.getState().isPlaying).toBe(false)
      togglePlayPause()
      expect(usePlayerStore.getState().isPlaying).toBe(true)
      togglePlayPause()
      expect(usePlayerStore.getState().isPlaying).toBe(false)
    })

    it('should update progress', () => {
      const { setProgress } = usePlayerStore.getState()

      setProgress(30.5)
      expect(usePlayerStore.getState().progress).toBe(30.5)
    })

    it('should clamp seekTo values within [0, duration]', () => {
      const { seekTo, setDuration } = usePlayerStore.getState()
      setDuration(100)

      // Within range
      seekTo(50)
      expect(usePlayerStore.getState().progress).toBe(50)

      // Below 0
      seekTo(-10)
      expect(usePlayerStore.getState().progress).toBe(0)

      // Above duration
      seekTo(150)
      expect(usePlayerStore.getState().progress).toBe(100)
    })

    it('should allow seek to any positive value if duration is unknown (0)', () => {
      const { seekTo, setDuration } = usePlayerStore.getState()
      setDuration(0)

      seekTo(50)
      expect(usePlayerStore.getState().progress).toBe(50)

      seekTo(-5)
      expect(usePlayerStore.getState().progress).toBe(0)
    })
  })

  describe('Subtitles State', () => {
    it('should set subtitles', () => {
      const { setSubtitles } = usePlayerStore.getState()
      const subs = [
        { start: 0, end: 5, text: 'Hello' },
        { start: 5, end: 10, text: 'World' },
      ]

      setSubtitles(subs)

      const state = usePlayerStore.getState()
      expect(state.subtitles).toHaveLength(2)
      expect(state.subtitlesLoaded).toBe(true)
    })

    it('should update current index', () => {
      const { setCurrentIndex } = usePlayerStore.getState()

      setCurrentIndex(5)
      expect(usePlayerStore.getState().currentIndex).toBe(5)
    })
  })

  describe('Reset', () => {
    it('should reset to initial state', () => {
      const { setAudioUrl, setProgress, reset } = usePlayerStore.getState()

      setAudioUrl('http://example.com/audio.mp3')
      setProgress(100)
      reset()

      const state = usePlayerStore.getState()
      expect(state.audioUrl).toBe('')
      expect(state.progress).toBe(0)
      expect(state.audioLoaded).toBe(false)
    })
  })
})
