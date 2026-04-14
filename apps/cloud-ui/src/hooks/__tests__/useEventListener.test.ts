import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useEventListener } from '../useEventListener'

describe('useEventListener', () => {
  it('should attach event listener to window by default', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useEventListener('click', handler))

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('should attach event listener to a specific element', () => {
    const handler = vi.fn()
    const element = document.createElement('div')
    const addSpy = vi.spyOn(element, 'addEventListener')
    const removeSpy = vi.spyOn(element, 'removeEventListener')

    const { unmount } = renderHook(() => useEventListener('click', handler, element))

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)
  })

  it('should attach event listener to a ref object', () => {
    const handler = vi.fn()
    const element = document.createElement('div')
    const ref = { current: element }
    const addSpy = vi.spyOn(element, 'addEventListener')
    const removeSpy = vi.spyOn(element, 'removeEventListener')

    const { unmount } = renderHook(() => useEventListener('click', handler, ref))

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)
  })

  it('should update listener when eventName changes', () => {
    const handler = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { rerender } = renderHook(
      ({ eventName }) => useEventListener(eventName as 'click', handler),
      { initialProps: { eventName: 'click' } }
    )

    expect(addSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)

    rerender({ eventName: 'keydown' })

    expect(removeSpy).toHaveBeenCalledWith('click', expect.any(Function), undefined)
    expect(addSpy).toHaveBeenCalledWith('keydown', expect.any(Function), undefined)

    addSpy.mockRestore()
    removeSpy.mockRestore()
  })

  it('should NOT re-attach listener when handler changes', () => {
    const handler1 = vi.fn()
    const handler2 = vi.fn()
    const addSpy = vi.spyOn(window, 'addEventListener')

    const { rerender } = renderHook(({ handler }) => useEventListener('click', handler), {
      initialProps: { handler: handler1 },
    })

    expect(addSpy).toHaveBeenCalledTimes(1)

    rerender({ handler: handler2 })

    // Should NOT have called addEventListener again
    expect(addSpy).toHaveBeenCalledTimes(1)

    // Verify it still calls the LATEST handler
    const capturedHandler = addSpy.mock.calls[0][1] as (...args: unknown[]) => void
    capturedHandler(new Event('click'))

    expect(handler1).not.toHaveBeenCalled()
    expect(handler2).toHaveBeenCalled()

    addSpy.mockRestore()
  })
})
