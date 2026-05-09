import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createManagedFolder, deleteManagedFolder } from '../../lib/folderManagementService'
import { useFolderManagement } from '../useFolderManagement'

const { toastErrorKeyMock } = vi.hoisted(() => ({
  toastErrorKeyMock: vi.fn(),
}))

vi.mock('../../lib/folderManagementService', () => ({
  createManagedFolder: vi.fn(),
  deleteManagedFolder: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  logError: vi.fn(),
}))

vi.mock('../../lib/toast', () => ({
  toast: {
    errorKey: toastErrorKeyMock,
  },
}))

describe('useFolderManagement', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates folder through service and refreshes data', async () => {
    vi.mocked(createManagedFolder).mockResolvedValue('folder-1')
    const onComplete = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useFolderManagement({
        onComplete,
        folders: [{ id: 'existing', name: 'Inbox', createdAt: 1 }],
      })
    )

    await act(async () => {
      result.current.handleCreateFolder()
    })

    await act(async () => {
      result.current.setNewFolderName('Inbox')
    })

    await act(async () => {
      await result.current.handleConfirmNewFolder()
    })

    expect(createManagedFolder).toHaveBeenCalledWith('Inbox', [
      { id: 'existing', name: 'Inbox', createdAt: 1 },
    ])
    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(result.current.newFolderName).toBe('')
    expect(result.current.isNamingFolder).toBe(false)
  })

  it('cancels blank folder names without calling service', async () => {
    const { result } = renderHook(() =>
      useFolderManagement({
        onComplete: vi.fn(async () => {}),
        folders: [],
      })
    )

    await act(async () => {
      result.current.handleCreateFolder()
      result.current.setNewFolderName('   ')
    })

    await act(async () => {
      await result.current.handleConfirmNewFolder()
    })

    expect(createManagedFolder).not.toHaveBeenCalled()
    expect(result.current.isNamingFolder).toBe(false)
  })

  it('surfaces delete failures with toast and false result', async () => {
    vi.mocked(deleteManagedFolder).mockRejectedValue(new Error('delete failed'))
    const onComplete = vi.fn(async () => {})

    const { result } = renderHook(() =>
      useFolderManagement({
        onComplete,
        folders: [],
      })
    )

    let deleted = true
    await act(async () => {
      deleted = await result.current.executeDeleteFolder({
        id: 'folder-2',
        name: 'Folder 2',
        createdAt: 2,
      })
    })

    expect(deleteManagedFolder).toHaveBeenCalledWith('folder-2')
    expect(deleted).toBe(false)
    expect(onComplete).not.toHaveBeenCalled()
    expect(toastErrorKeyMock).toHaveBeenCalledWith('folderDeleteFailed')
  })
})
