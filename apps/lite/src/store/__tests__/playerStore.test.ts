import { act, renderHook } from '@testing-library/react'
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../lib/dexieDb'
import { usePlayerStore } from '../playerStore'

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
      duration: 120,
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

    // Verify it didn't auto-play (browser policy safety)
    expect(result.current.isPlaying).toBe(false)
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

  it('should transition status from idle -> loading when track is set', () => {
    const { result } = renderHook(() => usePlayerStore())

    expect(result.current.status).toBe('idle')

    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test Episode')
    })

    expect(result.current.status).toBe('loading')
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

  it('should revert to paused if autoplay is blocked', async () => {
    const { result } = renderHook(() => usePlayerStore())

    // Setup: track is loaded but paused
    act(() => {
      result.current.setAudioUrl('https://example.com/audio.mp3', 'Test')
    })
    act(() => {
      result.current.setStatus('paused')
    })

    // Mock HTMLMediaElement.play to fail (simulating browser block)
    const playSpy = vi
      .spyOn(HTMLMediaElement.prototype, 'play')
      .mockRejectedValue(new Error('NotAllowedError'))

    await act(async () => {
      result.current.play()
    })

    // Simulate GlobalAudioController handling the block via setPlayerError

    act(() => {
      result.current.setPlayerError('NotAllowedError')
    })

    expect(result.current.status).toBe('paused')
    expect(result.current.isPlaying).toBe(false)

    playSpy.mockRestore()
  })
})
