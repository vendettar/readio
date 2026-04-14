import { useRef } from 'react'
import type { SelectionOwner } from '../lib/selection'
import { useSelectionActions } from './selection/useSelectionActions'
import { useSelectionEvents } from './selection/useSelectionEvents'
import { useSelectionState } from './selection/useSelectionState'

interface UseSelectionOptions {
  lookupLanguage?: string
}

function withLookupLanguage(owner: SelectionOwner, lookupLanguage?: string): SelectionOwner {
  if (!lookupLanguage) return owner
  return { ...owner, lookupLanguage } as SelectionOwner
}

export function useSelection(
  containerRef: React.RefObject<HTMLElement | null>,
  options?: UseSelectionOptions
) {
  const { state, setState } = useSelectionState()
  const actions = useSelectionActions(state, setState)
  const wasDraggingRef = useRef(false)
  const lookupLanguage = options?.lookupLanguage

  // Setup event handlers
  useSelectionEvents(containerRef, actions, wasDraggingRef)

  return {
    state,
    wasDraggingRef,
    copyText: () => {
      if (state.surface.type === 'contextMenu' || state.surface.type === 'rangeActionMenu') {
        actions.copyText(state.surface.selectedText)
      }
    },
    searchWeb: () => {
      if (state.surface.type === 'contextMenu' || state.surface.type === 'rangeActionMenu') {
        actions.searchWeb(state.surface.selectedText)
      }
    },
    openWordMenu: actions.openWordMenu,
    openLineMenu: actions.openLineMenu,
    lookupWord: (word: string, x: number, y: number, rect: DOMRect, owner: SelectionOwner) =>
      actions.lookupWord(word, x, y, rect, withLookupLanguage(owner, lookupLanguage)),
    lookupFromMenu: () => {
      if (state.surface.type === 'contextMenu' || state.surface.type === 'rangeActionMenu') {
        const { x, y, rect } = state.surface.position
        const finalRect = rect || { left: x, top: y, right: x, bottom: y, width: 0, height: 0 }
        actions.lookupWord(
          state.surface.selectedText,
          x,
          y,
          finalRect,
          withLookupLanguage(state.surface.owner, lookupLanguage)
        )
      }
    },
    closeUI: (options?: {
      reason?: 'dismiss' | 'switch'
      surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
    }) => {
      // Dispatch to specific cleanup based on surface type to ensure
      // correct side-effects (like aborting pending lookup requests)
      if (state.surface.type === 'lookup') {
        actions.closeLookup(options)
      } else {
        actions.closeMenu(options)
      }
    },
  }
}
