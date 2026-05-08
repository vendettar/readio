import { beforeEach, describe, expect, it, vi } from 'vitest'
import { moveTrackToFolder } from '../fileDragDropService'
import { FilesRepository } from '../repositories/FilesRepository'

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    getFileTracksInFolder: vi.fn(),
    updateFileTrack: vi.fn(),
  },
}))

describe('fileDragDropService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renames moved track when target folder already has same name', async () => {
    vi.mocked(FilesRepository.getFileTracksInFolder).mockResolvedValue([
      {
        id: 'track-existing',
        folderId: 'folder-2',
        name: 'Episode',
        audioId: 'audio-1',
        sizeBytes: 1,
        createdAt: 1,
        sourceType: 'user_upload',
      },
    ] as never)
    vi.mocked(FilesRepository.updateFileTrack).mockResolvedValue()

    const result = await moveTrackToFolder('track-1', 'folder-2', 'Episode')

    expect(FilesRepository.updateFileTrack).toHaveBeenCalledWith('track-1', {
      folderId: 'folder-2',
      name: 'Episode (2)',
    })
    expect(result).toEqual({
      finalName: 'Episode (2)',
      renamed: true,
    })
  })

  it('preserves name when target folder has no conflict', async () => {
    vi.mocked(FilesRepository.getFileTracksInFolder).mockResolvedValue([])
    vi.mocked(FilesRepository.updateFileTrack).mockResolvedValue()

    const result = await moveTrackToFolder('track-2', null, 'Episode')

    expect(FilesRepository.updateFileTrack).toHaveBeenCalledWith('track-2', {
      folderId: null,
      name: 'Episode',
    })
    expect(result).toEqual({
      finalName: 'Episode',
      renamed: false,
    })
  })
})
