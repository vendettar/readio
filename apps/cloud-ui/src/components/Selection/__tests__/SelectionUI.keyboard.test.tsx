import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectionAnchorPosition } from '../../../lib/selection'
import { LookupCallout, RangeActionMenu, WordContextMenu } from '../SelectionUI'

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

const basePosition: SelectionAnchorPosition = { x: 120, y: 80 }
const mockOwner = {
  ownerCueKey: 'test-cue',
  ownerCueStartMs: 1000,
  ownerKind: 'word' as const,
  ownerTokenInstanceId: 'test-id',
}
const originalResizeObserver = globalThis.ResizeObserver

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('SelectionUI keyboard contracts', () => {
  beforeEach(() => {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
  })

  afterEach(() => {
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
      return
    }
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  })

  it('focuses context action and supports arrow navigation + Esc close', async () => {
    const onClose = vi.fn()

    render(
      <WordContextMenu
        position={basePosition}
        selectedText="example"
        menuMode="word"
        surfaceId={1}
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    const menu = await screen.findByRole('menu')
    const items = screen.getAllByRole('menuitem')

    // In JSDOM with controlled open, we want to ensure we can navigate.
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(items.some((item) => document.activeElement === item)).toBe(true)

    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('closes looking up correctly via Esc', async () => {
    const onClose = vi.fn()

    render(
      <LookupCallout
        surfaceId={1}
        position={{ x: 200, y: 140 }}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={onClose}
      />
    )

    // Wait for the callout to be in document
    const callout = await screen.findByRole('dialog')

    act(() => {
      fireEvent.keyDown(callout, { key: 'Escape' })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('is non-modal and has no blocker layer for lookup', async () => {
    render(
      <LookupCallout
        surfaceId={1}
        position={{ x: 200, y: 140 }}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />
    )

    // Wait for the callout to be in document
    await screen.findByRole('dialog')

    // The transparent overlay for modal behavior should be removed for non-modal contract.
    const overlay = screen.queryByTestId('lookup-overlay')
    expect(overlay).toBeNull()
  })

  it('renders context menu with non-modal outside interaction', async () => {
    const onClose = vi.fn()
    render(
      <WordContextMenu
        position={basePosition}
        selectedText="example"
        menuMode="word"
        surfaceId={1}
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    const content = await screen.findByRole('menu')
    expect(content).toBeTruthy()
    // It should NOT have a global overlay since it's non-modal
    const overlay = screen.queryByTestId('lookup-overlay')
    expect(overlay).toBeNull()
  })

  it('dismisses lookup without click-through to underlying elements', async () => {
    const onBackgroundClick = vi.fn()
    const onLookupClose = vi.fn()

    render(
      <main>
        <button type="button" data-testid="bg-button" onClick={onBackgroundClick}>
          Underlying Action
        </button>
        <LookupCallout
          surfaceId={1}
          position={{ x: 300, y: 200 }}
          word="example"
          loading={false}
          errorKey={null}
          result={null}
          owner={mockOwner}
          onClose={onLookupClose}
        />
      </main>
    )

    // Verify lookup is visible
    expect(await screen.findByText('lookUpResult')).toBeTruthy()

    // For non-modal dismissal without a blocker, we simulate a pointerdown on the background element.
    // Our capture listener should catch it, call onClose, and stop propagation.
    const bgButton = screen.getByTestId('bg-button')

    act(() => {
      // Create a real pointerdown event to test propagation
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
      bgButton.dispatchEvent(event)
    })

    expect(onLookupClose).toHaveBeenCalled()
    expect(onBackgroundClick).not.toHaveBeenCalled()
  })

  it('range action menu uses standard menu system style and role', async () => {
    const onClose = vi.fn()
    render(
      <RangeActionMenu
        surfaceId={1}
        position={basePosition}
        selectedText="example phrase"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    // Should have role menu, not toolbar
    const menu = await screen.findByRole('menu')
    expect(menu).toBeTruthy()

    // Should use the standard popover/menu background, not the black toolbar background
    expect(menu.className).toContain('bg-popover')
    expect(menu.className).not.toContain('bg-black')

    // Escape should close it
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('renders lookup error state instead of falling back to loading', () => {
    render(
      <LookupCallout
        surfaceId={1}
        position={{ x: 0, y: 0 }}
        word="example"
        loading={false}
        errorKey="errorNetwork"
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('errorNetwork')).toBeTruthy()
    expect(screen.queryByText('loading')).toBeNull()
  })

  it('renders the dedicated not-configured lookup state distinctly from not-found and network states', () => {
    render(
      <LookupCallout
        surfaceId={1}
        position={{ x: 0, y: 0 }}
        word="example"
        loading={false}
        errorKey="lookupDictionaryNotConfigured"
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('lookupDictionaryNotConfigured')).toBeTruthy()
    expect(screen.queryByText('lookupNotFound')).toBeNull()
    expect(screen.queryByText('errorNetwork')).toBeNull()
    expect(screen.queryByText('loading')).toBeNull()
  })

  it('dismisses context menu with absorption', async () => {
    const onBackgroundClick = vi.fn()
    const onClose = vi.fn()

    render(
      <main>
        <button type="button" data-testid="bg-button" onClick={onBackgroundClick}>
          Underlying Action
        </button>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="example"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={onClose}
        />
      </main>
    )

    await screen.findByRole('menu')
    const bgButton = screen.getByTestId('bg-button')

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
      })
      bgButton.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalled()
    expect(onBackgroundClick).not.toHaveBeenCalled()
  })

  it('renders word context menu without requiring a surrounding Radix root', async () => {
    render(
      <WordContextMenu
        surfaceId={1}
        position={basePosition}
        selectedText="example"
        menuMode="word"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(await screen.findByTestId('word-context-menu')).toBeTruthy()
  })

  it('does not bounce focus back to transcript when opening lookup from menu', async () => {
    const focusSpy = vi.fn()
    render(
      <div>
        <button type="button" data-owner-instance-id="test-id" onFocus={focusSpy}>
          Word
        </button>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="example"
          menuMode="word"
          owner={mockOwner}
          onCopy={vi.fn()}
          onSearch={vi.fn()}
          onLookup={vi.fn()}
          onClose={vi.fn()}
        />
      </div>
    )

    await screen.findByRole('menu')
    const lookupItem = screen.getByText('lookUp')

    // Reset spy because floating-ui might focus something initially
    focusSpy.mockClear()

    act(() => {
      fireEvent.click(lookupItem)
    })

    // Focus should NOT be on the word yet, because lookup surface is opening
    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('restores focus when LookupCallout close button is clicked', async () => {
    render(
      <div>
        <button type="button" data-testid="focus-target" data-owner-instance-id="test-id">
          Word
        </button>
        <LookupCallout
          surfaceId={1}
          position={{ x: 200, y: 140 }}
          word="example"
          loading={false}
          errorKey={null}
          result={null}
          owner={mockOwner}
          onClose={vi.fn()}
        />
      </div>
    )

    await screen.findByRole('dialog')
    const closeButton = screen.getByLabelText('ariaClose')
    const target = screen.getByTestId('focus-target')

    act(() => {
      fireEvent.click(closeButton)
    })

    expect(document.activeElement).toBe(target)
  })

  it('resets skipRestore state so it does not leak into subsequent closes', async () => {
    const focusSpy = vi.fn()

    const App = () => {
      const [open, setOpen] = React.useState(true)
      return (
        <div>
          <button
            type="button"
            data-testid="target"
            data-owner-instance-id="test-id"
            onFocus={focusSpy}
          >
            Word
          </button>
          <button type="button" data-testid="re-open" onClick={() => setOpen(true)}>
            Re-open
          </button>
          <WordContextMenu
            surfaceId={1}
            position={basePosition}
            selectedText="example"
            menuMode="word"
            owner={mockOwner}
            onCopy={vi.fn()}
            onSearch={vi.fn()}
            onLookup={vi.fn()}
            onClose={() => setOpen(false)}
            open={open}
          />
        </div>
      )
    }

    render(<App />)

    // Verify it is open
    expect(await screen.findByRole('menu')).toBeTruthy()

    // 1. Click lookup -> sets skipRestoreRef = true
    const lookupItem = screen.getByText('lookUp')
    focusSpy.mockClear()
    act(() => {
      fireEvent.click(lookupItem)
    })

    // Wait for it to close
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    // Focus should NOT have been restored yet
    expect(focusSpy).not.toHaveBeenCalled()

    // 2. Re-open
    const reOpenBtn = screen.getByTestId('re-open')
    act(() => {
      fireEvent.click(reOpenBtn)
    })
    expect(await screen.findByRole('menu')).toBeTruthy()

    // 3. Close normally (e.g. Escape)
    const menu = screen.getByRole('menu')
    act(() => {
      fireEvent.keyDown(menu, { key: 'Escape' })
    })

    // Wait for it to close
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())

    // Now it SHOULD restore focus because skipRestoreRef was reset in Cycle 1's onCloseAutoFocus
    expect(focusSpy).toHaveBeenCalled()
  })

  it('does NOT restore focus to old owner when right-clicking another valid word target', async () => {
    const focusSpy = vi.fn()
    const onClose = vi.fn()

    render(
      <div>
        <button
          type="button"
          data-testid="old-owner"
          data-owner-instance-id="test-id"
          onFocus={focusSpy}
        >
          Old Word
        </button>
        <div className="reading-area">
          <span data-lookup-word="true" data-testid="new-word">
            New Word
          </span>
        </div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="example"
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

    focusSpy.mockClear()

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 2,
      })
      newWord.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalled()
    // Focus should NOT be pulled back to old owner during the switch
    expect(focusSpy).not.toHaveBeenCalled()
  })

  it('STILL restores focus when left-clicking outside to dismiss', async () => {
    const focusSpy = vi.fn()
    const onClose = vi.fn()

    render(
      <div>
        <button
          type="button"
          data-testid="target"
          data-owner-instance-id="test-id"
          onFocus={focusSpy}
        >
          Word
        </button>
        <div data-testid="outside">Outside</div>
        <WordContextMenu
          surfaceId={1}
          position={basePosition}
          selectedText="example"
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
    const outside = screen.getByTestId('outside')

    focusSpy.mockClear()

    act(() => {
      const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        button: 0,
      })
      outside.dispatchEvent(event)
    })

    expect(onClose).toHaveBeenCalled()
    // Should restore focus on background click
    expect(focusSpy).toHaveBeenCalled()
  })
})
