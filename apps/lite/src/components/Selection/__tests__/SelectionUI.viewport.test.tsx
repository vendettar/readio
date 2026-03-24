import { render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SelectionState } from '../../../lib/selection'
import { viewportLockManager } from '../../../lib/selection/viewportLockManager'
import { SelectionUI } from '../SelectionUI'

describe('SelectionUI - Viewport Stability', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })
  const baseState: SelectionState = {
    surface: { type: 'none' },
    lookupLoading: false,
    lookupErrorKey: null,
    lookupResult: null,
  }

  const mockProps = {
    state: baseState,
    onCopy: () => {},
    onSearch: () => {},
    onLookup: () => {},
    onClose: () => {},
  }

  it('freezes viewport base scroll when a surface is active and restores it when closed', () => {
    document.body.style.overflow = 'visible'

    const { rerender } = render(<SelectionUI {...mockProps} />)
    expect(document.body.style.overflow).toBe('visible')

    // Activate a surface
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 1,
          },
        }}
      />
    )
    expect(document.body.style.overflow).toBe('hidden')

    // Close the surface
    rerender(<SelectionUI {...mockProps} />)
    expect(document.body.style.overflow).toBe('visible')
  })

  it('verifies viewport stability contract: background frozen, foreground interactive', () => {
    const acquireSpy = vi.spyOn(viewportLockManager, 'acquire')
    const releaseSpy = vi.spyOn(viewportLockManager, 'release')

    const { rerender } = render(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 2,
          },
        }}
      />
    )

    expect(acquireSpy).toHaveBeenCalled()
    expect(document.body.style.overflow).toBe('hidden')

    rerender(<SelectionUI {...mockProps} state={baseState} />)
    expect(releaseSpy).toHaveBeenCalled()

    acquireSpy.mockRestore()
    releaseSpy.mockRestore()
  })

  it('preserves existing frozen state if already locked by another component', () => {
    document.body.style.overflow = 'hidden'

    const { rerender } = render(<SelectionUI {...mockProps} state={baseState} />)

    // Activate
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'contextMenu',
            selectedText: 'test',
            menuMode: 'word',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 3,
          },
        }}
      />
    )
    expect(document.body.style.overflow).toBe('hidden')

    // Close
    rerender(<SelectionUI {...mockProps} state={baseState} />)
    // Should still be hidden because it was hidden originally
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('handles concurrent locks correctly even if started after selection', () => {
    document.body.style.overflow = 'visible'

    // 1. Selection opens
    const { rerender } = render(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 4,
          },
        }}
      />
    )
    expect(document.body.style.overflow).toBe('hidden')

    // 2. Another component (e.g. Dialog) also locks during selection session
    viewportLockManager.acquire()
    expect(document.body.style.overflow).toBe('hidden')

    // 3. Selection closes
    rerender(<SelectionUI {...mockProps} state={baseState} />)

    // 4. MUST still be hidden because the other component still holds its lock
    expect(document.body.style.overflow).toBe('hidden')

    // 5. Other component releases
    viewportLockManager.release()
    expect(document.body.style.overflow).toBe('visible')
  })

  it('maintains continuous viewport lock during surface transitions (e.g. contextMenu -> lookup)', () => {
    const acquireSpy = vi.spyOn(viewportLockManager, 'acquire')
    const releaseSpy = vi.spyOn(viewportLockManager, 'release')

    const { rerender } = render(<SelectionUI {...mockProps} state={baseState} />)
    expect(acquireSpy).not.toHaveBeenCalled()

    // 1. none -> contextMenu (ACQUIRE)
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'contextMenu',
            selectedText: 'test',
            menuMode: 'word',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 5,
          },
        }}
      />
    )
    expect(acquireSpy).toHaveBeenCalledTimes(1)
    expect(releaseSpy).not.toHaveBeenCalled()

    // 2. contextMenu -> lookup (CONTINUOUS)
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 6,
          },
        }}
      />
    )
    // Should NOT have called acquire/release again because hasActiveSurface hasn't changed
    expect(acquireSpy).toHaveBeenCalledTimes(1)
    expect(releaseSpy).not.toHaveBeenCalled()

    // 3. lookup -> none (RELEASE)
    rerender(<SelectionUI {...mockProps} state={baseState} />)
    expect(releaseSpy).toHaveBeenCalledTimes(1)

    acquireSpy.mockRestore()
    releaseSpy.mockRestore()
  })

  it('maintains continuous viewport lock during exhaustive surface transitions (lookup -> rangeActionMenu -> contextMenu)', () => {
    const acquireSpy = vi.spyOn(viewportLockManager, 'acquire')
    const releaseSpy = vi.spyOn(viewportLockManager, 'release')

    const { rerender } = render(<SelectionUI {...mockProps} state={baseState} />)
    expect(acquireSpy).not.toHaveBeenCalled()

    // 1. none -> lookup (ACQUIRE)
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 7,
          },
        }}
      />
    )
    expect(acquireSpy).toHaveBeenCalledTimes(1)

    // 2. lookup -> rangeActionMenu (CONTINUOUS)
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'rangeActionMenu',
            selectedText: 'test range',
            position: {
              x: 0,
              y: 0,
              rect: { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 },
            },
            owner: { ownerCueKey: '1', ownerKind: 'range', ownerCueStartMs: 0 },
            surfaceId: 8,
          },
        }}
      />
    )
    expect(acquireSpy).toHaveBeenCalledTimes(1)
    expect(releaseSpy).not.toHaveBeenCalled()

    // 3. rangeActionMenu -> contextMenu (CONTINUOUS)
    rerender(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'contextMenu',
            selectedText: 'test',
            menuMode: 'word',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 9,
          },
        }}
      />
    )
    expect(acquireSpy).toHaveBeenCalledTimes(1)
    expect(releaseSpy).not.toHaveBeenCalled()

    // 4. contextMenu -> none (RELEASE)
    rerender(<SelectionUI {...mockProps} state={baseState} />)
    expect(releaseSpy).toHaveBeenCalledTimes(1)

    acquireSpy.mockRestore()
    releaseSpy.mockRestore()
  })

  it('restores viewport on unmount', () => {
    document.body.style.overflow = 'visible'

    const { unmount } = render(
      <SelectionUI
        {...mockProps}
        state={{
          ...baseState,
          surface: {
            type: 'lookup',
            word: 'test',
            position: { x: 0, y: 0 },
            owner: { ownerCueKey: '1', ownerKind: 'word', ownerCueStartMs: 0 },
            surfaceId: 10,
          },
        }}
      />
    )
    expect(document.body.style.overflow).toBe('hidden')

    unmount()
    expect(document.body.style.overflow).toBe('visible')
  })
})
