import type { MutableRefObject } from 'react'
import {
  isPlayerCurrentlyPlaying,
  pausePlayerIfActive,
  resumePlayerIfNeeded,
} from '../../lib/player/playerInteractionRuntime'

const INTERACTION_PAUSE_DELAY_MS = 0

export interface SelectionInteractionRuntimeRefs {
  interactionSequenceRef: MutableRefObject<number>
  wasPlayingBeforeInteractionRef: MutableRefObject<boolean>
}

export interface SelectionInteractionCancelOptions {
  reason?: 'dismiss' | 'switch'
}

export function prepareSelectionInteraction(refs: SelectionInteractionRuntimeRefs): void {
  if (!isPlayerCurrentlyPlaying()) {
    return
  }

  refs.wasPlayingBeforeInteractionRef.current = true
  const expectedSequence = refs.interactionSequenceRef.current

  setTimeout(() => {
    if (expectedSequence !== refs.interactionSequenceRef.current) {
      return
    }
    pausePlayerIfActive()
  }, INTERACTION_PAUSE_DELAY_MS)
}

export function cancelSelectionInteraction(
  refs: SelectionInteractionRuntimeRefs,
  options?: SelectionInteractionCancelOptions
): void {
  refs.interactionSequenceRef.current += 1

  const shouldResume = options?.reason !== 'switch'
  if (refs.wasPlayingBeforeInteractionRef.current && shouldResume) {
    resumePlayerIfNeeded(true)
    refs.wasPlayingBeforeInteractionRef.current = false
    return
  }

  refs.wasPlayingBeforeInteractionRef.current = false
}
