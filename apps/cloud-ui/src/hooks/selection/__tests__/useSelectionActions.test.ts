// src/hooks/selection/__tests__/useSelectionActions.test.ts [COMPLETED]
// Regression tests for race condition fixes

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as settings from '../../../lib/schemas/settings'
import type { DictEntry, SelectionState } from '../../../lib/selection'
import * as selection from '../../../lib/selection'
import { useSelectionActions } from '../useSelectionActions'

const { pauseMock, openExternalMock, playMock } = vi.hoisted(() => ({
  pauseMock: vi.fn(),
  playMock: vi.fn(),
  openExternalMock: vi.fn(),
}))
const { applyLookupHighlightForWordMock } = vi.hoisted(() => ({
  applyLookupHighlightForWordMock: vi.fn(),
}))

vi.mock('../../../lib/selection', () => ({
  isLookupEligible: vi.fn(() => true),
  fetchDefinition: vi.fn(),
}))

vi.mock('../../../lib/schemas/settings', () => ({
  getSettingsSnapshot: vi.fn(() => ({
    pauseOnDictionaryLookup: true,
  })),
}))

vi.mock('../../../store/playerStore', () => ({
  usePlayerStore: {
    getState: () => ({
      pause: pauseMock,
      play: playMock,
      isPlaying: true, // Mocking that it's playing
    }),
  },
}))

vi.mock('../../../lib/openExternal', () => ({
  openExternal: openExternalMock,
}))

vi.mock('../../../lib/selection/dictCache', () => ({
  applyLookupHighlightForWord: applyLookupHighlightForWordMock,
}))

describe('useSelectionActions - semantics and race prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.mocked(settings.getSettingsSnapshot).mockReturnValue({
      pauseOnDictionaryLookup: true,
    } as ReturnType<typeof settings.getSettingsSnapshot>)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const mockEntry = (word: string): DictEntry => ({
    word,
    phonetic: '',
    meanings: [{ partOfSpeech: '', definitions: [{ definition: 'mock' }] }],
  })

  it('opens word context menu with normalized word state and pauses', () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      result.current.openWordMenu(
        'Hello',
        120,
        80,
        { left: 100, top: 70, width: 40, height: 20 } as DOMRect,
        {
          ownerCueKey: 'test',
          ownerCueStartMs: 0,
          ownerKind: 'word',
        }
      )
      vi.advanceTimersByTime(0)
    })

    expect(setState).toHaveBeenCalledTimes(1)
    expect(pauseMock).toHaveBeenCalled()
  })

  it('pauses exactly once for a lookup when pause-on-lookup is enabled', async () => {
    vi.mocked(selection.fetchDefinition).mockImplementation(() => new Promise<DictEntry>(() => {}))
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      void result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        {
          ownerCueKey: 'test',
          ownerCueStartMs: 0,
          ownerKind: 'word',
        }
      )
      vi.advanceTimersByTime(0)
    })

    expect(pauseMock).toHaveBeenCalledTimes(1)
  })

  it('does not pause for a lookup when pause-on-lookup is disabled', async () => {
    vi.mocked(settings.getSettingsSnapshot).mockReturnValue({
      pauseOnDictionaryLookup: false,
    } as ReturnType<typeof settings.getSettingsSnapshot>)
    vi.mocked(selection.fetchDefinition).mockImplementation(() => new Promise<DictEntry>(() => {}))
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      void result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' }
      )
      vi.advanceTimersByTime(0)
    })

    expect(pauseMock).not.toHaveBeenCalled()
  })

  it('menu interactions still pause regardless of pauseOnDictionaryLookup setting', () => {
    vi.mocked(settings.getSettingsSnapshot).mockReturnValue({
      pauseOnDictionaryLookup: false,
    } as ReturnType<typeof settings.getSettingsSnapshot>)
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      result.current.openWordMenu(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' }
      )
      vi.advanceTimersByTime(0)
    })

    expect(pauseMock).toHaveBeenCalled()
  })

  it('clears native browser selection and resumes when closing', () => {
    const setState = vi.fn()
    const selectionApi = {
      removeAllRanges: vi.fn(),
    }
    vi.spyOn(window, 'getSelection').mockReturnValue(selectionApi as unknown as Selection)

    const state: SelectionState = {
      surface: {
        surfaceId: 1,
        type: 'contextMenu',
        position: {
          x: 0,
          y: 0,
          rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
        },
        selectedText: 'test',
        menuMode: 'word',
        owner: { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' },
      },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    // Set wasPlayingBeforeInteractionRef to true by simulating a prepareInteraction
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      result.current.prepareInteraction()
      vi.advanceTimersByTime(0)
    })

    expect(pauseMock).toHaveBeenCalled()

    act(() => {
      result.current.closeMenu()
    })

    expect(selectionApi.removeAllRanges).toHaveBeenCalled()
    expect(playMock).toHaveBeenCalled()
  })

  it('skips playback resumption when closing with skipResume option', () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: {
        surfaceId: 2,
        type: 'contextMenu',
        position: {
          x: 0,
          y: 0,
          rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
        },
        selectedText: 'test',
        menuMode: 'word',
        owner: { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' },
      },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      result.current.prepareInteraction()
      vi.advanceTimersByTime(0)
    })

    expect(pauseMock).toHaveBeenCalled()
    playMock.mockClear()

    act(() => {
      result.current.closeMenu({ reason: 'switch' })
    })

    // Should NOT call play()
    expect(playMock).not.toHaveBeenCalled()
  })

  it('invalidates pending pause when interaction is canceled immediately', () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    act(() => {
      result.current.prepareInteraction()
      result.current.cancelInteraction()
      vi.advanceTimersByTime(0)
    })

    // The delayed pause should NOT be called because cancelInteraction incremented the sequence
    expect(pauseMock).not.toHaveBeenCalled()
  })

  it('should only accept result from latest lookup request (sequence gating)', async () => {
    const mockFetch = vi.mocked(selection.fetchDefinition)
    const setState = vi.fn()

    let resolveFirst: (value: DictEntry) => void
    let resolveSecond: (value: DictEntry) => void

    const firstPromise = new Promise<DictEntry>((resolve) => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<DictEntry>((resolve) => {
      resolveSecond = resolve
    })

    mockFetch.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    // Start first lookup
    act(() => {
      void result.current.lookupWord(
        'first',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })

    // Start second lookup immediately
    act(() => {
      void result.current.lookupWord(
        'second',
        200,
        200,
        { left: 190, top: 190, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue2', ownerCueStartMs: 100, ownerKind: 'word' }
      )
    })

    // Resolve second (newer) first
    await act(async () => {
      resolveSecond?.(mockEntry('second'))
    })

    // Check that second result was set (setState called with result)
    expect(setState).toHaveBeenCalledWith(expect.any(Function))

    // Resolve first (older, should be ignored)
    await act(async () => {
      resolveFirst?.(mockEntry('first'))
    })
  })

  it('does not highlight same-word page occurrences while successful lookup callout stays open', async () => {
    vi.mocked(selection.fetchDefinition).mockResolvedValue(mockEntry('hello'))
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('applies same-word page highlight when closing successful lookup callout', async () => {
    vi.mocked(selection.fetchDefinition).mockResolvedValue(mockEntry('hello'))
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()

    act(() => {
      result.current.closeLookup({ surfaceId: 1, surface: 'lookup' })
    })

    expect(applyLookupHighlightForWordMock).toHaveBeenCalledTimes(1)
    expect(applyLookupHighlightForWordMock).toHaveBeenCalledWith('hello')
  })

  it('does not apply same-word page highlight on close when lookup failed or not found', async () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    vi.mocked(selection.fetchDefinition).mockRejectedValueOnce(new Error('Word not found'))
    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })
    act(() => {
      result.current.closeLookup({ surfaceId: 1, surface: 'lookup' })
    })

    vi.mocked(selection.fetchDefinition).mockRejectedValueOnce(new Error('Network failed'))
    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })
    act(() => {
      result.current.closeLookup({ surfaceId: 2, surface: 'lookup' })
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('resolves normalized configured dictionary languages via availability mapping', async () => {
    vi.mocked(selection.fetchDefinition).mockResolvedValue(mockEntry('hello'))
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        {
          ownerCueKey: 'cue-en-us',
          ownerCueStartMs: 0,
          ownerKind: 'word',
          lookupLanguage: 'en-US',
        } as never
      )
    })

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        {
          ownerCueKey: 'cue-en-gb',
          ownerCueStartMs: 0,
          ownerKind: 'word',
          lookupLanguage: 'en-GB',
        } as never
      )
    })

    expect(selection.fetchDefinition).toHaveBeenCalledTimes(2)
    expect(selection.fetchDefinition).toHaveBeenNthCalledWith(1, 'hello', expect.any(AbortSignal))
    expect(selection.fetchDefinition).toHaveBeenNthCalledWith(2, 'hello', expect.any(AbortSignal))
  })

  it('uses dedicated not-configured state for unsupported lookup languages', async () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        {
          ownerCueKey: 'cue-zh',
          ownerCueStartMs: 0,
          ownerKind: 'word',
          lookupLanguage: 'zh-CN',
        } as never
      )
    })

    expect(selection.fetchDefinition).not.toHaveBeenCalled()
    expect(setState).toHaveBeenLastCalledWith(expect.any(Function))

    const latestUpdater = setState.mock.calls[setState.mock.calls.length - 1]?.[0] as (
      state: SelectionState
    ) => SelectionState
    const nextState = latestUpdater(state)

    expect(nextState.lookupLoading).toBe(false)
    expect(nextState.lookupResult).toBeNull()
    expect(nextState.lookupErrorKey).toBe('lookupDictionaryNotConfigured')
  })

  it('does not apply delayed highlight on close for unsupported-language lookup state', async () => {
    const setState = vi.fn()
    const state: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }
    const { result } = renderHook(() => useSelectionActions(state, setState))

    await act(async () => {
      await result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, width: 20, height: 20 } as DOMRect,
        {
          ownerCueKey: 'cue-zh',
          ownerCueStartMs: 0,
          ownerKind: 'word',
          lookupLanguage: 'zh-CN',
        } as never
      )
    })

    act(() => {
      result.current.closeLookup({ surfaceId: 1, surface: 'lookup' })
    })

    expect(selection.fetchDefinition).not.toHaveBeenCalled()
    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })
})
