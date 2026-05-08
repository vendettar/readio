import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import { applyLookupHighlightForWord } from '../../lib/selection/dictCache'
import type { SelectionState } from '../../lib/selection'
import { useTranscriptStore } from '../../store/transcriptStore'
import type { SelectionInteractionCancelOptions } from './selectionInteractionRuntime'

export interface SelectionSurfaceCloseOptions extends SelectionInteractionCancelOptions {
  surface?: 'contextMenu' | 'rangeActionMenu' | 'lookup'
  surfaceId?: number
}

export interface SelectionSurfaceRuntimeRefs {
  abortRef: MutableRefObject<AbortController | null>
  activeSurfaceIdRef: MutableRefObject<number | undefined>
  activeSurfaceTypeRef: MutableRefObject<SelectionState['surface']['type']>
  pendingLookupHighlightWordRef: MutableRefObject<string | null>
}

function resetSelectionSurfaceState(
  setState: Dispatch<SetStateAction<SelectionState>>
): void {
  setState({
    surface: { type: 'none' },
    lookupLoading: false,
    lookupErrorKey: null,
    lookupResult: null,
  })
}

function clearSelectionSideEffects(): void {
  useTranscriptStore.getState().setHighlightedWord(null)
  window.getSelection()?.removeAllRanges()
}

export function shouldIgnoreSelectionSurfaceClose(
  refs: Pick<SelectionSurfaceRuntimeRefs, 'activeSurfaceIdRef' | 'activeSurfaceTypeRef'>,
  options?: SelectionSurfaceCloseOptions
): boolean {
  if (options?.surfaceId && refs.activeSurfaceIdRef.current !== options.surfaceId) {
    return true
  }

  if (!options?.surfaceId && options?.surface && refs.activeSurfaceTypeRef.current !== options.surface) {
    return true
  }

  return false
}

export function completeSelectionSurfaceClose(input: {
  refs: SelectionSurfaceRuntimeRefs
  setState: Dispatch<SetStateAction<SelectionState>>
  cancelInteraction: (options?: SelectionSurfaceCloseOptions) => void
  options?: SelectionSurfaceCloseOptions
  abortLookupRequest?: boolean
  applyLookupHighlight?: boolean
}): boolean {
  if (shouldIgnoreSelectionSurfaceClose(input.refs, input.options)) {
    return false
  }

  if (input.abortLookupRequest && input.refs.abortRef.current) {
    input.refs.abortRef.current.abort()
    input.refs.abortRef.current = null
  }

  const pendingLookupHighlightWord = input.refs.pendingLookupHighlightWordRef.current
  if (input.applyLookupHighlight && pendingLookupHighlightWord) {
    applyLookupHighlightForWord(pendingLookupHighlightWord)
  }

  input.refs.activeSurfaceIdRef.current = undefined
  input.refs.activeSurfaceTypeRef.current = 'none'
  input.refs.pendingLookupHighlightWordRef.current = null

  resetSelectionSurfaceState(input.setState)
  clearSelectionSideEffects()
  input.cancelInteraction(input.options)
  return true
}
