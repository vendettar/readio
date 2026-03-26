import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createViewportLockManager } from '../viewportLockManager'

describe('createViewportLockManager', () => {
  beforeEach(() => {
    document.body.style.overflow = ''
  })

  it('locks body scroll on first acquire and restores on final release', () => {
    document.body.style.overflow = 'auto'
    const manager = createViewportLockManager()

    manager.acquire()
    expect(document.body.style.overflow).toBe('hidden')

    manager.release()
    expect(document.body.style.overflow).toBe('auto')
  })

  it('blocks background wheel movements but allows internal surface scroll', () => {
    const manager = createViewportLockManager()
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    manager.acquire()

    const wheelHandler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'wheel'
    )?.[1] as unknown as (e: WheelEvent) => void

    // 1. Background wheel -> BLOCKED
    const backgroundWheel = new WheelEvent('wheel', { cancelable: true })
    Object.defineProperty(backgroundWheel, 'target', { value: document.body, configurable: true })
    vi.spyOn(backgroundWheel, 'preventDefault')
    wheelHandler(backgroundWheel)
    expect(backgroundWheel.preventDefault).toHaveBeenCalled()

    // 2. Internal surface wheel -> ALLOWED
    const surface = document.createElement('div')
    surface.setAttribute('data-selection-surface', 'true')
    const internalWheel = new WheelEvent('wheel', { cancelable: true })
    Object.defineProperty(internalWheel, 'target', { value: surface, configurable: true })
    vi.spyOn(internalWheel, 'preventDefault')
    wheelHandler(internalWheel)
    expect(internalWheel.preventDefault).not.toHaveBeenCalled()

    manager.release()
    addListenerSpy.mockRestore()
  })

  /**
   * Helper to create a mock TouchEvent without using 'as any'
   */
  function createMockTouchEvent(
    type: string,
    touchesCount: number,
    target: EventTarget
  ): TouchEvent {
    const event = new TouchEvent(type, { cancelable: true })
    Object.defineProperty(event, 'target', { value: target, configurable: true })
    Object.defineProperty(event, 'touches', {
      value: { length: touchesCount },
      configurable: true,
    })
    return event
  }

  it('blocks background touchmove but allows internal surface touchmove', () => {
    const manager = createViewportLockManager()
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    manager.acquire()

    const touchMoveHandler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'touchmove'
    )?.[1] as unknown as (e: TouchEvent) => void

    // 1. Background touchmove -> BLOCKED
    const backgroundTouch = createMockTouchEvent('touchmove', 1, document.body)
    vi.spyOn(backgroundTouch, 'preventDefault')
    touchMoveHandler(backgroundTouch)
    expect(backgroundTouch.preventDefault).toHaveBeenCalled()

    // 2. Internal surface touchmove -> ALLOWED
    const surface = document.createElement('div')
    surface.setAttribute('data-selection-surface', 'true')
    const internalTouch = createMockTouchEvent('touchmove', 1, surface)
    vi.spyOn(internalTouch, 'preventDefault')
    touchMoveHandler(internalTouch)
    expect(internalTouch.preventDefault).not.toHaveBeenCalled()

    manager.release()
    addListenerSpy.mockRestore()
  })

  it('blocks pinch zoom globally even via touch events', () => {
    const manager = createViewportLockManager()
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    manager.acquire()

    const touchHandler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'touchmove'
    )?.[1] as unknown as (e: TouchEvent) => void
    const surface = document.createElement('div')
    surface.setAttribute('data-selection-surface', 'true')

    // TouchMove with 2 fingers (Pinch) -> BLOCKED everywhere
    const pinchTouch = createMockTouchEvent('touchmove', 2, surface)
    vi.spyOn(pinchTouch, 'preventDefault')
    touchHandler(pinchTouch)
    expect(pinchTouch.preventDefault).toHaveBeenCalled()

    manager.release()
    addListenerSpy.mockRestore()
  })

  it('blocks keyboard zoom combinations', () => {
    const manager = createViewportLockManager()
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    manager.acquire()

    const keydownHandler = addListenerSpy.mock.calls.find(
      (call) => call[0] === 'keydown'
    )?.[1] as unknown as (e: KeyboardEvent) => void

    const event = new KeyboardEvent('keydown', { ctrlKey: true, key: '=', cancelable: true })
    vi.spyOn(event, 'preventDefault')
    keydownHandler(event)
    expect(event.preventDefault).toHaveBeenCalled()

    manager.release()
    addListenerSpy.mockRestore()
  })

  it('does NOT block touchstart or pointerdown events', () => {
    const manager = createViewportLockManager()
    const addListenerSpy = vi.spyOn(window, 'addEventListener')
    manager.acquire()

    expect(addListenerSpy).not.toHaveBeenCalledWith(
      'touchstart',
      expect.any(Function),
      expect.any(Object)
    )
    expect(addListenerSpy).not.toHaveBeenCalledWith(
      'pointerdown',
      expect.any(Function),
      expect.any(Object)
    )

    manager.release()
    addListenerSpy.mockRestore()
  })
})
