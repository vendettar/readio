/**
 * Shared manager for viewport stability (scroll and zoom locking).
 * Uses reference counting to ensure the viewport remains frozen as long as
 * any component requires it.
 */

function isInsideInteractiveSurface(target: EventTarget | null): boolean {
  return !!(target as HTMLElement | null)?.closest?.('[data-selection-surface="true"]')
}

/**
 * Type guard for wheel-like events (wheel, mousewheel).
 */
function isWheelLikeEvent(e: Event): e is WheelEvent {
  return e.type === 'wheel' || e.type === 'mousewheel'
}

/**
 * Type guard for touchmove events.
 */
function isTouchMoveEvent(e: Event): e is TouchEvent {
  return e.type === 'touchmove'
}

/**
 * Checks for zoom attempts in wheel-like events.
 */
function isWheelZoomAttempt(e: WheelEvent): boolean {
  return e.ctrlKey || e.metaKey
}

/**
 * Checks for pinch-to-zoom multi-touch in touchmove events.
 */
function isTouchPinchAttempt(e: TouchEvent): boolean {
  return e.touches && e.touches.length > 1
}

export function createViewportLockManager() {
  let lockCount = 0
  let originalOverflow = ''

  const handleViewportLock = (e: Event) => {
    if (!e.cancelable) return

    let shouldBlock = false

    // 1. Zoom Policy (Global blocking)
    if (isWheelLikeEvent(e)) {
      shouldBlock = isWheelZoomAttempt(e)
    } else if (isTouchMoveEvent(e)) {
      shouldBlock = isTouchPinchAttempt(e)
    }

    // 2. Scroll Policy (Background only)
    if (!shouldBlock) {
      const isPositionedMovement = isWheelLikeEvent(e) || isTouchMoveEvent(e)
      if (isPositionedMovement && !isInsideInteractiveSurface(e.target)) {
        shouldBlock = true
      }
    }

    if (shouldBlock) {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
  }

  const preventGesture = (e: Event) => {
    // Block native Safari/WebKit pinch-to-zoom gestures
    if (e.cancelable) {
      e.preventDefault()
    }
  }

  const preventKeyZoom = (e: KeyboardEvent) => {
    // Block Cmd/Ctrl + +/-/0 key combinations
    if (
      (e.ctrlKey || e.metaKey) &&
      (e.key === '=' || e.key === '-' || e.key === '0' || e.key === '+')
    ) {
      e.preventDefault()
    }
  }

  return {
    acquire: () => {
      if (lockCount === 0) {
        // 1. Lock scrolling (Body overflow prevents base page scroll)
        originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'

        // 2. Lock viewport movements
        const options = { passive: false, capture: true }
        window.addEventListener('wheel', handleViewportLock, options)
        window.addEventListener('mousewheel', handleViewportLock, options)
        window.addEventListener('touchmove', handleViewportLock, options)
        window.addEventListener('keydown', preventKeyZoom, { capture: true })
        window.addEventListener('gesturestart', preventGesture, options)
      }
      lockCount++
    },
    release: () => {
      if (lockCount === 0) return
      lockCount--
      if (lockCount === 0) {
        // 1. Restore scrolling
        document.body.style.overflow = originalOverflow

        // 2. Remove event listeners
        const options = { capture: true }
        window.removeEventListener('wheel', handleViewportLock, options)
        window.removeEventListener('mousewheel', handleViewportLock, options)
        window.removeEventListener('touchmove', handleViewportLock, options)
        window.removeEventListener('keydown', preventKeyZoom, options)
        window.removeEventListener('gesturestart', preventGesture, options)
      }
    },
  }
}

export const viewportLockManager = createViewportLockManager()
