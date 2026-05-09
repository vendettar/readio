import { useEffect, useState } from 'react'

/**
 * Hook to debounce a value.
 * @param value The value to debounce.
 * @param delayMs The delay in milliseconds.
 * @returns The debounced value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}
