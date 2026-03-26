// src/hooks/selection/__tests__/useSelectionEvents.no-geometric-lookup.test.ts
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSelectionEvents } from '../useSelectionEvents'

const { loadDictCacheMock } = vi.hoisted(() => ({
  loadDictCacheMock: vi.fn(),
}))

vi.mock('../../../lib/selection', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/selection')>('../../../lib/selection')
  return {
    ...actual,
    loadDictCache: loadDictCacheMock,
  }
})

function containerRef(el: HTMLElement) {
  return { current: el }
}

describe('useSelectionEvents - semantics and boundary integrity', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    container.className = 'reading-area'
    document.body.appendChild(container)
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    if (container.parentElement) {
      document.body.removeChild(container)
    }
    window.getSelection()?.removeAllRanges()
    vi.useRealTimers()
  })

  it('clears interaction state when releasing outside container', () => {
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      // Press inside
      container.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'touch',
        })
      )
      // Long press to commit
      vi.advanceTimersByTime(400)

      // Release outside
      window.dispatchEvent(
        new PointerEvent('pointerup', { bubbles: true, clientX: 500, clientY: 500 })
      )
    })

    // Should have canceled interaction because no selection was found after commit
    expect(actions.cancelInteraction).toHaveBeenCalled()
  })

  it('does not pause on mouse move without selection (semantics-first)', () => {
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      container.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'mouse',
        })
      )
      // Move past 10px threshold
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 50,
          clientY: 10,
          pointerType: 'mouse',
        })
      )
    })

    // Should NOT pause yet because selection is collapsed
    expect(actions.prepareInteraction).not.toHaveBeenCalled()

    // Now simulate selection appearing
    const textNode = document.createTextNode('hello world')
    container.appendChild(textNode)
    const range = document.createRange()
    range.selectNode(textNode)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })

    // Now it should pause
    expect(actions.prepareInteraction).toHaveBeenCalled()
  })

  it('does not pause on touch move without selection (semantics-first)', () => {
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      container.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'touch',
        })
      )
      // Move past threshold
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          bubbles: true,
          clientX: 50,
          clientY: 10,
          pointerType: 'touch',
        })
      )
    })

    expect(actions.prepareInteraction).not.toHaveBeenCalled()
  })

  it('pauses on touch long-press delay (touch fallback)', () => {
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      container.dispatchEvent(
        new PointerEvent('pointerdown', {
          bubbles: true,
          clientX: 10,
          clientY: 10,
          button: 0,
          pointerType: 'touch',
        })
      )
      vi.advanceTimersByTime(400)
    })

    expect(actions.prepareInteraction).toHaveBeenCalled()
  })

  it('contextmenu on non-interactive area does not pause (state machine integrity)', () => {
    const actions = {
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
    }

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    // Right-click on empty div (no .subtitle-line)
    const emptyIcon = document.createElement('div')
    emptyIcon.className = 'some-random-icon'
    container.appendChild(emptyIcon)

    act(() => {
      emptyIcon.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    })

    // Should NOT pause because it's not a valid menu target
    expect(actions.prepareInteraction).not.toHaveBeenCalled()
  })

  it('does not downgrade a word contextmenu into a line menu', () => {
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
    text.textContent = 'Hello world'

    const word = document.createElement('span')
    word.setAttribute('data-lookup-word', 'true')
    word.textContent = 'Hello'

    text.appendChild(word)
    line.appendChild(text)
    container.appendChild(line)

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      word.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 20,
        })
      )
    })

    expect(actions.openLineMenu).not.toHaveBeenCalled()
    expect(actions.prepareInteraction).not.toHaveBeenCalled()
  })

  it('does not treat line-background right-click as selected-text menu when a range exists elsewhere in the line', () => {
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
    text.textContent = 'Hello world'

    const word = document.createElement('span')
    word.setAttribute('data-lookup-word', 'true')
    word.textContent = 'Hello'

    const spacer = document.createElement('span')
    spacer.textContent = ' '

    text.appendChild(word)
    text.appendChild(spacer)
    line.appendChild(text)
    container.appendChild(line)

    const range = document.createRange()
    range.selectNodeContents(word)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    renderHook(() => useSelectionEvents(containerRef(container), actions))

    act(() => {
      text.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 20,
        })
      )
    })

    expect(actions.openLineMenu).not.toHaveBeenCalledWith(
      'Hello',
      expect.any(Number),
      expect.any(Number),
      expect.anything(),
      expect.anything(),
      'word'
    )
  })
})
