import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FILE_PROCESSING_RESULT,
  processDroppedFiles,
  processSelectedAudioFiles,
  processSelectedSubtitleFile,
} from '../../lib/fileProcessingService'
import { useFileProcessing } from '../useFileProcessing'

const { logErrorMock, toastErrorKeyMock } = vi.hoisted(() => ({
  logErrorMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
}))

vi.mock('../../lib/fileProcessingService', () => ({
  FILE_PROCESSING_RESULT: {
    PROCESSED: 'processed',
    BLOCKED: 'blocked',
    IGNORED: 'ignored',
  },
  processDroppedFiles: vi.fn(),
  processSelectedAudioFiles: vi.fn(),
  processSelectedSubtitleFile: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logError: (...args: unknown[]) => logErrorMock(...args),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    errorKey: (...args: unknown[]) => toastErrorKeyMock(...args),
  },
}))

describe('useFileProcessing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function createInputRefWithFiles(files: File[]) {
    const input = document.createElement('input')
    input.value = 'filled'
    Object.defineProperty(input, 'files', {
      value: files,
      configurable: true,
    })

    return {
      event: {
        target: input,
      } as unknown as React.ChangeEvent<HTMLInputElement>,
      ref: {
        current: input,
      } as React.RefObject<HTMLInputElement>,
    }
  }

  it('reloads after dropped files are processed', async () => {
    vi.mocked(processDroppedFiles).mockResolvedValue(FILE_PROCESSING_RESULT.PROCESSED)
    const onComplete = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useFileProcessing({ currentFolderId: 'folder-1', onComplete })
    )

    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })
    await act(async () => {
      await result.current.handleDroppedFiles([file])
    })

    expect(processDroppedFiles).toHaveBeenCalledWith([file], 'folder-1')
    expect(onComplete).toHaveBeenCalledTimes(1)
  })

  it('resets audio input after selection even when blocked', async () => {
    vi.mocked(processSelectedAudioFiles).mockResolvedValue(FILE_PROCESSING_RESULT.BLOCKED)
    const onComplete = vi.fn(async () => {})
    const file = new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' })
    const { event, ref: inputRef } = createInputRefWithFiles([file])

    const { result } = renderHook(() =>
      useFileProcessing({ currentFolderId: null, onComplete })
    )

    await act(async () => {
      await result.current.handleAudioInputChange(event, inputRef)
    })

    expect(processSelectedAudioFiles).toHaveBeenCalled()
    expect(onComplete).not.toHaveBeenCalled()
    expect(inputRef.current.value).toBe('')
  })

  it('reloads after subtitle attach and always clears target + input', async () => {
    vi.mocked(processSelectedSubtitleFile).mockResolvedValue(FILE_PROCESSING_RESULT.PROCESSED)
    const onComplete = vi.fn(async () => {})
    const clearTargetTrackId = vi.fn()
    const { event, ref: inputRef } = createInputRefWithFiles([new File(['sub'], 'episode.srt')])

    const { result } = renderHook(() =>
      useFileProcessing({ currentFolderId: null, onComplete })
    )

    await act(async () => {
      await result.current.handleSubtitleInputChange(event, 'track-1', inputRef, clearTargetTrackId)
    })

    expect(processSelectedSubtitleFile).toHaveBeenCalled()
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(clearTargetTrackId).toHaveBeenCalledTimes(1)
    expect(inputRef.current.value).toBe('')
  })

  it('shows upload failure toast when dropped-file processing throws', async () => {
    vi.mocked(processDroppedFiles).mockRejectedValue(new Error('drop failed'))

    const { result } = renderHook(() =>
      useFileProcessing({ currentFolderId: null, onComplete: vi.fn(async () => {}) })
    )

    await act(async () => {
      await result.current.handleDroppedFiles([
        new File(['audio'], 'episode.mp3', { type: 'audio/mpeg' }),
      ])
    })

    expect(logErrorMock).toHaveBeenCalled()
    expect(toastErrorKeyMock).toHaveBeenCalledWith('toastUploadFailed')
  })
})
