// src/hooks/selection/__tests__/useSelectionActions.test.ts
// Regression tests for race condition fixes

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DictEntry, SelectionState } from '../../../lib/selection'
import * as selection from '../../../lib/selection'
import { useSelectionActions } from '../useSelectionActions'

vi.mock('../../../lib/selection', () => ({
  isLookupEligible: vi.fn(() => true),
  fetchDefinition: vi.fn(),
}))

describe('useSelectionActions - race condition prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mockEntry = (word: string): DictEntry => ({
    word,
    phonetic: '',
    meanings: [{ partOfSpeech: '', definitions: [{ definition: 'mock' }] }],
  })

  it('should only accept result from latest lookup request (sequence gating)', async () => {
    const mockFetch = vi.mocked(selection.fetchDefinition)
    const setState = vi.fn()

    // Setup: first request slower than second
    let resolveFirst: (value: DictEntry) => void
    let resolveSecond: (value: DictEntry) => void

    const firstPromise = new Promise<DictEntry>((resolve) => {
      resolveFirst = resolve
    })
    const secondPromise = new Promise<DictEntry>((resolve) => {
      resolveSecond = resolve
    })

    mockFetch.mockReturnValueOnce(firstPromise).mockReturnValueOnce(secondPromise)

    const { result } = renderHook(() => useSelectionActions(setState))

    // Start first lookup
    act(() => {
      result.current.lookupWord('first', 100, 100)
    })

    // Start second lookup immediately
    act(() => {
      result.current.lookupWord('second', 200, 200)
    })

    // Resolve second (newer) first
    await act(async () => {
      resolveSecond?.(mockEntry('second'))
      await waitFor(
        () => {
          const lastCall = setState.mock.calls[setState.mock.calls.length - 1]
          return lastCall?.[0]({} as SelectionState)?.lookupResult !== null
        },
        { timeout: 1000 }
      )
    })

    // Check that second result was set
    const secondResultCall = setState.mock.calls.find((call) => {
      const state = call[0]({} as SelectionState)
      return state.lookupResult?.word === 'second'
    })
    expect(secondResultCall).toBeDefined()

    // Resolve first (older, should be ignored)
    await act(async () => {
      resolveFirst?.(mockEntry('first'))
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    // Verify first result did NOT overwrite second
    // After first resolves, no new setState call should set 'first' as result
    const afterFirstResolve = setState.mock.calls.filter(
      (_call, idx) => idx > setState.mock.calls.indexOf(secondResultCall!)
    )

    const firstResultAfter = afterFirstResolve.find((call) => {
      const state = call[0]({} as SelectionState)
      return state.lookupResult?.word === 'first'
    })

    expect(firstResultAfter).toBeUndefined()
  })

  it('should abort previous request when new lookup starts', async () => {
    const mockFetch = vi.mocked(selection.fetchDefinition)
    const setState = vi.fn()

    let abortSignal1: AbortSignal | undefined
    let abortSignal2: AbortSignal | undefined

    mockFetch
      .mockImplementationOnce((_word, signal) => {
        abortSignal1 = signal
        return new Promise<DictEntry>(() => {}) // Never resolves
      })
      .mockImplementationOnce((word, signal) => {
        abortSignal2 = signal
        return Promise.resolve(mockEntry(word))
      })

    const { result } = renderHook(() => useSelectionActions(setState))

    // First lookup
    act(() => {
      result.current.lookupWord('first', 100, 100)
    })

    expect(abortSignal1?.aborted).toBe(false)

    // Second lookup should abort first
    await act(async () => {
      result.current.lookupWord('second', 200, 200)
      await waitFor(() => abortSignal1?.aborted === true, { timeout: 100 })
    })

    expect(abortSignal1?.aborted).toBe(true)
    expect(abortSignal2?.aborted).toBe(false)
  })
})
