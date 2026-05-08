import type { TFunction } from 'i18next'
import type React from 'react'
import {
  handleAudioCanPlay,
  handleAudioDurationChange,
  handleAudioPlaying,
  handleAudioWaiting,
} from '../lib/player/playerRuntimeActions'
import type { AudioFallbackRecoveryState } from './audioFallbackRecovery'
import {
  processAudioEndedEvent,
  processAudioErrorEvent,
  processAudioTimeUpdate,
  shouldIgnoreAudioPauseEvent,
} from './audioElementEventRuntime'
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
      const processedAt = processAudioTimeUpdate({
        audio,
        isVisible: isVisibleRef.current,
        lastProgressUpdateAt: lastProgressUpdateRef.current,
        now,
      })
      if (processedAt === null) return
      lastProgressUpdateRef.current = processedAt
    },
    audioRef
  )

  useEventListener(
    'durationchange',
    () => {
      const audio = audioRef.current
      if (!audio) return
      handleAudioDurationChange(audio.duration)
    },
    audioRef
  )

  useEventListener('play', onPlay, audioRef)
  useEventListener(
    'pause',
    () => {
      if (shouldIgnoreAudioPauseEvent(recoveryRef.current.isRecovering)) {
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
      void processAudioEndedEvent(audio)
    },
    audioRef
  )

  useEventListener(
    'waiting',
    () => {
      handleAudioWaiting()
    },
    audioRef
  )

  useEventListener(
    'playing',
    () => {
      handleAudioPlaying()
    },
    audioRef
  )

  useEventListener(
    'canplay',
    () => {
      handleAudioCanPlay()
    },
    audioRef
  )

  useEventListener(
    'error',
    () => {
      const audio = audioRef.current
      if (!audio) return
      processAudioErrorEvent({
        audio,
        isRecovering: recoveryRef.current.isRecovering,
        t,
      })
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
