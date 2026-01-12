import { useEffect, useRef } from 'react';

/**
 * Hook to add event listener with automatic cleanup
 * Callback is stable and won't cause re-subscription on every render
 * 
 * @param eventName Event name (e.g., 'keydown', 'click')
 * @param handler Event handler function
 * @param element Target element (default: window)
 * @param options Event listener options
 */
export function useEventListener<K extends keyof WindowEventMap>(
    eventName: K,
    handler: (event: WindowEventMap[K]) => void,
    element: Window | Document | HTMLElement | null = window,
    options?: boolean | AddEventListenerOptions
): void {
    // Create a ref that stores handler
    const savedHandler = useRef(handler);

    // Update ref.current value if handler changes
    useEffect(() => {
        savedHandler.current = handler;
    }, [handler]);

    useEffect(() => {
        // Make sure element supports addEventListener
        if (!element || !element.addEventListener) return;

        // Create event listener that calls handler function stored in ref
        const eventListener = (event: Event) => savedHandler.current(event as WindowEventMap[K]);

        element.addEventListener(eventName, eventListener, options);

        // Remove event listener on cleanup
        return () => {
            element.removeEventListener(eventName, eventListener, options);
        };
    }, [eventName, element, options]);
}
