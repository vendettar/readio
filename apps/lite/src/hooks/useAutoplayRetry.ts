import type React from 'react'
import { useEffect, useRef } from 'react'
import { warn } from '../lib/logger'
import { toast } from '../lib/toast'
import { usePlayerStore } from '../store/playerStore'

interface UseAutoplayRetryParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  isPlaying: boolean
}

export function useAutoplayRetry({ audioRef, audioUrl, isPlaying }: UseAutoplayRetryParams): void {
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    let cancelled = false

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current)
      retryTimeoutRef.current = null
    }

    const { status } = usePlayerStore.getState()

    if (isPlaying) {
      if (status === 'error') return

      const playWithRetry = (retryCount = 0) => {
        const playPromise = audio.play()
        if (playPromise !== undefined) {
          playPromise.catch((err: { name?: string; message?: string }) => {
            if (err.name === 'AbortError') return

            if (err.name === 'NotSupportedError' && retryCount < 1) {
              warn('[Player] Format error on redirect, retrying...', { audioUrl })
              audio.load()
              retryTimeoutRef.current = setTimeout(() => {
                const currentState = usePlayerStore.getState()
                if (cancelled || !currentState.isPlaying || currentState.audioUrl !== audioUrl) {
                  return
                }
                playWithRetry(retryCount + 1)
              }, 500)
              return
            }

            warn('[Player] play() failed', { error: err, audioUrl })
            if (err.name === 'NotAllowedError') {
              usePlayerStore.getState().pause()
              toast.infoKey('player.autoplayBlocked')
            }
          })
        }
      }

      playWithRetry()
    } else {
      audio.pause()
    }

    return () => {
      cancelled = true
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current)
        retryTimeoutRef.current = null
      }
    }
  }, [audioRef, audioUrl, isPlaying])
}
