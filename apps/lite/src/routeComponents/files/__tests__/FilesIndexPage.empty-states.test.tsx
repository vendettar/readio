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

describe('FilesIndexPage Empty States', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(useFolderManagement).mockReturnValue({
      isNamingFolder: false,
      setIsNamingFolder: vi.fn(),
      newFolderName: '',
      setNewFolderName: vi.fn(),
      namingInputRef: { current: null },
      namingContainerRef: { current: null },
      handleCreateFolder: vi.fn(),
      handleConfirmNewFolder: vi.fn(),
      executeDeleteFolder: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any)
  })

  it('shows root-level onboarding empty state when library is empty', () => {
    vi.mocked(useFilesData).mockReturnValue({
      folders: [],
      tracks: [],
      currentFolderId: null,
      status: 'ready',
      loadData: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any)

    render(<FilesIndexPage />)

    expect(screen.getByText('filesEmptyTitle')).toBeDefined()
    expect(screen.getByText('filesEmptyDesc')).toBeDefined()
  })

  it('shows folder-specific empty state when a subfolder is empty', () => {
    vi.mocked(useFilesData).mockReturnValue({
      folders: [],
      tracks: [],
      currentFolderId: 'folder-123',
      currentFolder: { id: 'folder-123', name: 'My Folder' },
      status: 'ready',
      loadData: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any)

    render(<FilesIndexPage />)

    expect(screen.getByText('folderEmptyTitle')).toBeDefined()
    expect(screen.getByText('folderEmptyDesc')).toBeDefined()
    expect(screen.queryByText('filesEmptyTitle')).toBeNull()
  })

  it('suppresses root-level empty state while naming a new folder', () => {
    vi.mocked(useFilesData).mockReturnValue({
      folders: [],
      tracks: [],
      currentFolderId: null,
      status: 'ready',
      loadData: vi.fn(),
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any)

    vi.mocked(useFolderManagement).mockReturnValue({
      isNamingFolder: true,
      namingInputRef: { current: null },
      namingContainerRef: { current: null },
      // biome-ignore lint/suspicious/noExplicitAny: mock
    } as any)

    render(<FilesIndexPage />)

    expect(screen.queryByText('filesEmptyTitle')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })
})
