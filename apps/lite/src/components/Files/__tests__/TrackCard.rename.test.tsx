import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TrackCard } from '../TrackCard'

const dragStartSpy = vi.fn()

vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: { 'data-draggable': 'true' },
    listeners: { onMouseDown: dragStartSpy },
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}))

vi.mock('../../../hooks/useImageObjectUrl', () => ({
  useImageObjectUrl: () => null,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } }),
  initReactI18next: { type: '3rdParty', init: () => {} },
}))

vi.mock('../TrackOverflowMenu', () => ({
  TrackOverflowMenu: ({ onRename }: { onRename: () => void }) => (
    <button type="button" onClick={onRename}>
      rename-trigger
    </button>
  ),
}))

vi.mock('../../ui/tooltip', () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

describe('TrackCard rename behavior', () => {
  it('uses shared inline rename and avoids drag-listener activation while renaming', () => {
    const onRename = vi.fn()

    render(
      <TrackCard
        track={{ id: 't1', name: 'Track One' } as never}
        subtitles={[] as never}
        folders={[] as never}
        existingTrackNames={['Track One', 'Another']}
        onPlay={vi.fn()}
        onSetActiveSubtitle={vi.fn()}
        onRename={onRename}
        onDeleteTrack={vi.fn(async () => true)}
        onDeleteSub={vi.fn()}
        onAddSub={vi.fn()}
        onMove={vi.fn()}
      />
    )

    fireEvent.click(screen.getByText('rename-trigger'))
    const input = screen.getByRole('textbox')

    fireEvent.change(input, { target: { value: 'Another' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    fireEvent.mouseDown(screen.getByTestId('play-track-btn').closest('div') as HTMLElement)
    expect(dragStartSpy).toHaveBeenCalledTimes(0)
  })
})
