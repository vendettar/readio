import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveTrackToFolder } from '../../lib/fileDragDropService'
import { useFileDragDrop } from '../useFileDragDrop'

const { toastSuccessKeyMock, toastErrorKeyMock } = vi.hoisted(() => ({
  toastSuccessKeyMock: vi.fn(),
  toastErrorKeyMock: vi.fn(),
}))

vi.mock('../../lib/fileDragDropService', () => ({
  moveTrackToFolder: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    successKey: toastSuccessKeyMock,
    errorKey: toastErrorKeyMock,
  },
}))

describe('useFileDragDrop', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.className = ''
  })

  it('moves track through service and refreshes once', async () => {
    vi.mocked(moveTrackToFolder).mockResolvedValue({
      finalName: 'Episode',
      renamed: false,
    })
    const onComplete = vi.fn(async () => {})
    const track = {
      id: 'track-1',
      folderId: null,
      name: 'Episode',
      audioId: 'audio-1',
      sizeBytes: 1,
      createdAt: 1,
      sourceType: 'user_upload',
    } as const

    const { result } = renderHook(() => useFileDragDrop({ onComplete }))

    await act(async () => {
      await result.current.handleMoveTo(track as never, 'folder-1')
    })

    expect(moveTrackToFolder).toHaveBeenCalledWith('track-1', 'folder-1', 'Episode')
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(toastSuccessKeyMock).not.toHaveBeenCalled()
  })

  it('shows rename toast when move resolves a conflict', async () => {
    vi.mocked(moveTrackToFolder).mockResolvedValue({
      finalName: 'Episode (2)',
      renamed: true,
    })

    const { result } = renderHook(() => useFileDragDrop({ onComplete: vi.fn(async () => {}) }))

    await act(async () => {
      await result.current.handleMoveTo(
        {
          id: 'track-2',
          folderId: null,
          name: 'Episode',
          audioId: 'audio-2',
          sizeBytes: 1,
          createdAt: 1,
          sourceType: 'user_upload',
        } as never,
        'folder-2'
      )
    })

    expect(toastSuccessKeyMock).toHaveBeenCalledWith('toastMoveRenamed', {
      name: 'Episode (2)',
    })
  })

  it('shows failure toast when move service throws', async () => {
    vi.mocked(moveTrackToFolder).mockRejectedValue(new Error('move failed'))
    const onComplete = vi.fn(async () => {})

    const { result } = renderHook(() => useFileDragDrop({ onComplete }))

    await act(async () => {
      await result.current.handleMoveTo(
        {
          id: 'track-3',
          folderId: null,
          name: 'Episode',
          audioId: 'audio-3',
          sizeBytes: 1,
          createdAt: 1,
          sourceType: 'user_upload',
        } as never,
        'folder-3'
      )
    })

    expect(onComplete).not.toHaveBeenCalled()
    expect(toastErrorKeyMock).toHaveBeenCalledWith('toastMoveFailed')
  })
})
