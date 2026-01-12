// src/hooks/useZoom.ts
import { useCallback, useEffect, useRef, useState } from 'react'

import { getAppConfig } from '../libs/runtimeConfig'

export function useZoom() {
  const config = getAppConfig()
  const { MIN_ZOOM, MAX_ZOOM, ZOOM_STEP, ZOOM_HIDE_DELAY_MS: HIDE_DELAY } = config

  const [zoomScale, setZoomScale] = useState(1)
  const [showZoomBar, setShowZoomBar] = useState(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleHide = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
    }
    hideTimerRef.current = setTimeout(() => {
      setShowZoomBar(false)
    }, HIDE_DELAY)
  }, [HIDE_DELAY])

  const updateZoom = useCallback(
    (delta: number, absoluteValue: number | null = null) => {
      setZoomScale((prev) => {
        let newScale: number
        if (absoluteValue !== null) {
          newScale = Math.min(Math.max(absoluteValue, MIN_ZOOM), MAX_ZOOM)
        } else {
          newScale = Math.min(Math.max(prev + delta, MIN_ZOOM), MAX_ZOOM)
        }
        document.body.style.setProperty('--zoom-scale', String(newScale))
        return newScale
      })
      setShowZoomBar(true)
      scheduleHide()
    },
    [scheduleHide, MIN_ZOOM, MAX_ZOOM]
  )

  const zoomIn = useCallback(() => updateZoom(ZOOM_STEP), [updateZoom, ZOOM_STEP])
  const zoomOut = useCallback(() => updateZoom(-ZOOM_STEP), [updateZoom, ZOOM_STEP])
  const zoomReset = useCallback(() => updateZoom(0, 1), [updateZoom])

  // Handle Ctrl+Wheel zoom
  useEffect(() => {
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        if (event.deltaY < 0) {
          zoomIn()
        } else {
          zoomOut()
        }
      }
    }

    window.addEventListener('wheel', handleWheel, { passive: false })
    return () => window.removeEventListener('wheel', handleWheel)
  }, [zoomIn, zoomOut])

  // Cancel hide on component unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current)
      }
    }
  }, [])

  return {
    zoomScale,
    showZoomBar,
    zoomIn,
    zoomOut,
    zoomReset,
    setShowZoomBar,
    scheduleHide,
  }
}
