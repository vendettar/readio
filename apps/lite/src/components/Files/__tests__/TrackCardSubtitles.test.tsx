import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TrackCardSubtitles } from '../TrackCardSubtitles'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock('../../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('TrackCardSubtitles', () => {
  it('renders active badge and wires subtitle action handlers', async () => {
    const onPlay = vi.fn()
    const onSetActiveSubtitle = vi.fn()
    const onDeleteSub = vi.fn()

    render(
      <TrackCardSubtitles
        track={{ id: 't1', name: 'Track', activeSubtitleId: 's1' } as never}
        subtitles={
          [
            { id: 's1', name: 'Sub 1' },
            { id: 's2', name: 'Sub 2' },
          ] as never
        }
        density="comfortable"
        onPlay={onPlay}
        onSetActiveSubtitle={onSetActiveSubtitle}
        onDeleteSub={onDeleteSub}
        onAddSub={vi.fn()}
      />
    )

    expect(screen.queryByText('filesActiveSubtitle')).not.toBeNull()

    fireEvent.click(screen.getAllByLabelText('filesPlayWithThis')[0])
    expect(onSetActiveSubtitle).toHaveBeenCalledWith('t1', 's1')
    expect(onPlay).toHaveBeenCalled()

    fireEvent.click(screen.getAllByLabelText('commonDelete')[0])
    fireEvent.click(screen.getByTestId('subtitle-delete-confirm-s1'))
    await waitFor(() => {
      expect(onDeleteSub).toHaveBeenCalledWith('s1')
    })
  })

  it('keeps add subtitle row start-aligned with subtitle rows', () => {
    render(
      <TrackCardSubtitles
        track={{ id: 't1', name: 'Track', activeSubtitleId: null } as never}
        subtitles={[] as never}
        density="comfortable"
        onPlay={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSub={vi.fn()}
        onAddSub={vi.fn()}
      />
    )

    const addButton = screen.getByRole('button', { name: 'subtitleAdd' })
    const className = addButton.getAttribute('class') ?? ''

    expect(className.includes('text-start')).toBe(true)
    expect(className.includes('w-full')).toBe(true)
    expect(addButton.querySelector('.w-12')).not.toBeNull()
  })

  it('re-enables subtitle confirm buttons when delete throws', async () => {
    const onDeleteSub = vi.fn().mockRejectedValue(new Error('delete failed'))

    render(
      <TrackCardSubtitles
        track={{ id: 't1', name: 'Track', activeSubtitleId: 's1' } as never}
        subtitles={
          [
            { id: 's1', name: 'Sub 1' },
            { id: 's2', name: 'Sub 2' },
          ] as never
        }
        density="comfortable"
        onPlay={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onDeleteSub={onDeleteSub}
        onAddSub={vi.fn()}
      />
    )

    fireEvent.click(screen.getAllByLabelText('commonDelete')[0])
    const cancelButton = screen.getByRole('button', { name: 'commonCancel' })
    const deleteButton = screen.getByTestId('subtitle-delete-confirm-s1')

    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(onDeleteSub).toHaveBeenCalledWith('s1')
      expect(cancelButton.hasAttribute('disabled')).toBe(false)
      expect(deleteButton.hasAttribute('disabled')).toBe(false)
    })
  })
})
