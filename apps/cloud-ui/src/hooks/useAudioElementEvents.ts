import type { TFunction } from 'i18next'
import type React from 'react'
import { mapAudioErrorMessage } from '../lib/audioErrors'
import { warn } from '../lib/logger'
import { usePlayerStore } from '../store/playerStore'
import { useSleepTimerStore } from '../store/sleepTimerStore'
import type { AudioFallbackRecoveryState } from './audioFallbackRecovery'
import { useEventListener } from './useEventListener'

interface UseAudioElementEventsParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  isVisibleRef: React.MutableRefObject<boolean>
  lastProgressUpdateRef: React.MutableRefObject<number>
  onPlay: () => void
  onPause: () => void
  onLoadedMetadata?: () => void
  recoveryRef: React.MutableRefObject<AudioFallbackRecoveryState>
  t: TFunction
}

export function useAudioElementEvents({
  audioRef,
  isVisibleRef,
  lastProgressUpdateRef,
  onPlay,
  onPause,
  onLoadedMetadata,
  recoveryRef,
  t,
}: UseAudioElementEventsParams): void {
  useEventListener(
    'timeupdate',
    () => {
      const audio = audioRef.current
      if (!audio) return
      const now = Date.now()
      if (!isVisibleRef.current) {
        if (now - lastProgressUpdateRef.current < 1000) return
      }
      lastProgressUpdateRef.current = now
      const playerState = usePlayerStore.getState()
      playerState.updateProgress(audio.currentTime)
      if (
        playerState.status === 'loading' &&
        playerState.isPlaying &&
        !audio.paused &&
        !audio.ended &&
        audio.currentTime > 0
      ) {
        playerState.setStatus('playing')
      }
    },
    audioRef
  )

  useEventListener(
    'durationchange',
    () => {
      const audio = audioRef.current
      if (!audio) return
      usePlayerStore.getState().setDuration(audio.duration)
    },
    audioRef
  )

  useEventListener('play', onPlay, audioRef)
  useEventListener(
    'pause',
    () => {
      if (recoveryRef.current.isRecovering && usePlayerStore.getState().isPlaying) {
        return
      }
      onPause()
    },
    audioRef
  )

  useEventListener(
    'ended',
    () => {
      const audio = audioRef.current
      if (!audio) return
      const playerState = usePlayerStore.getState()
      void playerState.handleEndedPlayback(audio.duration || audio.currentTime)

      if (useSleepTimerStore.getState().isEndOfEpisode) {
        useSleepTimerStore.getState().reset()
      }
    },
    audioRef
  )

  useEventListener(
    'waiting',
    () => {
      const { isPlaying } = usePlayerStore.getState()
      if (isPlaying) {
        usePlayerStore.getState().setStatus('loading')
      }
    },
    audioRef
  )

  useEventListener(
    'playing',
    () => {
      usePlayerStore.getState().setStatus('playing')
    },
    audioRef
  )

  useEventListener(
    'canplay',
    () => {
      const { isPlaying, status } = usePlayerStore.getState()
      if (status === 'loading') {
        usePlayerStore.getState().setStatus(isPlaying ? 'playing' : 'paused')
      }
    },
    audioRef
  )

  useEventListener(
    'error',
    () => {
      if (recoveryRef.current.isRecovering) {
        return
      }

      const audio = audioRef.current
      if (!audio) return
      const err = audio.error
      const message = mapAudioErrorMessage(t, err)

      if (err) {
        warn('[GlobalAudioController] Audio Error Details:', {
          code: err.code,
          message: err.message,
          src: audio.src,
        })
      }
      usePlayerStore.getState().setPlayerError(message)
    },
    audioRef
  )

  useEventListener(
    'loadedmetadata',
    () => {
      onLoadedMetadata?.()
    },
    audioRef
  )
}
