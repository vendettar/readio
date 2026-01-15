// src/hooks/selection/useSelectionState.ts
// State management for text selection
import { useState } from 'react'
import type { SelectionState } from '../../libs/selection'

const initialState: SelectionState = {
  showMenu: false,
  menuPosition: { x: 0, y: 0 },
  selectedText: '',
  menuMode: 'word',
  showLookup: false,
  lookupPosition: { x: 0, y: 0 },
  lookupWord: '',
  lookupLoading: false,
  lookupErrorKey: null,
  lookupResult: null,
  hoverWord: '',
  hoverRects: [],
}

export function useSelectionState() {
  const [state, setState] = useState<SelectionState>(initialState)

  return {
    state,
    setState,
    resetState: () => setState(initialState),
  }
}
