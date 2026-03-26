// src/__tests__/useFileHandler.test.ts
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DB } from '../../lib/dexieDb'
import { toast } from '../../lib/toast'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import { useFileHandler } from '../useFileHandler'

// Mock logger
vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    errorKey: vi.fn(),
    warningKey: vi.fn(),
    infoKey: vi.fn(),
  },
}))

describe('useFileHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionStorage.clear()
    // Reset player store with mock actions
    usePlayerStore.setState({
      audioLoaded: false,
      loadAudio: vi.fn(),
      loadSubtitles: vi.fn(),
    })
    useTranscriptStore.setState({
      subtitlesLoaded: false,
    })
  })

  it('should call loadAudio for audio files (MP3 MIME)', async () => {
    const mockAudioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile)
  })

  it('should call loadAudio for audio files (extension only)', async () => {
    // If MIME type is missing but extension is valid
    const mockAudioFile = new File(['audio'], 'test.mp3', { type: '' })

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile)
  })

  it('should call loadSubtitles for srt files', async () => {
    const mockSrtFile = new File(['srt'], 'test.srt')

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockSrtFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadSubtitles).toHaveBeenCalledWith(mockSrtFile)
  })

  it('should recognize various audio extensions', async () => {
    const m4aFile = new File(['audio'], 'podcast.m4a')
    const oggFile = new File(['audio'], 'music.ogg')

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([m4aFile, oggFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledTimes(2)
  })

  it('should not call any store action for unsupported files', async () => {
    const txtFile = new File(['text'], 'readme.txt')

    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([txtFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).not.toHaveBeenCalled()
    expect(store.loadSubtitles).not.toHaveBeenCalled()
  })

  it('blocks upload when quota guardrail triggers', async () => {
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: {
        usage: 85,
        quota: 100,
        available: 15,
        percentage: 85,
      },
    })

    const mockAudioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).not.toHaveBeenCalled()
    expect(toast.errorKey).toHaveBeenCalledWith('storageQuotaUploadBlocked')
  })

  it('allows upload silently when quota is unavailable', async () => {
    vi.spyOn(DB, 'getStorageInfo').mockResolvedValueOnce({
      indexedDB: {
        sessions: 0,
        audioBlobs: 0,
        audioBlobsSize: 0,
        subtitles: 0,
        subtitlesSize: 0,
        remoteTranscripts: 0,
        remoteTranscriptsSize: 0,
        totalSize: 0,
      },
      browser: null,
    })

    const mockAudioFile = new File(['audio'], 'test.mp3', { type: 'audio/mpeg' })
    const { result } = renderHook(() => useFileHandler())

    await act(async () => {
      await result.current.processFiles([mockAudioFile])
    })

    const store = usePlayerStore.getState()
    expect(store.loadAudio).toHaveBeenCalledWith(mockAudioFile)
    expect(toast.warningKey).not.toHaveBeenCalledWith('storageQuotaUploadRisk')
  })
})
