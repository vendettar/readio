import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import type { ASRCue } from '../lib/asr/types'
import { DB, type FileSubtitle, type FileTrack } from '../lib/dexieDb'
import { logError, warn as logWarn } from '../lib/logger'
import { buildLocalTrackPlaybackSessionCreateInput } from '../lib/player/playbackSessionFactory'
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
        const audioBlob = await DB.getAudioBlob(track.audioId)
        if (!audioBlob) {
          logError('[Files] audio blob not found')
          return
        }

        // Fetch artwork if available
        let artwork: Blob | string | null = null
        if (track.artworkId) {
          try {
            const artworkData = await DB.getAudioBlob(track.artworkId)
            if (artworkData) {
              artwork = artworkData.blob
            }
          } catch {
            // Best-effort: continue without artwork
          }
        }

        // Filter subtitles for this track
        const trackSubs = availableSubtitles.filter((s) => s.trackId === track.id)

        // Determine which subtitle to load:
        // 1. Explicitly provided subtitle
        // 2. Active subtitle ID stored on track
        // 3. First available subtitle for the track
        let subToLoad = subtitle
        if (!subToLoad && trackSubs.length > 0) {
          subToLoad = trackSubs.find((s) => s.id === track.activeSubtitleId) || trackSubs[0]
        }

        let parsedSubtitles: ASRCue[] = []
        if (subToLoad) {
          const subText = await DB.getSubtitle(subToLoad.subtitleId)
          if (subText) {
            parsedSubtitles = subText.cues
          }
        }

        const sessionId = `local-track-${track.id}`
        await loadAudioBlob(audioBlob.blob, track.name, artwork, sessionId, undefined, {
          showTitle: track.artist || undefined,
          description: track.album || undefined,
          artworkUrl: typeof artwork === 'string' ? artwork : undefined,
          durationSeconds: track.durationSeconds,
        })
        setPlayerSubtitles(parsedSubtitles)

        // Surface Mode Logic
        // Local file playback always enables docked surface.
        // When subtitles are absent, DockedPlayer shows a "no transcript" placeholder.
        setPlayableContext(true)
        toDocked()

        // Set localTrackId for session tracking
        setPlaybackTrackId(track.id)

        play()

        await DB.upsertPlaybackSession(
          buildLocalTrackPlaybackSessionCreateInput({
            sessionId,
            track,
            subtitleId: subToLoad?.subtitleId || null,
            artworkUrl: typeof artwork === 'string' ? artwork : undefined,
          })
        )

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
        await DB.updateFileTrack(trackId, { activeSubtitleId: subtitleId })
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
