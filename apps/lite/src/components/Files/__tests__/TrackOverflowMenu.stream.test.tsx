import { fireEvent, render, screen } from '@testing-library/react'
import React, { type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../../ui/button'
import { TrackOverflowMenu } from '../TrackOverflowMenu'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('../../ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => null,
  DropdownMenuItem: Object.assign(
    React.forwardRef<
      HTMLButtonElement,
      {
        children: ReactNode
        onSelect?: (e: { preventDefault: () => void; stopPropagation: () => void }) => void
      }
    >(({ children, onSelect }, ref) => (
      <Button
        ref={ref}
        type="button"
        onClick={() =>
          onSelect?.({
            preventDefault: () => {},
            stopPropagation: () => {},
          })
        }
      >
        {children}
      </Button>
    )),
    { displayName: 'DropdownMenuItem' }
  ),
}))

describe('TrackOverflowMenu actions', () => {
  it('does not render play-without-transcript action', () => {
    render(
      <TrackOverflowMenu
        folders={[]}
        currentFolderId={null}
        onMove={() => {}}
        onRename={() => {}}
        onDeleteTrack={async () => true}
      />
    )

    expect(screen.queryByRole('button', { name: 'playWithoutTranscript' })).toBeNull()
  })

  it('renders transcribe action when track has no subtitle and triggers handler', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'asrGenerateSubtitles' }))
    expect(onTranscribe).toHaveBeenCalledTimes(1)
  })

  it('renders retranscribe action when track already has subtitles', () => {
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

    expect(screen.getByRole('button', { name: 'asrRegenerateSubtitles' })).toBeDefined()
  })
})
