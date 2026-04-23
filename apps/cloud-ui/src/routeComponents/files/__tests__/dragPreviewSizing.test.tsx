import { cleanup, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FilesFolderPage from '../FilesFolderPage'
import FilesIndexPage from '../FilesIndexPage'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
  useParams: () => ({ folderId: 'folder-1' }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  useDroppable: () => ({ setNodeRef: vi.fn(), isOver: false }),
}))

vi.mock('../../../components/Files/FileDropZone', () => ({
  FileDropZone: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/Files/FolderCard', () => ({
  FolderCard: ({ folder }: { folder: { name: string } }) => <div>{folder.name}</div>,
}))

vi.mock('../../../components/Files/TrackCard', () => ({
  TrackCard: ({ track }: { track: { name: string } }) => <div>{track.name}</div>,
}))

vi.mock('../../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: () => <div />,
}))

vi.mock('../../../components/ui/button', () => ({
  Button: ({ children, ...props }: { children: ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}))

vi.mock('../../../components/ui/empty-state', () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../../components/ui/hidden-file-input', () => ({
  HiddenFileInput: () => null,
}))

vi.mock('../../../components/ui/input', () => ({
  Input: () => <input />,
}))

const sharedDragState = {
  sensors: [],
  activeDragItem: { id: 'drag-1', name: 'Dragged track', type: 'track' },
  isDragging: true,
  handleDragStart: vi.fn(),
  handleDragEnd: vi.fn(),
  handleDragCancel: vi.fn(),
  handleMoveTo: vi.fn(),
}

vi.mock('../../../hooks/useFileDragDrop', () => ({
  useFileDragDrop: () => sharedDragState,
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
  useFilesData: () => ({
    folders: [],
    tracks: [],
    subtitles: [],
    currentFolder: null,
    currentFolderId: null,
    setCurrentFolderId: vi.fn(),
    folderCounts: {},
    loadData: vi.fn().mockResolvedValue(undefined),
    status: 'ready',
  }),
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

const filesStoreState = {
  getSetting: vi.fn().mockResolvedValue(null),
  setSetting: vi.fn().mockResolvedValue(undefined),
  getAudioBlob: vi.fn().mockResolvedValue(null),
  updateFolder: vi.fn().mockResolvedValue(undefined),
  updateFileTrack: vi.fn().mockResolvedValue(undefined),
  deleteFileTrack: vi.fn().mockResolvedValue(undefined),
  deleteFileSubtitle: vi.fn().mockResolvedValue(undefined),
  getFolder: vi.fn().mockResolvedValue({ id: 'folder-1', name: 'Folder 1' }),
  loadAllFolders: vi.fn().mockResolvedValue([]),
  loadAllTracks: vi.fn().mockResolvedValue([]),
  getFileSubtitlesForTrack: vi.fn().mockResolvedValue([]),
}

vi.mock('../../../store/filesStore', () => ({
  useFilesStore: (selector: (state: typeof filesStoreState) => unknown) =>
    selector(filesStoreState),
}))

describe('drag preview sizing classes', () => {
  afterEach(() => {
    cleanup()
  })

  it('FilesIndexPage overlay uses shared comfortable width class', () => {
    render(<FilesIndexPage />)
    const preview = screen.getByText('Dragged track').parentElement
    expect(preview?.className.includes('w-72')).toBe(true)
  })

  it('FilesFolderPage overlay uses shared comfortable width class', () => {
    render(<FilesFolderPage />)
    const preview = screen.getByText('Dragged track').parentElement
    expect(preview?.className.includes('w-72')).toBe(true)
  })
})
