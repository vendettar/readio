import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { FileSubtitle, FileTrack } from '../lib/dexieDb'
import { logError, warn as logWarn } from '../lib/logger'
import {
  LOCAL_FILE_PLAYBACK_PREPARE_REASON,
  persistLocalFilePlaybackSession,
  prepareLocalFilePlayback,
} from '../lib/player/localFilePlaybackService'
import { FilesRepository } from '../lib/repositories/FilesRepository'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import { useTranscriptStore } from '../store/transcriptStore'

interface UseFilePlaybackProps {
  onComplete?: () => void
}

export function useFilePlayback({ onComplete }: UseFilePlaybackProps = {}) {
  const router = useRouter()

  /**
   * Handles playing a local track with optional specific subtitle
   */
  const handlePlay = useCallback(
    async (track: FileTrack, availableSubtitles: FileSubtitle[], subtitle?: FileSubtitle) => {
      const { loadAudioBlob, play, setPlaybackTrackId } = usePlayerStore.getState()
      const { setSubtitles: setPlayerSubtitles } = useTranscriptStore.getState()

      const { setPlayableContext, toDocked } = usePlayerSurfaceStore.getState()

      try {
        const prepared = await prepareLocalFilePlayback({
          track,
          availableSubtitles,
          subtitle,
        })
        if (!prepared.ok) {
          if (prepared.reason === LOCAL_FILE_PLAYBACK_PREPARE_REASON.AUDIO_NOT_FOUND) {
            logError('[Files] audio blob not found')
          }
          return
        }

        const { audioBlob, artwork, subtitles, sessionId, metadata, selectedSubtitleContentId } =
          prepared.payload

        await loadAudioBlob(audioBlob, track.name, artwork, sessionId, undefined, metadata)
        setPlayerSubtitles(subtitles)

        // Surface Mode Logic
        // Local file playback always enables docked surface.
        // When subtitles are absent, DockedPlayer shows a "no transcript" placeholder.
        setPlayableContext(true)
        toDocked()

        // Set localTrackId for session tracking
        setPlaybackTrackId(track.id)

        play()

        await persistLocalFilePlaybackSession({
          track,
          sessionId,
          selectedSubtitleContentId,
          artwork,
        })

        // Navigate to home page (player)
        router.navigate({ to: '/' })

        // Trigger refresh
        onComplete?.()
      } catch (error) {
        logError('[Files] Error loading track', error)
      }
    },
    [onComplete, router]
  )

  /**
   * Updates the active subtitle for a track and refreshes data
   */
  const handleSetActiveSubtitle = useCallback(
    async (trackId: string, subtitleId: string) => {
      try {
        await FilesRepository.updateFileTrack(trackId, { activeSubtitleId: subtitleId })
        onComplete?.()
      } catch (error) {
        logWarn('[Files] Failed to set active subtitle', error)
      }
    },
    [onComplete]
  )

  return {
    handlePlay,
    handleSetActiveSubtitle,
  }
}
