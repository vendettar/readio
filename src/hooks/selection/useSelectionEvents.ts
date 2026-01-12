// src/hooks/selection/useSelectionEvents.ts
// Event handlers for text selection (mouse events)
// Optimized to minimize effect re-binding
import { useCallback, useEffect, useRef } from 'react'
import { getAppConfig } from '../../libs/runtimeConfig'
import type { SelectionState } from '../../libs/selection'
import { findWordAtPoint, isLookupEligible, loadDictCache } from '../../libs/selection'

export function useSelectionEvents(
  containerRef: React.RefObject<HTMLElement | null>,
  state: SelectionState,
  setState: React.Dispatch<React.SetStateAction<SelectionState>>,
  actions: {
    lookupWord: (word: string, x: number, y: number) => Promise<void>
    closeMenu: () => void
    closeLookup: () => void
  }
) {
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMouseDownRef = useRef(false)
  const lastHoverUpdateRef = useRef(0)

  // Store latest state in ref to avoid handler re-creation
  const stateRef = useRef(state)
  const actionsRef = useRef(actions)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    actionsRef.current = actions
  }, [actions])

  // Load cache on mount
  useEffect(() => {
    loadDictCache()
  }, [])

  // Stabilized handlers - no state dependencies
  const handleMouseDown = useCallback(() => {
    isMouseDownRef.current = true
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current)
      clickTimerRef.current = null
    }
    setState((s) => ({ ...s, hoverWord: '', hoverRects: [] }))
  }, [setState])

  const handleMouseUp = useCallback(
    (e: MouseEvent) => {
      isMouseDownRef.current = false
      const container = containerRef.current
      if (!container) return

      const selection = window.getSelection()
      if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0)
        if (container.contains(range.commonAncestorContainer)) {
          const text = selection.toString().trim()
          if (text) {
            const rect = range.getBoundingClientRect()
            setState((s) => ({
              ...s,
              showMenu: true,
              menuPosition: { x: rect.left + rect.width / 2, y: rect.top - 10 },
              selectedText: text,
              menuMode: 'word',
            }))
            return
          }
        }
      }

      const target = e.target as HTMLElement
      if (container.contains(target) && !stateRef.current.showLookup) {
        const wordInfo = findWordAtPoint(container, e.clientX, e.clientY)
        if (wordInfo && isLookupEligible(wordInfo.word)) {
          const rect = wordInfo.range.getBoundingClientRect()
          clickTimerRef.current = setTimeout(() => {
            clickTimerRef.current = null
            const sel = window.getSelection()
            if (sel?.isCollapsed) {
              actionsRef.current.lookupWord(
                wordInfo.word,
                rect.right + 10,
                rect.top + rect.height / 2
              )
            }
          }, getAppConfig().CLICK_DELAY_MS)
        }
      }
    },
    [containerRef, setState]
  )

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      const currentState = stateRef.current
      if (isMouseDownRef.current || currentState.showMenu || currentState.showLookup) return
      const container = containerRef.current
      if (!container) return

      const now = Date.now()
      if (now - lastHoverUpdateRef.current < 50) return
      lastHoverUpdateRef.current = now

      const target = e.target as HTMLElement
      if (!container.contains(target)) {
        setState((s) => (s.hoverWord ? { ...s, hoverWord: '', hoverRects: [] } : s))
        return
      }

      const wordInfo = findWordAtPoint(container, e.clientX, e.clientY)
      if (wordInfo && isLookupEligible(wordInfo.word)) {
        if (wordInfo.word !== currentState.hoverWord) {
          const rects = Array.from(wordInfo.range.getClientRects())
          setState((s) => ({ ...s, hoverWord: wordInfo.word, hoverRects: rects }))
        }
      } else if (currentState.hoverWord) {
        setState((s) => ({ ...s, hoverWord: '', hoverRects: [] }))
      }
    },
    [containerRef, setState]
  )

  const handleContextMenu = useCallback(
    (e: MouseEvent) => {
      const container = containerRef.current
      if (!container || !container.contains(e.target as HTMLElement)) return
      e.preventDefault()

      const selection = window.getSelection()
      let text = ''
      let mode: 'word' | 'line' = 'word'

      if (selection && !selection.isCollapsed) {
        text = selection.toString().trim()
      } else {
        const wordInfo = findWordAtPoint(container, e.clientX, e.clientY)
        if (wordInfo) {
          text = wordInfo.word
          selection?.removeAllRanges()
          selection?.addRange(wordInfo.range)
        }
      }

      if (!text) {
        const lineEl = (e.target as HTMLElement).closest('.subtitle-line')
        if (lineEl) {
          text = lineEl.textContent?.trim() || ''
          mode = 'line'
        }
      }

      if (text) {
        setState((s) => ({
          ...s,
          showMenu: true,
          menuPosition: { x: e.clientX, y: e.clientY - 10 },
          selectedText: text,
          menuMode: mode,
        }))
      }
    },
    [containerRef, setState]
  )

  // Stabilized scroll/resize handler
  const handleScroll = useCallback(() => {
    actionsRef.current.closeMenu()
    actionsRef.current.closeLookup()
  }, [])

  // Setup event listeners - minimized dependencies
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const mouseUpHandler = (e: Event) => handleMouseUp(e as MouseEvent)
    const mouseMoveHandler = (e: Event) => handleMouseMove(e as MouseEvent)
    const contextMenuHandler = (e: Event) => handleContextMenu(e as MouseEvent)

    container.addEventListener('mousedown', handleMouseDown)
    container.addEventListener('mouseup', mouseUpHandler)
    container.addEventListener('mousemove', mouseMoveHandler)
    container.addEventListener('contextmenu', contextMenuHandler)

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('resize', handleScroll)

    return () => {
      container.removeEventListener('mousedown', handleMouseDown)
      container.removeEventListener('mouseup', mouseUpHandler)
      container.removeEventListener('mousemove', mouseMoveHandler)
      container.removeEventListener('contextmenu', contextMenuHandler)
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('resize', handleScroll)
    }
  }, [
    containerRef,
    handleMouseDown,
    handleMouseUp,
    handleMouseMove,
    handleContextMenu,
    handleScroll,
  ])

  return {
    // No return needed - all effects are managed internally
  }
}
