import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectionAnchorPosition, SelectionState } from '../../../lib/selection'
import { LookupCallout, RangeActionMenu, SelectionUI, WordContextMenu } from '../SelectionUI'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const basePosition: SelectionAnchorPosition = { x: 100, y: 100 }
const mockOwner = {
  ownerCueKey: 'test',
  ownerCueStartMs: 0,
  ownerKind: 'word' as const,
  ownerTokenInstanceId: 'id-1',
}

describe('SelectionUI - Surface Interaction & Viewport Lock Coexistence', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  const baseState: SelectionState = {
    surface: { type: 'none' },
    lookupLoading: false,
    lookupErrorKey: null,
    lookupResult: null,
  }

  const mockProps = {
    state: baseState,
    onCopy: vi.fn(),
    onSearch: vi.fn(),
    onLookup: vi.fn(),
    onClose: vi.fn(),
  }

  it('allows background click-to-dismiss while viewport lock is active', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="background">Background Area</div>
        <SelectionUI
          {...mockProps}
          onClose={onClose}
          state={{
            ...baseState,
            surface: {
              type: 'lookup',
              word: 'test',
              position: basePosition,
              owner: mockOwner,
              surfaceId: 1,
            },
          }}
        />
      </div>
    )

    // Verify lock is acquired
    expect(document.body.style.overflow).toBe('hidden')

    const background = screen.getByTestId('background')

    // Simulate pointerdown on background
    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
      })
      background.dispatchEvent(event)
    })

    // The viewport lock MUST NOT intercept pointerdown, so SelectionUI's logic should trigger onClose
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dismiss' }))
  })

  it('allows right-click switching while viewport lock is active', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="new-word" data-lookup-word="true">
          New Target
        </div>
        <SelectionUI
          {...mockProps}
          onClose={onClose}
          state={{
            ...baseState,
            surface: {
              type: 'contextMenu',
              selectedText: 'test',
              menuMode: 'word',
              position: basePosition,
              owner: mockOwner,
              surfaceId: 1,
            },
          }}
        />
      </div>
    )

    const newTarget = screen.getByTestId('new-word')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      newTarget.dispatchEvent(event)
    })

    // The viewport lock MUST NOT swallow the pointerdown event
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'switch' }))
  })
})

describe('SelectionUI - Surface Switching Logic (Original Tests)', () => {
  it('calls onClose with reason: switch when right-clicking another valid target while WordContextMenu is open', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="new-word" data-lookup-word="true">
          New Word
        </div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const newWord = screen.getByTestId('new-word')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      newWord.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'switch', surface: 'contextMenu' })
    )
  })

  it('calls onClose with reason: switch when right-clicking another valid target while RangeActionMenu is open', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="new-word" data-lookup-word="true">
          New Word
        </div>
        <RangeActionMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const newWord = screen.getByTestId('new-word')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      newWord.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'switch', surface: 'rangeActionMenu' })
    )
  })

  it('calls onClose with reason: switch when right-clicking another valid target while LookupCallout is open', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="new-word" data-lookup-word="true">
          New Word
        </div>
        <LookupCallout
          surfaceId={1}
          position={basePosition}
          word="test"
          loading={false}
          errorKey={null}
          result={null}
          owner={mockOwner}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('dialog')
    const newWord = screen.getByTestId('new-word')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      newWord.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'switch' }))
  })

  it('calls onClose with reason: dismiss when right-clicking a non-target area', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="background">Background</div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const background = screen.getByTestId('background')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      background.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'dismiss', surface: 'contextMenu' })
    )
  })

  it('calls onClose with reason: dismiss when left-clicking outside', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="background">Background</div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const background = screen.getByTestId('background')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0, // Left click
      })
      background.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dismiss' }))
  })

  it('treats right-click on existing surface as dismiss if not on a word/line', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-testid="surface-bg" data-selection-surface="true">
          Surface Background
        </div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const surfaceBg = screen.getByTestId('surface-bg')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      surfaceBg.dispatchEvent(event)
    })

    // Now it should be 'dismiss' because it's not a word/line target anymore
    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dismiss' }))
  })

  it('calls onClose with reason: switch when right-clicking a child element of a line container', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div data-line-index="5">
          <span data-testid="line-child">Inner text of a line</span>
        </div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const child = screen.getByTestId('line-child')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
      })
      child.dispatchEvent(event)
    })

    // Should be 'switch' because its parent has data-line-index
    expect(onClose).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'switch', surface: 'contextMenu' })
    )
  })

  it('correctly detects targets through the backdrop during right-click switch', async () => {
    const onClose = vi.fn()
    render(
      <div>
        <div
          data-testid="target-word"
          data-lookup-word="true"
          style={{ position: 'fixed', left: '50px', top: '50px', width: '20px', height: '20px' }}
        >
          Target
        </div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="test"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </div>
    )

    await screen.findByRole('menu')
    const backdrop = document.querySelector('[data-selection-backdrop="true"]')!
    expect(backdrop).toBeDefined()

    // Mock document.elementFromPoint if it's missing or needs stubbing
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = vi.fn().mockReturnValue(screen.getByTestId('target-word'))

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 2, // Right click
        clientX: 50,
        clientY: 50,
      })
      backdrop.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'switch' }))
    document.elementFromPoint = originalElementFromPoint
  })
})
