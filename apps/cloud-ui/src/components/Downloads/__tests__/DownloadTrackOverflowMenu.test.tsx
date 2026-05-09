import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { logError } from '../../../lib/logger'
import { DownloadTrackOverflowMenu } from '../DownloadTrackOverflowMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('lucide-react', () => ({
  ChevronLeft: () => <svg />,
  FileAudio: () => <svg />,
  FilePlus: () => <svg />,
  MoreHorizontal: () => <svg />,
  Play: () => <svg />,
  RefreshCcw: () => <svg />,
  Trash2: () => <svg />,
}))

vi.mock('../../../lib/logger', () => ({
  logError: vi.fn(),
}))

describe('DownloadTrackOverflowMenu', () => {
  it('shows only the optional actions allowed by props', async () => {
    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction
        hasSubtitles={false}
        onExportAudio={vi.fn()}
        onRemove={async () => true}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    const menuPanel = await screen.findByTestId('downloads-overflow-menu-panel')

    expect(within(menuPanel).queryByRole('menuitem', { name: 'playWithoutTranscript' })).toBeNull()
    expect(within(menuPanel).queryByRole('menuitem', { name: 'importTranscript' })).toBeNull()
    expect(within(menuPanel).queryByRole('menuitem', { name: 'asrGenerateTranscript' })).toBeNull()
    expect(within(menuPanel).getByRole('menuitem', { name: 'exportAudio' })).toBeDefined()
  })

  it('renders all enabled optional actions', async () => {
    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction
        hasSubtitles
        onExportAudio={vi.fn()}
        onImportSubtitle={vi.fn()}
        onPlayWithoutTranscript={vi.fn()}
        onRemove={async () => true}
        onRetranscribe={vi.fn()}
        showPlayWithoutTranscriptAction
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    const menuPanel = await screen.findByTestId('downloads-overflow-menu-panel')

    expect(within(menuPanel).getByRole('menuitem', { name: 'playWithoutTranscript' })).toBeDefined()
    expect(within(menuPanel).getByRole('menuitem', { name: 'importTranscript' })).toBeDefined()
    expect(within(menuPanel).getByRole('menuitem', { name: 'exportAudio' })).toBeDefined()
    expect(
      within(menuPanel).getByRole('menuitem', { name: 'asrRegenerateTranscript' })
    ).toBeDefined()
  })

  it('returns from confirm to the menu when back is clicked', async () => {
    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction={false}
        hasSubtitles={false}
        onRemove={async () => true}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'commonDelete' }))[0])
    const backButton = screen.getByRole('button', { name: 'commonBack' })
    expect(document.activeElement).toBe(backButton)

    fireEvent.click(backButton)

    const menuPanel = screen.getByTestId('downloads-overflow-menu-panel')
    expect(document.activeElement).toBe(
      within(menuPanel).getByRole('menuitem', { name: 'commonDelete' })
    )
  })

  it('closes after a successful remove', async () => {
    const onRemove = vi.fn(async () => true)

    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction={false}
        hasSubtitles={false}
        onRemove={onRemove}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'commonDelete' }))[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'commonDelete' })[0])

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(screen.queryByTestId('downloads-overflow-menu-panel')).toBeNull()
    })
  })

  it('stays on confirm when remove returns false', async () => {
    const onRemove = vi.fn(async () => false)

    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction={false}
        hasSubtitles={false}
        onRemove={onRemove}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'commonDelete' }))[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'commonDelete' })[0])

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1)
    })
    expect(screen.getByTestId('downloads-overflow-confirm-panel')).toBeDefined()
  })

  it('prevents duplicate remove submits and restores confirm actions when remove returns false', async () => {
    let resolveRemove: (ok: boolean) => void = () => {}
    const onRemove = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRemove = resolve
        })
    )

    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction={false}
        hasSubtitles={false}
        onRemove={onRemove}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'commonDelete' }))[0])
    const confirmButton = screen.getAllByRole('button', { name: 'commonDelete' })[0]

    fireEvent.click(confirmButton)

    expect((confirmButton as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(confirmButton)
    expect(onRemove).toHaveBeenCalledTimes(1)

    resolveRemove(false)

    await waitFor(() => {
      expect((confirmButton as HTMLButtonElement).disabled).toBe(false)
    })
    expect(screen.getByTestId('downloads-overflow-confirm-panel')).toBeDefined()
  })

  it('keeps the existing error log semantics and restores actions when remove throws', async () => {
    const error = new Error('remove failed')
    const onRemove = vi.fn(async () => {
      throw error
    })

    render(
      <DownloadTrackOverflowMenu
        hasAudioExportAction={false}
        hasSubtitles={false}
        onRemove={onRemove}
        showPlayWithoutTranscriptAction={false}
      />
    )

    fireEvent.pointerDown(screen.getByLabelText('ariaMoreActions'))
    fireEvent.click((await screen.findAllByRole('menuitem', { name: 'commonDelete' }))[0])
    fireEvent.click(screen.getAllByRole('button', { name: 'commonDelete' })[0])

    await waitFor(() => {
      expect(onRemove).toHaveBeenCalledTimes(1)
    })
    expect(logError).toHaveBeenCalledWith('Error removing download', error)
    expect(screen.getByTestId('downloads-overflow-confirm-panel')).toBeDefined()
    expect(
      (screen.getAllByRole('button', { name: 'commonDelete' })[0] as HTMLButtonElement).disabled
    ).toBe(false)
  })
})
