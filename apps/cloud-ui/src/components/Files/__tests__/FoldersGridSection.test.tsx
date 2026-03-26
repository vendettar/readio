import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { FileFolder } from '../../../lib/db/types'
import { FoldersGridSection } from '../FoldersGridSection'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../FolderCard', () => ({
  FolderCard: ({ folder }: { folder: { name: string } }) => <div>{folder.name}</div>,
}))

vi.mock('../NewFolderCard', () => ({
  NewFolderCard: () => <div>new-folder-card</div>,
}))

describe('FoldersGridSection', () => {
  const folder = (id: string, name: string): FileFolder => ({
    id,
    name,
    createdAt: 0,
  })

  it('shows naming card and folder helper when naming is active', () => {
    render(
      <FoldersGridSection
        folders={[]}
        folderCounts={{}}
        density="comfortable"
        isNamingFolder={true}
        newFolderName=""
        setNewFolderName={vi.fn()}
        namingInputRef={{ current: null }}
        namingContainerRef={{ current: null }}
        onConfirmNewFolder={vi.fn()}
        onCancelNamingFolder={vi.fn()}
        onPinFolder={vi.fn()}
        onUnpinFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        isDragging={false}
        hasActiveDragItem={false}
      />
    )

    expect(screen.getByText('filesFolders')).not.toBeNull()
    expect(screen.getByText('filesFolderHelperText')).not.toBeNull()
    expect(screen.getByText('new-folder-card')).not.toBeNull()
  })

  it('renders folder cards from sorted folders list', () => {
    render(
      <FoldersGridSection
        folders={[folder('f2', 'Beta'), folder('f1', 'Alpha')]}
        folderCounts={{ f1: 1, f2: 2 }}
        density="comfortable"
        isNamingFolder={false}
        newFolderName=""
        setNewFolderName={vi.fn()}
        namingInputRef={{ current: null }}
        namingContainerRef={{ current: null }}
        onConfirmNewFolder={vi.fn()}
        onCancelNamingFolder={vi.fn()}
        onPinFolder={vi.fn()}
        onUnpinFolder={vi.fn()}
        onRenameFolder={vi.fn()}
        onDeleteFolder={vi.fn()}
        isDragging={false}
        hasActiveDragItem={true}
      />
    )

    expect(screen.getByText('Alpha')).not.toBeNull()
    expect(screen.getByText('Beta')).not.toBeNull()
  })
})
