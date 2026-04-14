import { act, renderHook } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectionEvents } from '../useSelectionEvents'

describe('useSelectionEvents - dragging state lifecycle', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.className = 'reading-area'
    document.body.appendChild(container)
  })

  afterEach(() => {
    if (container.parentElement) {
      document.body.removeChild(container)
    }
    vi.clearAllMocks()
    window.getSelection()?.removeAllRanges()
  })

  it('resets sharedWasDraggingRef.current to false on new pointerup', () => {
    const sharedWasDraggingRef: React.RefObject<boolean> = { current: true }

    renderHook(() =>
      useSelectionEvents(
        { current: container },
        {
          openRangeMenu: vi.fn(),
          openLineMenu: vi.fn(),
          prepareInteraction: vi.fn(),
          cancelInteraction: vi.fn(),
          closeMenu: vi.fn(),
          closeLookup: vi.fn(),
        },
        sharedWasDraggingRef
      )
    )

    act(() => {
      // Must start interaction to be able to finish it
      container.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 })
      )
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 10, clientY: 10 })
      )
    })

    expect(sharedWasDraggingRef.current).toBe(false)
  })

  it('sets sharedWasDraggingRef.current to true when movement exceeds threshold', () => {
    const sharedWasDraggingRef: React.RefObject<boolean> = { current: false }

    renderHook(() =>
      useSelectionEvents(
        { current: container },
        {
          openRangeMenu: vi.fn(),
          openLineMenu: vi.fn(),
          prepareInteraction: vi.fn(),
          cancelInteraction: vi.fn(),
          closeMenu: vi.fn(),
          closeLookup: vi.fn(),
        },
        sharedWasDraggingRef
      )
    )

    // Mock a selection range
    const textNode = document.createTextNode('sample text')
    container.appendChild(textNode)
    const range = document.createRange()
    range.selectNode(textNode)
    range.getBoundingClientRect = () => new DOMRect(0, 0, 100, 20)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    act(() => {
      // Start at 10,10
      container.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'mouse',
        })
      )
      // Move to 50,50 (large movement > 10px)
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 50,
          clientY: 50,
          pointerType: 'mouse',
        })
      )
      // End
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 50, clientY: 50 })
      )
    })

    expect(sharedWasDraggingRef.current).toBe(true)
  })

  it('resets sharedWasDraggingRef.current on every interaction cycle', () => {
    const sharedWasDraggingRef: React.RefObject<boolean> = { current: true }

    renderHook(() =>
      useSelectionEvents(
        { current: container },
        {
          openRangeMenu: vi.fn(),
          openLineMenu: vi.fn(),
          prepareInteraction: vi.fn(),
          cancelInteraction: vi.fn(),
          closeMenu: vi.fn(),
          closeLookup: vi.fn(),
        },
        sharedWasDraggingRef
      )
    )

    act(() => {
      container.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    })

    expect(sharedWasDraggingRef.current).toBe(false)
  })

  it('treats word-origin drag as selection intent and opens range menu instead of click intent', () => {
    const sharedWasDraggingRef: React.RefObject<boolean> = { current: false }
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    const line = document.createElement('div')
    line.className = 'subtitle-line'
    line.setAttribute('data-owner-cue-key', 'cue-1')
    line.setAttribute('data-owner-cue-start', '0')
    line.setAttribute('data-owner-kind', 'line')

    const text = document.createElement('p')
    text.className = 'subtitle-text'

    const word = document.createElement('span')
    word.setAttribute('data-lookup-word', 'true')
    word.setAttribute('data-owner-cue-key', 'cue-1')
    word.setAttribute('data-owner-cue-start', '0')
    word.setAttribute('data-owner-kind', 'word')
    word.textContent = 'Hello'

    text.appendChild(word)
    line.appendChild(text)
    container.appendChild(line)

    renderHook(() => useSelectionEvents({ current: container }, actions, sharedWasDraggingRef))

    const wordTextNode = word.firstChild as Text
    const range = document.createRange()
    range.setStart(wordTextNode, 0)
    range.setEnd(wordTextNode, 5)
    range.getBoundingClientRect = () => new DOMRect(10, 10, 50, 16)

    act(() => {
      word.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'mouse',
        })
      )

      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 40,
          clientY: 10,
          pointerType: 'mouse',
        })
      )

      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))

      word.dispatchEvent(
        new PointerEvent('pointerup', {
          bubbles: true,
          clientX: 40,
          clientY: 10,
          button: 0,
          pointerType: 'mouse',
        })
      )
    })

    expect(sharedWasDraggingRef.current).toBe(true)
    expect(actions.prepareInteraction).toHaveBeenCalled()
    expect(actions.openRangeMenu).toHaveBeenCalledTimes(1)
    expect(actions.openRangeMenu).toHaveBeenCalledWith(
      'Hello',
      expect.any(Number),
      expect.any(Number),
      expect.any(Object),
      expect.objectContaining({
        ownerCueKey: 'cue-1',
        ownerKind: 'word',
      })
    )
  })
})
