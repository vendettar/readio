import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FolderOverflowMenu } from '../FolderOverflowMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('lucide-react', () => ({
  MoreHorizontal: () => <svg />,
  Pencil: () => <svg />,
  Pin: () => <svg />,
  PinOff: () => <svg />,
  Trash2: () => <svg />,
}))

describe('FolderOverflowMenu', () => {
  it('returns from confirm back to menu when cancel is clicked', async () => {
    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={() => {}}
        onDelete={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderDelete' }))
    const cancelButton = screen.getByRole('button', { name: 'commonCancel' })
    expect(document.activeElement).toBe(cancelButton)

    fireEvent.click(cancelButton)

    expect(document.activeElement).toBe(
      await screen.findByRole('menuitem', { name: 'folderDelete' })
    )
  })

  it('closes the menu after a successful delete', async () => {
    const onDelete = vi.fn(async () => true)
    const onOpenChange = vi.fn()

    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
        onOpenChange={onOpenChange}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderDelete' }))
    fireEvent.click(screen.getByRole('button', { name: 'commonDelete' }))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'folderDelete' })).toBeNull()
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('stays on confirm when delete fails', async () => {
    const onDelete = vi.fn(async () => false)

    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderDelete' }))
    fireEvent.click(screen.getByRole('button', { name: 'commonDelete' }))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole('button', { name: 'commonCancel' })).toBeDefined()
  })

  it('prevents duplicate delete submits and restores confirm actions when delete returns false', async () => {
    let resolveDelete: (ok: boolean) => void = () => {}
    const onDelete = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveDelete = resolve
        })
    )

    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderDelete' }))
    const confirmButton = screen.getByRole('button', { name: 'commonDelete' })

    fireEvent.click(confirmButton)

    expect((confirmButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(confirmButton)
    expect(onDelete).toHaveBeenCalledTimes(1)

    resolveDelete(false)

    await waitFor(() => {
      expect((confirmButton as HTMLButtonElement).disabled).toBe(false)
    })
    expect(screen.getByRole('button', { name: 'commonCancel' })).toBeDefined()
  })

  it('stays on confirm and restores actions when delete throws', async () => {
    const onDelete = vi.fn(async () => {
      throw new Error('delete failed')
    })

    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={() => {}}
        onDelete={onDelete}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderDelete' }))
    fireEvent.click(screen.getByRole('button', { name: 'commonDelete' }))

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByRole('button', { name: 'commonCancel' })).toBeDefined()
    expect(
      (screen.getByRole('button', { name: 'commonDelete' }) as HTMLButtonElement).disabled
    ).toBe(false)
  })

  it('defers rename until close auto focus runs', async () => {
    const onRename = vi.fn()

    render(
      <FolderOverflowMenu
        isPinned={false}
        onPin={() => {}}
        onUnpin={() => {}}
        onRename={onRename}
        onDelete={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'folderRename' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('menuitem', { name: 'folderRename' })).toBeNull()
  })
})
