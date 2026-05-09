import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { loadFilesDataSnapshot } from '../../lib/filesDataService'
import { useFilesData } from '../useFilesData'

vi.mock('../../lib/filesDataService', () => ({
  loadFilesDataSnapshot: vi.fn(),
}))

vi.mock('../../lib/logger', () => ({
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  logError: vi.fn(),
}))

describe('useFilesData', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads root files data through the files data service', async () => {
    vi.mocked(loadFilesDataSnapshot).mockResolvedValue({
      folders: [{ id: 'folder-1', name: 'Folder 1', createdAt: 1 }],
      tracks: [],
      subtitles: [],
      currentFolder: undefined,
      folderCounts: { 'folder-1': 3 },
    })

    const { result } = renderHook(() => useFilesData(null))

    await act(async () => {
      await result.current.loadData()
    })

    expect(loadFilesDataSnapshot).toHaveBeenCalledWith(null)
    expect(result.current.status).toBe('success')
    expect(result.current.folders).toHaveLength(1)
    expect(result.current.folderCounts).toEqual({ 'folder-1': 3 })
  })

  it('ignores stale results when folder changes during overlapping loads', async () => {
    let resolverA: ((value: Awaited<ReturnType<typeof loadFilesDataSnapshot>>) => void) | undefined
    let resolverB: ((value: Awaited<ReturnType<typeof loadFilesDataSnapshot>>) => void) | undefined
    vi.mocked(loadFilesDataSnapshot)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverA = resolve
          })
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolverB = resolve
          })
      )

    const { result, rerender } = renderHook(
      ({ folderId }: { folderId: string | null }) => useFilesData(folderId),
      {
        initialProps: { folderId: null as string | null },
      }
    )

    let first!: Promise<void>
    act(() => {
      first = result.current.loadData()
    })

    await act(async () => {
      rerender({ folderId: 'folder-2' })
    })

    let second!: Promise<void>
    act(() => {
      second = result.current.loadData()
    })

    await act(async () => {
      resolverB?.({
        folders: [],
        tracks: [
          {
            id: 'track-b',
            folderId: 'folder-2',
            name: 'B',
            audioId: 'audio-b',
            sizeBytes: 1,
            createdAt: 1,
            sourceType: 'user_upload',
          } as never,
        ],
        subtitles: [],
        currentFolder: { id: 'folder-2', name: 'Folder 2', createdAt: 1 } as never,
        folderCounts: {},
      })
      resolverA?.({
        folders: [],
        tracks: [
          {
            id: 'track-a',
            folderId: null,
            name: 'A',
            audioId: 'audio-a',
            sizeBytes: 1,
            createdAt: 1,
            sourceType: 'user_upload',
          } as never,
        ],
        subtitles: [],
        currentFolder: undefined,
        folderCounts: {},
      })
      await Promise.all([first, second])
    })

    expect(loadFilesDataSnapshot).toHaveBeenNthCalledWith(1, null)
    expect(loadFilesDataSnapshot).toHaveBeenNthCalledWith(2, 'folder-2')

    await waitFor(() => {
      expect(result.current.tracks).toEqual([
        expect.objectContaining({
          id: 'track-b',
        }),
      ])
    })
  })
})
