import type React from 'react'
import { useEffect, useRef } from 'react'
import { AudioPrefetchScheduler } from '../lib/audioPrefetch'
import { useEventListener } from './useEventListener'

interface UseForegroundAudioPrefetchParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  playbackSourceUrl: string | null
}

export function useForegroundAudioPrefetch({
  audioRef,
  audioUrl,
  playbackSourceUrl,
}: UseForegroundAudioPrefetchParams): void {
  const schedulerRef = useRef(new AudioPrefetchScheduler())
  const schedulerSourceId = audioUrl || playbackSourceUrl

  useEffect(() => {
    if (!schedulerSourceId || !playbackSourceUrl) {
      schedulerRef.current.teardown()
      return
    }

    schedulerRef.current.resetForSource(schedulerSourceId)
  }, [playbackSourceUrl, schedulerSourceId])

  useEventListener(
    'timeupdate',
    () => {
      const audio = audioRef.current
      if (!audio || !schedulerSourceId || !playbackSourceUrl) return
      void schedulerRef.current.maybePrefetch({
        sourceId: schedulerSourceId,
        sourceUrl: playbackSourceUrl,
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
