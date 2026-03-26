import { useState } from 'react'
import { useEventListener } from './useEventListener'

export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState(() => {
    if (typeof document === 'undefined') return true
    return !document.hidden
  })

  useEventListener(
    'visibilitychange',
    () => {
      setIsVisible(!document.hidden)
    },
    document
  )

  return isVisible
}
