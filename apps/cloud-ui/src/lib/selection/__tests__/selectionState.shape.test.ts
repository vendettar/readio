import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useSelectionState } from '../../../hooks/selection/useSelectionState'
import type { SelectionState } from '../types'

function assertNeverType<_T extends never>() {
  return true
}

assertNeverType<Extract<'hoverWord', keyof SelectionState>>()
assertNeverType<Extract<'hoverRects', keyof SelectionState>>()

describe('selection state shape', () => {
  it('does not include removed hover fields in initial state', () => {
    const { result } = renderHook(() => useSelectionState())
    const state = result.current.state as unknown as Record<string, unknown>

    expect(state).not.toHaveProperty('hoverWord')
    expect(state).not.toHaveProperty('hoverRects')
  })

  it('resetState preserves hover-field-free state shape', () => {
    const { result } = renderHook(() => useSelectionState())
    result.current.resetState()

    const state = result.current.state as unknown as Record<string, unknown>
    expect(state).not.toHaveProperty('hoverWord')
    expect(state).not.toHaveProperty('hoverRects')
  })
})
