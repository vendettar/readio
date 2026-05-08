import { useCallback } from 'react'
import {
  cyclePlayerPlaybackRate,
  executeJumpToSubtitle,
  executeNextSmartSubtitleOrSkip,
  executePreviousSmartSubtitleOrSkip,
  executeSkipBackward,
  executeSkipForward,
  togglePlayerPlayback,
} from '../lib/player/playerCommandActions'

export function usePlayerController() {
  const togglePlayPause = useCallback(() => {
    togglePlayerPlayback()
  }, [])

  const skipBackward = useCallback(() => {
    executeSkipBackward()
  }, [])

  const skipForward = useCallback(() => {
    executeSkipForward()
  }, [])

  const prevSmart = useCallback(() => {
    executePreviousSmartSubtitleOrSkip()
  }, [])

  const nextSmart = useCallback(() => {
    executeNextSmartSubtitleOrSkip()
  }, [])

  const jumpToSubtitle = useCallback((index: number) => {
    executeJumpToSubtitle(index)
  }, [])

  const cyclePlaybackRate = useCallback(() => {
    cyclePlayerPlaybackRate()
  }, [])

  return {
    togglePlayPause,
    skipBackward,
    skipForward,
    prevSmart,
    nextSmart,
    jumpToSubtitle,
    cyclePlaybackRate,
  }
}
