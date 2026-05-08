import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectionState } from '../../../lib/selection'
import {
  completeSelectionSurfaceClose,
  shouldIgnoreSelectionSurfaceClose,
} from '../selectionSurfaceRuntime'

const { applyLookupHighlightForWordMock, setHighlightedWordMock } = vi.hoisted(() => ({
  applyLookupHighlightForWordMock: vi.fn(),
  setHighlightedWordMock: vi.fn(),
}))

vi.mock('../../../lib/selection/dictCache', () => ({
  applyLookupHighlightForWord: applyLookupHighlightForWordMock,
}))

vi.mock('../../../store/transcriptStore', () => ({
  useTranscriptStore: {
    getState: () => ({
      setHighlightedWord: setHighlightedWordMock,
    }),
  },
}))

describe('selectionSurfaceRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignores stale close requests by surface id or type mismatch', () => {
    const refs = {
      activeSurfaceIdRef: { current: 4 },
      activeSurfaceTypeRef: { current: 'lookup' as SelectionState['surface']['type'] },
    }

    expect(shouldIgnoreSelectionSurfaceClose(refs, { surfaceId: 5 })).toBe(true)
    expect(shouldIgnoreSelectionSurfaceClose(refs, { surface: 'contextMenu' })).toBe(true)
    expect(shouldIgnoreSelectionSurfaceClose(refs, { surfaceId: 4, surface: 'lookup' })).toBe(false)
  })

  it('applies lookup highlight, clears UI state, and cancels interaction on close', () => {
    const setState = vi.fn()
    const cancelInteraction = vi.fn()
    const removeAllRanges = vi.fn()
    vi.spyOn(window, 'getSelection').mockReturnValue({
      removeAllRanges,
    } as unknown as Selection)

    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')
    const refs = {
      abortRef: { current: abortController },
      activeSurfaceIdRef: { current: 7 },
      activeSurfaceTypeRef: { current: 'lookup' as SelectionState['surface']['type'] },
      pendingLookupHighlightWordRef: { current: 'hello' },
    }

    const closed = completeSelectionSurfaceClose({
      refs,
      setState,
      cancelInteraction,
      options: { surfaceId: 7, surface: 'lookup' },
      abortLookupRequest: true,
      applyLookupHighlight: true,
    })

    expect(closed).toBe(true)
    expect(abortSpy).toHaveBeenCalledTimes(1)
    expect(applyLookupHighlightForWordMock).toHaveBeenCalledWith('hello')
    expect(setState).toHaveBeenCalledWith({
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    })
    expect(setHighlightedWordMock).toHaveBeenCalledWith(null)
    expect(removeAllRanges).toHaveBeenCalledTimes(1)
    expect(cancelInteraction).toHaveBeenCalledWith({ surfaceId: 7, surface: 'lookup' })
    expect(refs.activeSurfaceIdRef.current).toBeUndefined()
    expect(refs.activeSurfaceTypeRef.current).toBe('none')
    expect(refs.pendingLookupHighlightWordRef.current).toBeNull()
    expect(refs.abortRef.current).toBeNull()
  })
})
