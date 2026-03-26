import type React from 'react'
import { useEffect, useRef } from 'react'
import { AudioPrefetchScheduler } from '../lib/audioPrefetch'
import { useEventListener } from './useEventListener'

interface UseForegroundAudioPrefetchParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
}

export function useForegroundAudioPrefetch({
  audioRef,
  audioUrl,
}: UseForegroundAudioPrefetchParams): void {
  const schedulerRef = useRef(new AudioPrefetchScheduler())

  useEffect(() => {
    if (!audioUrl) {
      schedulerRef.current.teardown()
      return
    }

    schedulerRef.current.resetForSource(audioUrl)
  }, [audioUrl])

  useEventListener(
    'timeupdate',
    () => {
      const audio = audioRef.current
      if (!audio || !audioUrl) return
      void schedulerRef.current.maybePrefetch({
        sourceId: audioUrl,
        sourceUrl: audioUrl,
        audio,
      })
    },
    audioRef
  )

  useEffect(() => {
    return () => {
      schedulerRef.current.teardown()
    }
  }, [])
}
