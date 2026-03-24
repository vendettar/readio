// apps/lite/src/hooks/__tests__/useSelection.test.ts
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSelectionActions } from '../selection/useSelectionActions'
import { useSelectionState } from '../selection/useSelectionState'
import { useSelection } from '../useSelection'

vi.mock('../selection/useSelectionActions')
vi.mock('../selection/useSelectionState')
vi.mock('../selection/useSelectionEvents')

describe('useSelection orchestrator', () => {
  it('closeUI dispatches to actions.closeLookup when surface is lookup', () => {
    const closeMenu = vi.fn()
    const closeLookup = vi.fn()
    const setState = vi.fn()

    vi.mocked(useSelectionState).mockReturnValue({
      state: {
        surface: {
          surfaceId: 1,
          type: 'lookup',
          word: 'test',
          position: { x: 0, y: 0 },
          owner: { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' },
        },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      },
      setState,
      resetState: vi.fn(),
    })

    vi.mocked(useSelectionActions).mockReturnValue({
      closeMenu,
      closeLookup,
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: vi.fn(),
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      lookupWord: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
    })

    const { result } = renderHook(() => useSelection({ current: null }))

    act(() => {
      result.current.closeUI()
    })

    expect(closeLookup).toHaveBeenCalledTimes(1)
    expect(closeMenu).not.toHaveBeenCalled()
  })

  it('closeUI dispatches to actions.closeMenu when surface is contextMenu', () => {
    const closeMenu = vi.fn()
    const closeLookup = vi.fn()
    const setState = vi.fn()

    vi.mocked(useSelectionState).mockReturnValue({
      state: {
        surface: {
          surfaceId: 2,
          type: 'contextMenu',
          selectedText: 'test',
          position: { x: 0, y: 0 },
          menuMode: 'word',
          owner: { ownerCueKey: 'test', ownerCueStartMs: 0, ownerKind: 'word' },
        },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      },
      setState,
      resetState: vi.fn(),
    })

    vi.mocked(useSelectionActions).mockReturnValue({
      closeMenu,
      closeLookup,
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: vi.fn(),
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      lookupWord: vi.fn(),
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
    })

    const { result } = renderHook(() => useSelection({ current: null }))

    act(() => {
      result.current.closeUI()
    })

    expect(closeMenu).toHaveBeenCalledTimes(1)
    expect(closeLookup).not.toHaveBeenCalled()
  })

  it('plumbs transcript language into direct lookup entrypoint without changing dispatch shape', () => {
    const lookupWord = vi.fn()
    const setState = vi.fn()

    vi.mocked(useSelectionState).mockReturnValue({
      state: {
        surface: { type: 'none' },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      },
      setState,
      resetState: vi.fn(),
    })

    vi.mocked(useSelectionActions).mockReturnValue({
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: vi.fn(),
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      lookupWord,
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
    })

    const { result } = renderHook(() =>
      useSelection({ current: null }, { lookupLanguage: 'en-US' })
    )

    act(() => {
      void result.current.lookupWord(
        'Hello',
        100,
        100,
        { left: 90, top: 90, right: 110, bottom: 110, width: 20, height: 20 } as DOMRect,
        { ownerCueKey: 'cue-1', ownerCueStartMs: 0, ownerKind: 'word' }
      )
    })

    expect(lookupWord).toHaveBeenCalledTimes(1)
    expect(lookupWord).toHaveBeenCalledWith(
      'Hello',
      100,
      100,
      expect.any(Object),
      expect.objectContaining({
        ownerCueKey: 'cue-1',
        lookupLanguage: 'en-US',
      })
    )
  })

  it('plumbs transcript language into menu lookup entrypoint', () => {
    const lookupWord = vi.fn()
    const setState = vi.fn()

    vi.mocked(useSelectionState).mockReturnValue({
      state: {
        surface: {
          surfaceId: 3,
          type: 'contextMenu',
          selectedText: 'hello',
          position: { x: 12, y: 34 },
          menuMode: 'word',
          owner: { ownerCueKey: 'cue-2', ownerCueStartMs: 1, ownerKind: 'word' },
        },
        lookupLoading: false,
        lookupErrorKey: null,
        lookupResult: null,
      },
      setState,
      resetState: vi.fn(),
    })

    vi.mocked(useSelectionActions).mockReturnValue({
      closeMenu: vi.fn(),
      closeLookup: vi.fn(),
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: vi.fn(),
      openRangeMenu: vi.fn(),
      openLineMenu: vi.fn(),
      lookupWord,
      prepareInteraction: vi.fn(),
      cancelInteraction: vi.fn(),
    })

    const { result } = renderHook(() =>
      useSelection({ current: null }, { lookupLanguage: 'zh-CN' })
    )

    act(() => {
      result.current.lookupFromMenu()
    })

    expect(lookupWord).toHaveBeenCalledTimes(1)
    expect(lookupWord).toHaveBeenCalledWith(
      'hello',
      12,
      34,
      expect.objectContaining({ left: 12, top: 34 }),
      expect.objectContaining({
        ownerCueKey: 'cue-2',
        lookupLanguage: 'zh-CN',
      })
    )
  })
})
