import { useRouter } from '@tanstack/react-router'
import { useCallback } from 'react'
import { DB, type FileSubtitle, type FileTrack } from '../lib/dexieDb'
import { logError, warn as logWarn } from '../lib/logger'
import { parseSubtitles, type subtitle } from '../lib/subtitles'
import { usePlayerStore } from '../store/playerStore'

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
      const {
        loadAudioBlob,
        setSubtitles: setPlayerSubtitles,
        play,
        setFileTrackId,
      } = usePlayerStore.getState()

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

        let parsedSubtitles: subtitle[] = []
        if (subToLoad) {
          const subText = await DB.getSubtitle(subToLoad.subtitleId)
          if (subText) {
            parsedSubtitles = parseSubtitles(subText.content)
          }
        }

        const sessionId = `local-track-${track.id}`
        await loadAudioBlob(audioBlob.blob, track.name, artwork, sessionId)
        setPlayerSubtitles(parsedSubtitles)

        // Set localTrackId for session tracking
        setFileTrackId(track.id)

        play()

        await DB.upsertPlaybackSession({
          id: sessionId,
          source: 'local',
          title: track.name,
          audioId: track.audioId, // Required for Last Played map
          artworkUrl: typeof artwork === 'string' ? artwork : undefined, // History display helper
          subtitleId: subToLoad?.subtitleId || null,
          hasAudioBlob: true,
          lastPlayedAt: Date.now(),
          localTrackId: track.id,
          duration: track.durationSeconds || 0,
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
