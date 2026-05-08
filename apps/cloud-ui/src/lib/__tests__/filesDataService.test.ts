import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFilesDataSnapshot } from '../filesDataService'
import { FilesRepository } from '../repositories/FilesRepository'

vi.mock('../repositories/FilesRepository', () => ({
  FilesRepository: {
    getAllFolders: vi.fn(),
    getFileTracksInFolder: vi.fn(),
    getFileSubtitlesForTrack: vi.fn(),
    getFolder: vi.fn(),
    getFileTracksCountInFolder: vi.fn(),
  },
}))

describe('filesDataService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads root snapshot with folder counts and flattened subtitles', async () => {
    vi.mocked(FilesRepository.getAllFolders).mockResolvedValue([
      { id: 'folder-1', name: 'Folder 1', createdAt: 1 },
      { id: 'folder-2', name: 'Folder 2', createdAt: 2 },
    ])
    vi.mocked(FilesRepository.getFileTracksInFolder).mockResolvedValue([
      {
        id: 'track-1',
        folderId: null,
        name: 'Track 1',
        audioId: 'audio-1',
        sizeBytes: 123,
        createdAt: 1,
        sourceType: 'user_upload',
      },
    ] as never)
    vi.mocked(FilesRepository.getFileSubtitlesForTrack).mockResolvedValue([
      {
        id: 'sub-1',
        trackId: 'track-1',
        subtitleId: 'subtitle-1',
        name: 'Sub 1',
        sourceKind: 'manual_upload',
        status: 'ready',
        createdAt: 1,
      },
    ] as never)
    vi.mocked(FilesRepository.getFileTracksCountInFolder)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5)

    const snapshot = await loadFilesDataSnapshot(null)

    expect(snapshot.currentFolder).toBeUndefined()
    expect(snapshot.folderCounts).toEqual({
      'folder-1': 3,
      'folder-2': 5,
    })
    expect(snapshot.subtitles).toHaveLength(1)
  })

  it('loads non-root snapshot without folder counts', async () => {
    vi.mocked(FilesRepository.getAllFolders).mockResolvedValue([])
    vi.mocked(FilesRepository.getFileTracksInFolder).mockResolvedValue([])
    vi.mocked(FilesRepository.getFolder).mockResolvedValue({
      id: 'folder-1',
      name: 'Folder 1',
      createdAt: 1,
    } as never)

    const snapshot = await loadFilesDataSnapshot('folder-1')

    expect(FilesRepository.getFileTracksCountInFolder).not.toHaveBeenCalled()
    expect(snapshot.currentFolder).toEqual(
      expect.objectContaining({
        id: 'folder-1',
      })
    )
  })
})
