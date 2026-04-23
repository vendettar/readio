import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from '../../../lib/toast'
import FilesIndexPage from '../FilesIndexPage'

const useFilesDataMock = vi.fn()
const retranscribeFileTrackWithCurrentSettingsMock = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/Files/FolderCard', () => ({
  FolderCard: ({ folder }: { folder: { name: string } }) => <div>{folder.name}</div>,
}))

vi.mock('../../../components/Files/TrackCard', () => ({
  TrackCard: ({ track }: { track: { name: string } }) => <div>{track.name}</div>,
}))

vi.mock('../../../components/Files/TracksListSection', () => ({
  TracksListSection: ({
    tracks,
    onTranscribeTrack,
  }: {
    tracks: Array<{ id: string }>
    onTranscribeTrack: (trackId: string) => void
  }) => (
    <div>
      <div>filesFiles</div>
      {tracks.length === 0 ? <div>filesEmptyFolder</div> : null}
      {tracks[0] ? (
        <button
          type="button"
          aria-label="files-retranscribe"
          onClick={() => onTranscribeTrack(tracks[0].id)}
        >
          Retranscribe
        </button>
      ) : null}
    </div>
  ),
}))

vi.mock('../../../components/Files/FileDropZone', () => ({
  FileDropZone: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: () => <div data-testid="view-controls" />,
}))

vi.mock('../../../components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('../../../components/ui/hidden-file-input', () => ({
  HiddenFileInput: () => null,
}))

vi.mock('../../../hooks/useFileDragDrop', () => ({
  useFileDragDrop: () => ({
    sensors: [],
    activeDragItem: null,
    isDragging: false,
    handleDragStart: vi.fn(),
    handleDragEnd: vi.fn(),
    handleDragCancel: vi.fn(),
    handleMoveTo: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useFileProcessing', () => ({
  useFileProcessing: () => ({
    handleDroppedFiles: vi.fn(),
    handleAudioInputChange: vi.fn(),
    handleSubtitleInputChange: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useFilePlayback', () => ({
  useFilePlayback: () => ({
    handlePlay: vi.fn(),
    handleSetActiveSubtitle: vi.fn(),
  }),
}))

vi.mock('../../../hooks/useFilesData', () => ({
  useFilesData: () => useFilesDataMock(),
}))

vi.mock('../../../hooks/useFolderManagement', () => ({
  useFolderManagement: () => ({
    isNamingFolder: false,
    setIsNamingFolder: vi.fn(),
    newFolderName: '',
    setNewFolderName: vi.fn(),
    namingInputRef: { current: null },
    namingContainerRef: { current: null },
    handleCreateFolder: vi.fn(),
    handleConfirmNewFolder: vi.fn(),
    executeDeleteFolder: vi.fn(),
  }),
}))

vi.mock('../../../lib/remoteTranscript', () => ({
  RETRANSCRIBE_FILE_REASON: {
    SUCCESS: 'success',
    TRACK_NOT_FOUND: 'track_not_found',
    INVALID_SOURCE: 'invalid_source',
    UNCONFIGURED: 'unconfigured',
    IN_FLIGHT: 'in_flight',
    FAILED: 'failed',
    ENQUEUE_FAILED: 'enqueue_failed',
  } as const,
  retranscribeFileTrackWithCurrentSettings: (...args: unknown[]) =>
    retranscribeFileTrackWithCurrentSettingsMock(...args),
}))

vi.mock('../../../lib/toast', () => ({
  toast: {
    errorKey: vi.fn(),
    successKey: vi.fn(),
  },
}))

const filesStoreState = {
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  getAudioBlob: vi.fn().mockResolvedValue(null),
  updateFolder: vi.fn().mockResolvedValue(undefined),
  updateFileTrack: vi.fn().mockResolvedValue(undefined),
  deleteFileTrack: vi.fn().mockResolvedValue(undefined),
  deleteFileSubtitle: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../../../store/filesStore', () => ({
  useFilesStore: (selector: (state: typeof filesStoreState) => unknown) =>
    selector(filesStoreState),
}))

describe('FilesIndexPage sections', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders root mode sections', () => {
    useFilesDataMock.mockReturnValue({
      folders: [{ id: 'f1', name: 'Folder A' }],
      tracks: [{ id: 't1', name: 'Track A', audioId: 'a1' }],
      subtitles: [],
      currentFolder: null,
      currentFolderId: null,
      setCurrentFolderId: vi.fn(),
      folderCounts: { f1: 1 },
      loadData: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
    })

    render(<FilesIndexPage />)

    expect(screen.getByText('filesTitle')).not.toBeNull()
    expect(screen.getByText('filesSubtitle')).not.toBeNull()
    expect(screen.getByText('filesFolders')).not.toBeNull()
    expect(screen.getByText('filesFiles')).not.toBeNull()
  })

  it('renders folder mode sections and back-to-root action', () => {
    useFilesDataMock.mockReturnValue({
      folders: [{ id: 'f1', name: 'Folder A' }],
      tracks: [],
      subtitles: [],
      currentFolder: { id: 'f1', name: 'Folder A' },
      currentFolderId: 'f1',
      setCurrentFolderId: vi.fn(),
      folderCounts: { f1: 0 },
      loadData: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
    })

    render(<FilesIndexPage />)

    expect(screen.getByText('Folder A')).not.toBeNull()
    expect(screen.getByText('filesBackToRoot')).not.toBeNull()
    expect(screen.getByText('filesEmptyFolder')).not.toBeNull()
  })

  it('shows ASR settings toast and navigates when retranscribe is unconfigured', async () => {
    useFilesDataMock.mockReturnValue({
      folders: [],
      tracks: [{ id: 'track-1', name: 'Track A', audioId: 'a1' }],
      subtitles: [],
      currentFolder: null,
      currentFolderId: null,
      setCurrentFolderId: vi.fn(),
      folderCounts: {},
      loadData: vi.fn().mockResolvedValue(undefined),
      status: 'ready',
    })
    retranscribeFileTrackWithCurrentSettingsMock.mockResolvedValue({
      ok: false,
      reason: 'unconfigured',
    })
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent')

    render(<FilesIndexPage />)
    fireEvent.click(screen.getByLabelText('files-retranscribe'))

    await waitFor(() => {
      expect(toast.errorKey).toHaveBeenCalledWith('asrKeyInvalid')
    })
    expect(dispatchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'readio:navigate',
      })
    )
    dispatchSpy.mockRestore()
  })
})
