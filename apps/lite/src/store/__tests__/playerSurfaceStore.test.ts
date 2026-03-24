import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { usePlayerSurfaceStore } from '../playerSurfaceStore'

describe('playerSurfaceStore', () => {
  beforeEach(() => {
    act(() => {
      usePlayerSurfaceStore.getState().reset()
    })
  })

  it('starts in mini mode with no context', () => {
    const { result } = renderHook(() => usePlayerSurfaceStore())
    expect(result.current.mode).toBe('mini')
    expect(result.current.hasPlayableContext).toBe(false)
    expect(result.current.canDockedRestore).toBe(false)
  })

  it('transitions to docked when transcript context provided', () => {
    // Simulate setting up context
    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(true)
    })

    const { result } = renderHook(() => usePlayerSurfaceStore())
    expect(result.current.hasPlayableContext).toBe(true)
    expect(result.current.canDockedRestore).toBe(true)
    // Does NOT auto-switch mode in setPlayableContext, but allows toDocked()

    act(() => {
      result.current.toDocked()
    })
    expect(result.current.mode).toBe('docked')
  })

  it('coerces to mini when context lost while in docked', () => {
    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(true)
      usePlayerSurfaceStore.getState().toDocked()
    })
    expect(usePlayerSurfaceStore.getState().mode).toBe('docked')

    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(false)
    })
    const { result } = renderHook(() => usePlayerSurfaceStore())
    expect(result.current.mode).toBe('mini')
    expect(result.current.hasPlayableContext).toBe(false)
    expect(result.current.canDockedRestore).toBe(false)
  })

  it('allows transition to full even without context', () => {
    act(() => {
      usePlayerSurfaceStore.getState().toFull()
    })
    expect(usePlayerSurfaceStore.getState().mode).toBe('full')
  })

  it('handles restore capability update correctly', () => {
    // Start docked
    act(() => {
      usePlayerSurfaceStore.getState().setPlayableContext(true)
      usePlayerSurfaceStore.getState().toDocked()
    })
    expect(usePlayerSurfaceStore.getState().mode).toBe('docked')

    // If restore becomes unavailable (e.g. transcript error), force mini
    act(() => {
      usePlayerSurfaceStore.getState().setDockedRestoreAvailable(false)
    })

    const { result } = renderHook(() => usePlayerSurfaceStore())
    expect(result.current.mode).toBe('mini')
    expect(result.current.canDockedRestore).toBe(false)
    // Playable context remains true though (audio still playing)
    expect(result.current.hasPlayableContext).toBe(true)
  })
})
