import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/repositories/FilesRepository', () => ({
  FilesRepository: {
    getAllFolders: vi.fn().mockResolvedValue([]),
    getAllFileTracks: vi.fn().mockResolvedValue([]),
    getFileTracksInFolder: vi.fn().mockResolvedValue([]),
    getFolder: vi.fn().mockResolvedValue(undefined),
    getAudioBlob: vi.fn().mockResolvedValue(undefined),
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
    getFileSubtitlesForTrack: vi.fn().mockResolvedValue([]),
    updateFolder: vi.fn().mockResolvedValue(undefined),
    updateFileTrack: vi.fn().mockResolvedValue(undefined),
    deleteFileTrack: vi.fn().mockResolvedValue(undefined),
    deleteFileSubtitle: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('filesStore repository boundary', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const { __testOnlyResetFilesStoreFlags } = await import('../filesStore')
    __testOnlyResetFilesStoreFlags()
  })

  it('delegates reads/writes to FilesRepository', async () => {
    const { useFilesStore } = await import('../filesStore')
    const { FilesRepository } = await import('../../lib/repositories/FilesRepository')

    await useFilesStore.getState().loadFolders()
    await useFilesStore.getState().loadAllFolders()
    await useFilesStore.getState().loadAllTracks()
    await useFilesStore.getState().loadTracksForFolder('folder-1')
    await useFilesStore.getState().setSetting('k', 'v')
    await useFilesStore.getState().updateFolder('folder-1', { name: 'next' })
    await useFilesStore.getState().updateFileTrack('track-1', { name: 'next' })
    await useFilesStore.getState().deleteFileTrack('track-1')
    await useFilesStore.getState().deleteFileSubtitle('sub-1')

    expect(FilesRepository.getAllFolders).toHaveBeenCalledTimes(2)
    expect(FilesRepository.getAllFileTracks).toHaveBeenCalledTimes(1)
    expect(FilesRepository.getFileTracksInFolder).toHaveBeenCalledWith('folder-1')
    expect(FilesRepository.setSetting).toHaveBeenCalledWith('k', 'v')
    expect(FilesRepository.updateFolder).toHaveBeenCalledWith('folder-1', { name: 'next' })
    expect(FilesRepository.updateFileTrack).toHaveBeenCalledWith('track-1', { name: 'next' })
    expect(FilesRepository.deleteFileTrack).toHaveBeenCalledWith('track-1')
    expect(FilesRepository.deleteFileSubtitle).toHaveBeenCalledWith('sub-1')
  })

  it('coalesces concurrent write calls for the same key', async () => {
    const { useFilesStore } = await import('../filesStore')
    const { FilesRepository } = await import('../../lib/repositories/FilesRepository')

    let resolveUpdateFolder: (() => void) | undefined
    const updateFolderGate = new Promise<void>((resolve) => {
      resolveUpdateFolder = resolve
    })
    vi.mocked(FilesRepository.updateFolder).mockImplementationOnce(async () => {
      await updateFolderGate
    })

    const updateFirst = useFilesStore.getState().updateFolder('folder-1', { name: 'same' })
    const updateSecond = useFilesStore.getState().updateFolder('folder-1', { name: 'same' })
    resolveUpdateFolder?.()
    await Promise.all([updateFirst, updateSecond])
    expect(FilesRepository.updateFolder).toHaveBeenCalledTimes(1)

    let resolveDeleteTrack: (() => void) | undefined
    const deleteTrackGate = new Promise<void>((resolve) => {
      resolveDeleteTrack = resolve
    })
    vi.mocked(FilesRepository.deleteFileTrack).mockImplementationOnce(async () => {
      await deleteTrackGate
    })

    const deleteFirst = useFilesStore.getState().deleteFileTrack('track-1')
    const deleteSecond = useFilesStore.getState().deleteFileTrack('track-1')
    resolveDeleteTrack?.()
    await Promise.all([deleteFirst, deleteSecond])
    expect(FilesRepository.deleteFileTrack).toHaveBeenCalledTimes(1)
  })

  it('does not swallow shared write failure when first caller aborts', async () => {
    const { useFilesStore } = await import('../filesStore')
    const { FilesRepository } = await import('../../lib/repositories/FilesRepository')

    let releaseWrite: (() => void) | undefined
    const writeGate = new Promise<void>((resolve) => {
      releaseWrite = resolve
    })
    vi.mocked(FilesRepository.updateFolder).mockImplementationOnce(async () => {
      await writeGate
      throw new Error('update failed')
    })

    const firstController = new AbortController()
    const first = useFilesStore
      .getState()
      .updateFolder('folder-1', { name: 'same' }, firstController.signal)
    const second = useFilesStore.getState().updateFolder('folder-1', { name: 'same' })

    firstController.abort()
    releaseWrite?.()
    const results = await Promise.allSettled([first, second])

    expect(FilesRepository.updateFolder).toHaveBeenCalledTimes(1)
    expect(results[1]?.status).toBe('rejected')
  })
})
