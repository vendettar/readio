import { act, renderHook } from '@testing-library/react'
import type { KeyboardEvent } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { useInlineRename } from '../useInlineRename'

describe('useInlineRename', () => {
  it('handles empty explicit confirm vs empty blur differently', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useInlineRename({
        originalName: 'Track A',
        existingNames: [],
        entityKind: 'track',
        onCommit,
      })
    )

    act(() => {
      result.current.startRename()
      result.current.setValue('   ')
    })
    act(() => {
      result.current.confirmRename()
    })
    expect(result.current.isRenaming).toBe(true)
    expect(result.current.errorKind).toBe('empty')

    act(() => {
      result.current.confirmRename(true)
    })
    expect(result.current.isRenaming).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('keeps rename mode on conflict and allows self case-change rename', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useInlineRename({
        originalName: 'Track A',
        existingNames: ['Track A', 'Track B'],
        entityKind: 'track',
        onCommit,
      })
    )

    act(() => {
      result.current.startRename()
      result.current.setValue('track b')
    })
    act(() => {
      result.current.confirmRename()
    })
    expect(result.current.isRenaming).toBe(true)
    expect(result.current.errorKind).toBe('conflict')

    act(() => {
      result.current.setValue('track a')
    })
    act(() => {
      result.current.confirmRename()
    })
    expect(onCommit).toHaveBeenCalledWith('track a')
    expect(result.current.isRenaming).toBe(false)
  })

  it('supports enter/escape transitions and no-op unchanged rename', () => {
    const onCommit = vi.fn()
    const { result } = renderHook(() =>
      useInlineRename({
        originalName: 'Folder A',
        existingNames: [],
        entityKind: 'folder',
        onCommit,
      })
    )

    act(() => {
      result.current.startRename()
      result.current.handleKeyDown({
        key: 'Escape',
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent)
    })
    expect(result.current.isRenaming).toBe(false)

    act(() => {
      result.current.startRename()
      result.current.setValue('  Folder A  ')
      result.current.handleKeyDown({
        key: 'Enter',
        preventDefault: vi.fn(),
      } as unknown as KeyboardEvent)
    })
    expect(result.current.isRenaming).toBe(false)
    expect(onCommit).not.toHaveBeenCalled()
  })
})
