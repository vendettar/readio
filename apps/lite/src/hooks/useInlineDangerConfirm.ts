import { useCallback, useEffect, useRef, useState } from 'react'

export function useInlineDangerConfirm<T extends HTMLElement = HTMLDivElement>() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const containerRef = useRef<T>(null)

  const blurFocusedElementInContainer = useCallback(() => {
    const activeElement = document.activeElement
    if (activeElement instanceof HTMLElement && containerRef.current?.contains(activeElement)) {
      activeElement.blur()
    }
  }, [])

  const openConfirm = useCallback(
    (id: string) => {
      blurFocusedElementInContainer()
      setActiveId(id)
    },
    [blurFocusedElementInContainer]
  )

  const closeConfirm = useCallback(() => {
    blurFocusedElementInContainer()
    setActiveId(null)
  }, [blurFocusedElementInContainer])

  const isActive = useCallback((id: string) => activeId === id, [activeId])

  useEffect(() => {
    if (!activeId) return

    const handlePointerDown = (event: PointerEvent) => {
      if (containerRef.current?.contains(event.target as Node)) return
      blurFocusedElementInContainer()
      setActiveId(null)
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [activeId, blurFocusedElementInContainer])

  return {
    activeId,
    containerRef,
    isActive,
    openConfirm,
    closeConfirm,
  }
}
