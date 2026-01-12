import { useEffect, useRef } from 'react'

/**
 * Hook to detect clicks outside of a specified element
 *
 * @param handler Callback function to execute when click outside is detected
 * @param enabled Whether the hook is enabled (default: true)
 * @returns Ref to attach to the element you want to detect clicks outside of
 */
export function useOnClickOutside<T extends HTMLElement = HTMLElement>(
  handler: (event: MouseEvent) => void,
  enabled: boolean = true
) {
  const ref = useRef<T>(null)
  const savedHandler = useRef(handler)

  // Update ref.current value if handler changes
  useEffect(() => {
    savedHandler.current = handler
  }, [handler])

  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        savedHandler.current(event)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [enabled])

  return ref
}
