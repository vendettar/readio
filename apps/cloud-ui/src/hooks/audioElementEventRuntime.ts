import type { TFunction } from 'i18next'
import { mapAudioErrorMessage } from '../lib/audioErrors'
import { warn } from '../lib/logger'
import {
  handleAudioEnded,
  handleAudioError,
  handleAudioTimeUpdate,
  shouldIgnoreAudioPauseWhileRecovering,
} from '../lib/player/playerRuntimeActions'
import { useSleepTimerStore } from '../store/sleepTimerStore'

export const HIDDEN_PROGRESS_THROTTLE_MS = 1000

export function shouldProcessAudioTimeUpdate(input: {
  isVisible: boolean
  lastProgressUpdateAt: number
  now: number
}): boolean {
  if (input.isVisible) {
    return true
  }

  return input.now - input.lastProgressUpdateAt >= HIDDEN_PROGRESS_THROTTLE_MS
}

export function processAudioTimeUpdate(input: {
  audio: HTMLAudioElement
  isVisible: boolean
  lastProgressUpdateAt: number
  now: number
}): number | null {
  if (
    !shouldProcessAudioTimeUpdate({
      isVisible: input.isVisible,
      lastProgressUpdateAt: input.lastProgressUpdateAt,
      now: input.now,
    })
  ) {
    return null
  }

  handleAudioTimeUpdate({
    currentTime: input.audio.currentTime,
    paused: input.audio.paused,
    ended: input.audio.ended,
  })

  return input.now
}

export function shouldIgnoreAudioPauseEvent(isRecovering: boolean): boolean {
  return shouldIgnoreAudioPauseWhileRecovering(isRecovering)
}

export async function processAudioEndedEvent(audio: HTMLAudioElement): Promise<void> {
  await handleAudioEnded(audio.duration || audio.currentTime)

  if (useSleepTimerStore.getState().isEndOfEpisode) {
    useSleepTimerStore.getState().reset()
  }
}

export function processAudioErrorEvent(input: {
  audio: HTMLAudioElement
  isRecovering: boolean
  t: TFunction
}): boolean {
  if (input.isRecovering) {
    return false
  }

  const err = input.audio.error
  const message = mapAudioErrorMessage(input.t, err)

  if (err) {
    warn('[GlobalAudioController] Audio Error Details:', {
      code: err.code,
      message: err.message,
      src: input.audio.src,
    })
  }

  handleAudioError(message)
  return true
}
