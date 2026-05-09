import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TrackOverflowMenu } from '../TrackOverflowMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <svg />,
  FileText: () => <svg />,
  Folder: () => <svg />,
  Home: () => <svg />,
  Inbox: () => <svg />,
  MoreHorizontal: () => <svg />,
  Pencil: () => <svg />,
  Trash2: () => <svg />,
}))

describe('TrackOverflowMenu actions', () => {
  it('does not render play-without-transcript action', async () => {
    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'playWithoutTranscript' })).toBeNull()
    })
  })

  it('renders transcribe action when track has no subtitle and triggers handler', async () => {
    const onTranscribe = vi.fn()

    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onTranscribe={onTranscribe}
        isRetranscribe={false}
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'asrGenerateTranscript' }))
    expect(onTranscribe).toHaveBeenCalledTimes(1)
  })

  it('renders retranscribe action when track already has subtitles', async () => {
    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onTranscribe={() => {}}
        isRetranscribe
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    expect(await screen.findByRole('menuitem', { name: 'asrRegenerateTranscript' })).toBeDefined()
  })

  it('moves the track and closes the menu from the move step', async () => {
    const onMove = vi.fn()

    render(
      <TrackOverflowMenu
        folders={[
          { id: 'folder-1', name: 'Folder One' } as never,
          { id: 'folder-2', name: 'Folder Two' } as never,
        ]}
        currentFolderId="folder-1"
        onMove={onMove}
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'filesMoveToFolder' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Folder Two' }))

    expect(onMove).toHaveBeenCalledWith('folder-2')
    await waitFor(() => {
      expect(screen.queryByRole('menuitem', { name: 'filesMoveToFolder' })).toBeNull()
    })
  })

  it('returns from confirm step back to the root menu when cancel is clicked', async () => {
    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'filesDeleteTrack' }))
    const cancelButton = screen.getByRole('button', { name: 'commonCancel' })
    expect(document.activeElement).toBe(cancelButton)

    fireEvent.click(cancelButton)

    expect(document.activeElement).toBe(
      await screen.findByRole('menuitem', { name: 'filesDeleteTrack' })
    )
  })

  it('triggers rename after close auto focus when rename closes the menu', async () => {
    const onRename = vi.fn()

    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onRename={onRename}
        onDeleteTrack={async () => true}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'trackRename' }))

    await waitFor(() => {
      expect(onRename).toHaveBeenCalledTimes(1)
    })
    expect(screen.queryByRole('menuitem', { name: 'trackRename' })).toBeNull()
  })
})
