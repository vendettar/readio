import { useEffect, useState } from 'react'

export function useMediaQuery(query: string) {
  const [value, setValue] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches
    }
    return false
  })

  useEffect(() => {
    const result = window.matchMedia(query)
    const onChange = (event: Event) => setValue((event as MediaQueryListEvent).matches)

    result.addEventListener('change', onChange)
    return () => result.removeEventListener('change', onChange)
  }, [query])

  return value
}
