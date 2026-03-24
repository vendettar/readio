// src/hooks/selection/useSelectionState.ts
// State management for text selection
import { useState } from 'react'
import type { SelectionState } from '../../lib/selection'

const initialState: SelectionState = {
  surface: { type: 'none' },
  lookupLoading: false,
  lookupErrorKey: null,
  lookupResult: null,
}

export function useSelectionState() {
  const [state, setState] = useState<SelectionState>(initialState)

  return {
    state,
    setState,
    resetState: () => setState(initialState),
  }
}
