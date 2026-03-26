import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectionAnchorPosition, SelectionState } from '../../../lib/selection'
import { Word } from '../../Transcript/Word'
import { SelectionUI } from '../SelectionUI'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const basePosition: SelectionAnchorPosition = { x: 100, y: 100 }
const mockOwner = {
  ownerCueKey: 'test-cue',
  ownerCueStartMs: 0,
  ownerKind: 'word' as const,
  ownerTokenInstanceId: 'id-1',
}

describe('SelectionUI - Transcript Contract (040b)', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.clearAllMocks()
  })

  const baseState: SelectionState = {
    surface: { type: 'none' },
    lookupLoading: false,
    lookupErrorKey: null,
    lookupResult: null,
  }

  it('restores focus to a specific word instance when dismissing WordContextMenu', async () => {
    // Setup: Word element in DOM
    const word = document.createElement('div')
    word.setAttribute('data-owner-instance-id', 'id-1')
    word.tabIndex = 0
    document.body.appendChild(word)

    const onClose = vi.fn()
    render(
      <SelectionUI
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
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    const backdrop = document.querySelector('[data-selection-backdrop="true"]')!

    act(() => {
      backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'dismiss' }))
    // restoreFocus is called internally; in JSDOM we check activeElement
    expect(document.activeElement).toBe(word)
  })

  it('restores focus to transcript container as fallback if target is missing', async () => {
    // Setup: Transcript container
    const container = document.createElement('div')
    container.id = 'transcript-container'
    container.tabIndex = 0
    document.body.appendChild(container)

    const onClose = vi.fn()
    render(
      <SelectionUI
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: basePosition,
            owner: mockOwner, // id-1 is missing from DOM
            surfaceId: 1,
          },
        }}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    const backdrop = document.querySelector('[data-selection-backdrop="true"]')!

    act(() => {
      backdrop.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    })

    expect(document.activeElement).toBe(container)
  })

  it('uses z-menu token for both backdrop and surface content', () => {
    render(
      <SelectionUI
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
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const backdrop = document.querySelector('[data-selection-backdrop="true"]')!
    const surface = screen.getByTestId('word-context-menu')

    expect(backdrop.classList.contains('z-menu')).toBe(true)
    expect(surface.classList.contains('z-menu')).toBe(true)
  })

  it('does not restore focus when switching surfaces (right-click on another word)', () => {
    const word1 = document.createElement('div')
    word1.setAttribute('data-owner-instance-id', 'id-1')
    word1.tabIndex = 0
    document.body.appendChild(word1)

    const word2 = document.createElement('div')
    word2.setAttribute('data-lookup-word', 'true')
    word2.tabIndex = 0
    document.body.appendChild(word2)

    const onClose = vi.fn()
    render(
      <SelectionUI
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
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    const backdrop = document.querySelector('[data-selection-backdrop="true"]')!

    // Simulate right click on word2
    // We mock elementFromPoint as JSDOM doesn't support it
    const originalElementFromPoint = document.elementFromPoint
    document.elementFromPoint = () => word2

    act(() => {
      backdrop.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          button: 2,
          clientX: 0,
          clientY: 0,
        })
      )
    })

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ reason: 'switch' }))
    // Should NOT have restored focus to word1
    expect(document.activeElement).not.toBe(word1)

    document.elementFromPoint = originalElementFromPoint
  })

  it('stopwords have no lookup-capable affordance, while eligible words still dispatch lookup', () => {
    const stopwordLookup = vi.fn()
    const eligibleLookup = vi.fn()

    const { rerender, container } = render(
      <Word
        text="the"
        cueKey="test-cue"
        cueStartMs={0}
        onClick={stopwordLookup}
        onContextMenu={vi.fn()}
      />
    )

    const stopword = container.querySelector('[data-lookup-word="true"]') as HTMLElement
    vi.spyOn(stopword, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 40,
      height: 16,
      right: 140,
      bottom: 116,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    expect(stopword.className).not.toContain('cursor-pointer')
    expect(stopword.className).not.toContain('hover:bg-primary/10')
    expect(stopword.className).not.toContain('focus-visible:ring-primary')

    act(() => {
      stopword.click()
    })
    act(() => {
      stopword.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })

    expect(stopwordLookup).not.toHaveBeenCalled()

    rerender(
      <Word
        text="hello"
        cueKey="test-cue"
        cueStartMs={0}
        onClick={eligibleLookup}
        onContextMenu={vi.fn()}
      />
    )

    const eligibleWord = container.querySelector('[data-lookup-word="true"]') as HTMLElement
    vi.spyOn(eligibleWord, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 40,
      height: 16,
      right: 140,
      bottom: 116,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    expect(eligibleWord.className).toContain('cursor-pointer')
    expect(eligibleWord.className).toContain('hover:bg-primary/10')
    expect(eligibleWord.className).toContain('focus-visible:ring-primary')

    act(() => {
      eligibleWord.click()
    })

    expect(eligibleLookup).toHaveBeenCalledTimes(1)
    expect(eligibleLookup).toHaveBeenCalledWith(
      'hello',
      expect.any(Object),
      expect.objectContaining({
        ownerCueKey: 'test-cue',
        ownerKind: 'word',
      })
    )
  })

  it('omits look up for stopwords and preserves it for eligible word context menus', () => {
    const { rerender } = render(
      <SelectionUI
        state={{
          ...baseState,
          surface: {
            type: 'contextMenu',
            selectedText: 'the',
            menuMode: 'word',
            position: basePosition,
            owner: mockOwner,
            surfaceId: 1,
          },
        }}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.queryByText('lookUp')).toBeNull()

    rerender(
      <SelectionUI
        state={{
          ...baseState,
          surface: {
            type: 'contextMenu',
            selectedText: 'hello',
            menuMode: 'word',
            position: basePosition,
            owner: mockOwner,
            surfaceId: 2,
          },
        }}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('lookUp')).toBeTruthy()
  })
})
