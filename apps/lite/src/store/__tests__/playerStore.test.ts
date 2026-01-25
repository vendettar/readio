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
