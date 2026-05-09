import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useFilesData } from '../../../hooks/useFilesData'
import { useFolderManagement } from '../../../hooks/useFolderManagement'
import FilesIndexPage from '../FilesIndexPage'

vi.mock('../../../hooks/useFilesData')
vi.mock('../../../hooks/useFolderManagement', () => ({
  useFolderManagement: vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue || key,
  }),
  initReactI18next: { type: '3rdParty', init: vi.fn() },
}))

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DragOverlay: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))

vi.mock('../../../components/layout', () => ({
  PageShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PageHeader: ({ title }: { title: string }) => <div>{title}</div>,
}))

vi.mock('../../../components/ui/button', () => ({
  Button: ({ children }: { children: ReactNode }) => <button type="button">{children}</button>,
}))

vi.mock('../../../components/ui/empty-state', () => ({
  EmptyState: ({ title, description }: { title: string; description: string }) => (
    <div data-testid="empty-state">
      <h3>{title}</h3>
      <p>{description}</p>
    </div>
  ),
}))

vi.mock('../../../components/Files/ViewControlsBar', () => ({
  ViewControlsBar: () => <div data-testid="view-controls" />,
}))

vi.mock('../../../hooks/useFileDragDrop', () => ({
  useFileDragDrop: () => ({ activeDragItem: null }),
}))

vi.mock('../../../hooks/useFilePlayback', () => ({
  useFilePlayback: () => ({}),
}))

vi.mock('../../../hooks/useFileProcessing', () => ({
  useFileProcessing: () => ({}),
}))

type FilesDataResult = ReturnType<typeof useFilesData>
type FolderManagementResult = ReturnType<typeof useFolderManagement>

function makeFilesDataResult(overrides: Partial<FilesDataResult> = {}): FilesDataResult {
  return {
    folders: [],
    tracks: [],
    subtitles: [],
    currentFolder: undefined,
    folderCounts: {},
    status: 'success',
    error: null,
    loadData: vi.fn(),
    ...overrides,
  }
}

function makeFolderManagementResult(
  overrides: Partial<FolderManagementResult> = {}
): FolderManagementResult {
  return {
    isNamingFolder: false,
    setIsNamingFolder: vi.fn(),
    newFolderName: '',
    setNewFolderName: vi.fn(),
    namingInputRef: { current: null },
    namingContainerRef: { current: null },
    handleCreateFolder: vi.fn(),
    handleConfirmNewFolder: vi.fn(),
    executeDeleteFolder: vi.fn(),
    isFolderLoading: false,
    ...overrides,
  }
}

describe('FilesIndexPage Empty States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFolderManagement).mockReturnValue(makeFolderManagementResult())
  })

  it('shows root-level onboarding empty state when library is empty', () => {
    vi.mocked(useFilesData).mockReturnValue(makeFilesDataResult())

    render(<FilesIndexPage />)

    expect(screen.getByText('filesEmptyTitle')).toBeDefined()
    expect(screen.getByText('filesEmptyDesc')).toBeDefined()
  })

  it('suppresses root-level empty state while naming a new folder', () => {
    vi.mocked(useFilesData).mockReturnValue(makeFilesDataResult())

    vi.mocked(useFolderManagement).mockReturnValue(
      makeFolderManagementResult({
        isNamingFolder: true,
      })
    )

    render(<FilesIndexPage />)

    expect(screen.queryByText('filesEmptyTitle')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})
