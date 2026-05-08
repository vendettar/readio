import { useEffect } from 'react'
import {
  bindMediaSessionActionHandlers,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
  type MediaSessionActions,
  type MediaSessionTrack,
} from './mediaSessionRuntime'

export function useMediaSession(
  currentTrack: MediaSessionTrack | null,
  actions: MediaSessionActions,
  playbackStatus?: 'playing' | 'paused' | 'none'
) {
  useEffect(() => {
    syncMediaSessionMetadata(currentTrack)
  }, [currentTrack])

  useEffect(() => {
    syncMediaSessionPlaybackState(playbackStatus || 'none')
  }, [playbackStatus])

  useEffect(() => {
    return bindMediaSessionActionHandlers(currentTrack, actions)
  }, [actions, currentTrack])
}
