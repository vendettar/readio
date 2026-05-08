import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createManagedFolder,
  deleteManagedFolder,
  resolveNextFolderName,
} from '../folderManagementService'
import { FilesRepository } from '../repositories/FilesRepository'

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    addFolder: vi.fn(),
    deleteFolder: vi.fn(),
  },
}))

describe('folderManagementService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves duplicate folder names case-insensitively', () => {
    const nextName = resolveNextFolderName(' Projects ', [
      { id: '1', name: 'projects', createdAt: 1 },
      { id: '2', name: 'Projects (2)', createdAt: 2 },
      { id: '3', name: 'projects (3)', createdAt: 3 },
    ])

    expect(nextName).toBe('Projects (4)')
  })

  it('creates folders through repository with resolved name', async () => {
    vi.mocked(FilesRepository.addFolder).mockResolvedValue('folder-1')

    const folderId = await createManagedFolder('Inbox', [
      { id: 'existing', name: 'inbox', createdAt: 1 },
    ])

    expect(FilesRepository.addFolder).toHaveBeenCalledWith('Inbox (2)')
    expect(folderId).toBe('folder-1')
  })

  it('deletes folders through repository', async () => {
    vi.mocked(FilesRepository.deleteFolder).mockResolvedValue()

    await deleteManagedFolder('folder-9')

    expect(FilesRepository.deleteFolder).toHaveBeenCalledWith('folder-9')
  })
})
