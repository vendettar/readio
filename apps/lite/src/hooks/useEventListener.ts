import type React from 'react'
import { useEffect, useRef } from 'react'

/**
 * Hook to add event listener with automatic cleanup
 * Callback is stable and won't cause re-subscription on every render
 *
 * @param eventName Event name (e.g., 'keydown', 'click')
 * @param handler Event handler function
 * @param element Target element (default: window)
 * @param options Event listener options
 */

// Window Events
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  element?: Window,
  options?: boolean | AddEventListenerOptions
): void

// Document Events
export function useEventListener<K extends keyof DocumentEventMap>(
  eventName: K,
  handler: (event: DocumentEventMap[K]) => void,
  element: Document,
  options?: boolean | AddEventListenerOptions
): void

// Element Events (Ref/Element)
export function useEventListener<
  K extends keyof (HTMLElementEventMap & HTMLMediaElementEventMap & HTMLVideoElementEventMap),
  T extends HTMLElement = HTMLElement,
>(
  eventName: K,
  handler: (
    event: (HTMLElementEventMap & HTMLMediaElementEventMap & HTMLVideoElementEventMap)[K]
  ) => void,
  element: React.RefObject<T | null> | T | null,
  options?: boolean | AddEventListenerOptions
): void

// Fallback for custom events or incomplete mappings
export function useEventListener(
  eventName: string,
  handler: (event: Event) => void,
  element:
    | Window
    | Document
    | HTMLElement
    | EventTarget
    | React.RefObject<HTMLElement | null>
    | null,
  options?: boolean | AddEventListenerOptions
): void

// Base Implementation / Generic EventTarget
export function useEventListener<K extends string>(
  eventName: K,
  handler: (event: Event) => void,
  element:
    | Window
    | Document
    | HTMLElement
    | EventTarget
    | React.RefObject<HTMLElement | null>
    | null = window,
  options?: boolean | AddEventListenerOptions
): void {
  // Create a ref that stores handler
  const savedHandler = useRef(handler)

  // Update ref.current value if handler changes
  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    // Determine the target element
    const targetValue =
      element && typeof element === 'object' && 'current' in element
        ? (element as React.RefObject<HTMLElement | null>).current
        : (element as Window | Document | HTMLElement | EventTarget | null)

    // Make sure target supports addEventListener
    if (!targetValue || !targetValue.addEventListener) return

    // Create event listener that calls handler function stored in ref
    const eventListener = (event: Event) => savedHandler.current(event)

    targetValue.addEventListener(eventName, eventListener, options)

    // Remove event listener on cleanup
    return () => {
      targetValue.removeEventListener(eventName, eventListener, options)
    }
  }, [eventName, element, options])
}
