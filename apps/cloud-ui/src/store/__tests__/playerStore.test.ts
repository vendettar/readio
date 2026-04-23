import { act, render, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { createElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GlobalAudioController } from '../../components/AppShell/GlobalAudioController'
import { DB } from '../../lib/dexieDb'
import { usePlayerStore } from '../playerStore'
import { usePlayerSurfaceStore } from '../playerSurfaceStore'
import { useTranscriptStore } from '../transcriptStore'

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

// Mock URL.createObjectURL and URL.revokeObjectURL
// Use spyOn to safely mock without redefinition errors
vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:mock-url')
vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})

describe('playerStore - Session Restoration', () => {
  beforeEach(async () => {
    // Reset Store
    const { result } = renderHook(() => usePlayerStore())
    act(() => {
      result.current.reset()
      usePlayerSurfaceStore.getState().reset()
    })
    // Reset DB
    await DB.clearAllData()
    vi.clearAllMocks()
  })

  it('should regenerate Blob URL from IndexedDB on session restore', async () => {
    // 1. Setup: Seed DB with a previous session and audio blob
    const mockBlob = new Blob(['mock audio data'], { type: 'audio/mp3' })
    const audioId = await DB.addAudioBlob(mockBlob, 'test-song.mp3')

    // Create a session pointing to this audio
    await DB.createPlaybackSession({
      id: 'session-123',
      audioId: audioId,
      audioFilename: 'test-song.mp3',
      hasAudioBlob: true,
      progress: 42.5, // 42.5 seconds in
      durationSeconds: 120,
      source: 'local',
      title: 'test-song.mp3',
    })

    const { result } = renderHook(() => usePlayerStore())

    // 2. Action: Trigger restore
    // We need to wait for the async restoreSession to complete
    await act(async () => {
      await result.current.restoreSession()
    })

    // 3. Assertion: Verify state is restored
    expect(result.current.audioTitle).toBe('test-song.mp3')
    expect(result.current.progress).toBe(42.5)
    expect(result.current.duration).toBe(120)

    // Verify Blob URL generation
    expect(global.URL.createObjectURL).toHaveBeenCalledTimes(1)
    expect(result.current.audioUrl).toBe('blob:mock-url')
    expect(result.current.audioLoaded).toBe(true)
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(true)

    // Verify it didn't auto-play (browser policy safety)
    expect(result.current.isPlaying).toBe(false)
  })

  it('restores localTrackId when restoring a local session', async () => {
    const mockBlob = new Blob(['local audio data'], { type: 'audio/mp3' })
    const audioId = await DB.addAudioBlob(mockBlob, 'local-track.mp3')

    await DB.createPlaybackSession({
      id: 'session-local-track-id',
      audioId,
      audioFilename: 'local-track.mp3',
      hasAudioBlob: true,
      localTrackId: 'local-track-id-1',
      progress: 12,
      source: 'local',
      title: 'local-track.mp3',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.localTrackId).toBe('local-track-id-1')
  })

  it('should handle missing blobs gracefully during restore', async () => {
    // 1. Setup: Session exists but Blob is missing (e.g. cleared by browser)
    await DB.createPlaybackSession({
      id: 'session-ghost',
      audioId: 'missing-audio-id',
      audioFilename: 'ghost.mp3',
      hasAudioBlob: true,
      progress: 10,
      source: 'local',
    })

    const { result } = renderHook(() => usePlayerStore())

    // 2. Action
    await act(async () => {
      await result.current.restoreSession()
    })

    // 3. Assertion: Should remain in idle/empty state, no crash
    expect(result.current.audioUrl).toBeNull()
    expect(result.current.audioLoaded).toBe(false)
    expect(global.URL.createObjectURL).not.toHaveBeenCalled()
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(false)
  })

  it('restores docked capability for remote sessions', async () => {
    await DB.createPlaybackSession({
      id: 'session-remote',
      audioUrl: 'https://example.com/episode.mp3',
      progress: 120,
      durationSeconds: 180,
      source: 'explore',
      title: 'Remote Episode',
      countryAtSave: 'us',
    })

    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.restoreSession()
    })

    expect(result.current.audioLoaded).toBe(true)
    expect(result.current.audioUrl).toBe('https://example.com/episode.mp3')
    expect(result.current.episodeMetadata?.countryAtSave).toBe('us')
    expect(result.current.episodeMetadata?.durationSeconds).toBe(180)
    expect(usePlayerSurfaceStore.getState().canDockedRestore).toBe(true)
  })
})

describe('playerStore - Status & Control Logic', () => {
  beforeEach(async () => {
    const { result } = renderHook(() => usePlayerStore())
    act(() => {
      result.current.reset()
    })
    vi.clearAllMocks()
  })

  it('should treat track as loaded and status as loading even if audioUrl is null but title is present', () => {
    const { result } = renderHook(() => usePlayerStore())

    expect(result.current.audioLoaded).toBe(false)
    expect(result.current.status).toBe('idle')

    act(() => {
      // Identity-only set (happens during ASR-blocking playback)
      result.current.setAudioUrl(null, 'Title Only', 'Art Only')
    })

    expect(result.current.audioTitle).toBe('Title Only')
    expect(result.current.audioUrl).toBeNull()
    expect(result.current.audioLoaded).toBe(false) // Best practice: false because no URL
    expect(result.current.status).toBe('loading') // Identity present -> loading
    expect(result.current.isPlaying).toBe(false)
  })

  it('should transition status from idle -> loading when track is set', () => {
    const { result } = renderHook(() => usePlayerStore())

    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
    })

    expect(result.current.status).toBe('loading')
    expect(result.current.isPlaying).toBe(true)
  })

  it('should transition status from loading -> playing when play() is called from paused', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
      result.current.setStatus('paused')
    })

    expect(result.current.status).toBe('paused')

    act(() => {
      result.current.play()
    })

    expect(result.current.status).toBe('playing')
    expect(result.current.isPlaying).toBe(true)
  })

  it('should ignore play() command if status is loading', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
    })

    expect(result.current.status).toBe('loading')

    act(() => {
      result.current.play()
    })

    // Should still be loading, not playing (playing happens after metadata load in real audio element)
    expect(result.current.status).toBe('loading')
  })

  it('allows play() to retry from error state', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
      result.current.setPlayerError('Network error: Failed to fetch audio')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.play()
    })

    expect(result.current.status).toBe('loading')
    expect(result.current.isPlaying).toBe(true)
  })

  it('allows togglePlayPause() to retry from error state', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
      result.current.setPlayerError('Network error: Failed to fetch audio')
    })

    expect(result.current.status).toBe('error')
    expect(result.current.isPlaying).toBe(false)

    act(() => {
      result.current.togglePlayPause()
    })

    expect(result.current.status).toBe('loading')
    expect(result.current.isPlaying).toBe(true)
  })

  it('keeps current playback state when setting the same track again', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
      result.current.setStatus('playing')
      useTranscriptStore.getState().setSubtitles([
        {
          start: 0,
          end: 1,
          text: 'Retain subtitle',
        },
      ])
    })

    const requestIdBefore = result.current.loadRequestId

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode Updated')
    })

    expect(result.current.status).toBe('playing')
    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Retain subtitle')
    expect(result.current.loadRequestId).toBe(requestIdBefore)
  })

  it('should revoke previous blob URLs when a new track is loaded', () => {
    const { result } = renderHook(() => usePlayerStore())

    // 1. Load first blob
    act(() => {
      result.current.setAudioUrl('blob:url-1', 'Track 1')
    })
    expect(result.current.activeBlobUrls).toContain('blob:url-1')

    // 2. Load second blob
    act(() => {
      result.current.setAudioUrl('blob:url-2', 'Track 2')
    })

    // 3. Verify first was revoked
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:url-1')
    expect(result.current.activeBlobUrls).toContain('blob:url-2')
    expect(result.current.activeBlobUrls).not.toContain('blob:url-1')
  })

  it('aborts in-flight ASR when switching tracks', () => {
    const abortSpy = vi.fn()
    const controller = { abort: abortSpy } as unknown as AbortController
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      useTranscriptStore.setState({
        abortAsrController: controller,
        transcriptIngestionStatus: 'transcribing',
        asrActiveTrackKey: 'podcast:https://example.com/old.mp3',
      })
      usePlayerStore.setState({
        audioUrl: 'https://example.com/old.mp3',
      })
      result.current.setAudioUrl('https://example.com/new.mp3', 'New Episode')
    })

    expect(abortSpy).toHaveBeenCalledTimes(1)
    expect(useTranscriptStore.getState().abortAsrController).toBeNull()
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(useTranscriptStore.getState().asrActiveTrackKey).toBeNull()
  })

  it('aborts in-flight ASR on store reset', () => {
    const abortSpy = vi.fn()
    const controller = { abort: abortSpy } as unknown as AbortController
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      useTranscriptStore.setState({
        abortAsrController: controller,
        transcriptIngestionStatus: 'transcribing',
        asrActiveTrackKey: 'local:track-1',
      })
      result.current.reset()
    })

    expect(abortSpy).toHaveBeenCalledTimes(1)
    expect(useTranscriptStore.getState().abortAsrController).toBeNull()
    expect(useTranscriptStore.getState().transcriptIngestionStatus).toBe('idle')
    expect(useTranscriptStore.getState().asrActiveTrackKey).toBeNull()
  })

  it('should revert to paused if autoplay is blocked', async () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockRejectedValue({
      name: 'NotAllowedError',
      message: 'Autoplay blocked',
    })

    const { rerender } = render(createElement(GlobalAudioController))

    await act(async () => {
      usePlayerStore.getState().setAudioUrl('https://example.com/audio.mp3', 'Test Track')
    })

    rerender(createElement(GlobalAudioController))

    await act(async () => {
      await Promise.resolve()
    })

    expect(usePlayerStore.getState().status).toBe('paused')
    expect(usePlayerStore.getState().isPlaying).toBe(false)

    playSpy.mockRestore()
  })

  it('keeps manually loaded subtitles until track changes', () => {
    const { result } = renderHook(() => usePlayerStore())

    act(() => {
      result.current.setAudioUrl('https://example.com/audio-1.mp3', 'Track 1')
      useTranscriptStore.getState().setSubtitles([
        {
          start: 0,
          end: 1,
          text: 'Manual subtitle line',
        },
      ])
      result.current.setEpisodeMetadata({
        transcriptUrl: 'https://example.com/transcript-1.srt',
      })
    })

    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)
    expect(useTranscriptStore.getState().subtitles[0]?.text).toBe('Manual subtitle line')
  })

  it('uses monotonic loadRequestId increments even if Date.now collides', () => {
    const { result } = renderHook(() => usePlayerStore())
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(2000)

    act(() => {
      result.current.setAudioUrl('https://example.com/audio-1.mp3', 'Track 1')
    })
    const firstRequestId = result.current.loadRequestId

    act(() => {
      useTranscriptStore.getState().setSubtitles([
        {
          start: 0,
          end: 1,
          text: 'Manual subtitle line',
        },
      ])
    })
    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(true)

    act(() => {
      result.current.setAudioUrl('https://example.com/audio-2.mp3', 'Track 2')
    })

    expect(result.current.loadRequestId).toBe(firstRequestId + 1)
    expect(useTranscriptStore.getState().subtitlesLoaded).toBe(false)
    expect(useTranscriptStore.getState().subtitles).toEqual([])

    dateSpy.mockRestore()
  })

  it('detaches persistence when progress save targets a deleted session', async () => {
    const { result } = renderHook(() => usePlayerStore())
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(9_999_999_999_999)
    const updateSpy = vi
      .spyOn(DB, 'updatePlaybackSession')
      .mockRejectedValue(new Error('Playback session missing-session not found'))

    act(() => {
      usePlayerStore.setState({
        sessionId: 'missing-session',
        sessionPersistenceSuspended: false,
        isPlaying: true,
        duration: 120,
      })
      result.current.updateProgress(10)
    })

    await act(async () => {
      await Promise.resolve()
    })

    expect(usePlayerStore.getState().sessionId).toBeNull()
    expect(usePlayerStore.getState().sessionPersistenceSuspended).toBe(true)

    updateSpy.mockRestore()
    dateSpy.mockRestore()
  })

  it('resets duration to 0 when loading local blob without metadata duration', async () => {
    const { result } = renderHook(() => usePlayerStore())
    act(() => {
      usePlayerStore.setState({ duration: 987 })
    })

    await act(async () => {
      await result.current.loadAudioBlob(new Blob(['audio']), 'Local Blob', null, 'local-session-1')
    })

    expect(result.current.duration).toBe(0)
  })

  it('applies metadata duration when loading local blob', async () => {
    const { result } = renderHook(() => usePlayerStore())

    await act(async () => {
      await result.current.loadAudioBlob(
        new Blob(['audio']),
        'Local Blob',
        null,
        'local-session-2',
        undefined,
        { durationSeconds: 245 }
      )
    })

    expect(result.current.duration).toBe(245)
  })
})
