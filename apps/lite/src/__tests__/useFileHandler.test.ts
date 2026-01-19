// src/__tests__/useFileHandler.test.ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFileHandler } from '../hooks/useFileHandler'
import { usePlayerStore } from '../store/playerStore'

// Mock logger
vi.mock('../lib/logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
}))

describe('useFileHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset player store with mock actions
    usePlayerStore.setState({
      audioLoaded: false,
      subtitlesLoaded: false,
      loadAudio: vi.fn(),
      loadSubtitles: vi.fn(),
    })
  })

  it('should call loadAudio for audio files', async () => {
    const mockAudioFile = new File(['audio content'], 'test.mp3', { type: 'audio/mpeg' })

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile)
  })

  it('should call loadSubtitles for srt files', async () => {
    const mockSrtFile = new File(['1\n00:00:01,000 --> 00:00:02,000\nHello'], 'test.srt')

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockSrtFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadSubtitles).toHaveBeenCalledWith(mockSrtFile)
  })

  it('should process both audio and srt files together', async () => {
    const mockAudioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const mockSrtFile = new File(['1\n00:00:01,000 --> 00:00:02,000\nHello'], 'test.srt')

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile, mockSrtFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile)
    expect(store.loadSubtitles).toHaveBeenCalledWith(mockSrtFile)
  })

  it('should recognize audio files by extension', async () => {
    const m4aFile = new File(['audio'], 'podcast.m4a', { type: 'audio/mp4' })
    const oggFile = new File(['audio'], 'music.ogg', { type: 'audio/ogg' })

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([m4aFile, oggFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledTimes(2)
    expect(store.loadAudio).toHaveBeenCalledWith(m4aFile)
    expect(store.loadAudio).toHaveBeenCalledWith(oggFile)
  })

  it('should not call any store action for unsupported files', async () => {
    const txtFile = new File(['text content'], 'readme.txt', { type: 'text/plain' })

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([txtFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).not.toHaveBeenCalled()
    expect(store.loadSubtitles).not.toHaveBeenCalled()
  })
})
