import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderCard } from '../FolderCard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('@dnd-kit/core', () => ({
  useDroppable: () => ({
    setNodeRef: vi.fn(),
    isOver: false,
  }),
}))

vi.mock('../FolderOverflowMenu', () => ({
  FolderOverflowMenu: ({ onRename }: { onRename: () => void }) => (
    <button type="button" onClick={onRename}>
      rename-folder
    </button>
  ),
}))

describe('FolderCard rename behavior', () => {
  it('preserves click-chain guard after rename confirm', () => {
    const onClick = vi.fn()
    const onRename = vi.fn()

    const { container } = render(
      <FolderCard
        folder={{ id: 'f1', name: 'Folder One', pinnedAt: null } as never}
        itemCount={1}
        onClick={onClick}
        onPin={vi.fn()}
        onUnpin={vi.fn()}
        onRename={onRename}
        onDelete={vi.fn(async () => true)}
        existingFolderNames={['Folder One', 'Folder Two']}
      />
    )

    fireEvent.click(screen.getByText('rename-folder'))
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'Folder Three' } })

    const card = container.querySelector('.folder-card') as HTMLElement
    fireEvent.mouseDown(card)

    expect(onRename).toHaveBeenCalledWith('Folder Three')

    const overlay = screen.getByLabelText('Folder One')
    fireEvent.click(overlay)
    expect(onClick).toHaveBeenCalledTimes(0)

    fireEvent.click(overlay)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
