import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { FileTrack } from '../../../lib/db/types'
import FilesIndexPage from '../FilesIndexPage'

const dndHandlers: {
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragCancel?: () => void
} = {}

const dragState = {
  sensors: [],
  activeDragItem: null as FileTrack | null,
  isDragging: false,
  handleDragStart: vi.fn(),
  handleDragEnd: vi.fn(),
  handleDragCancel: vi.fn(),
  handleMoveTo: vi.fn(),
}

interface MockDndContextProps {
  children: ReactNode
  onDragStart?: (event: DragStartEvent) => void
  onDragEnd?: (event: DragEndEvent) => void
  onDragCancel?: () => void
}

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children, onDragStart, onDragEnd, onDragCancel }: MockDndContextProps) => {
    dndHandlers.onDragStart = onDragStart
    dndHandlers.onDragEnd = onDragEnd
    dndHandlers.onDragCancel = onDragCancel
    return <div>{children}</div>
  },
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/Files/FileDropZone', () => ({
  FileDropZone: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: () => <div />,
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
  useFileDragDrop: () => dragState,
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
}

vi.mock('../../../store/filesStore', () => ({
  useFilesStore: (selector: (state: typeof filesStoreState) => unknown) =>
    selector(filesStoreState),
}))

describe('FilesIndexPage dnd lifecycle', () => {
  it('keeps dnd lifecycle wired to hook handlers', () => {
    render(<FilesIndexPage />)

    dndHandlers.onDragStart?.({} as DragStartEvent)
    expect(dragState.handleDragStart).toHaveBeenCalledTimes(1)

    dndHandlers.onDragEnd?.({} as DragEndEvent)
    expect(dragState.handleDragEnd).toHaveBeenCalledTimes(1)

    dndHandlers.onDragCancel?.()
    expect(dragState.handleDragCancel).toHaveBeenCalledTimes(1)
  })
})
