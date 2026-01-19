import { useCallback } from 'react'
import { DB, type FileSubtitle, type FileTrack } from '../lib/dexieDb'
import { logError, warn as logWarn } from '../lib/logger'
import { parseSrt, type subtitle } from '../lib/subtitles'
import { usePlayerStore } from '../store/playerStore'

interface UseFilePlaybackProps {
  onComplete?: () => void
}

export function useFilePlayback({ onComplete }: UseFilePlaybackProps = {}) {
  /**
   * Handles playing a local track with optional specific subtitle
   */
  const handlePlay = useCallback(
    async (track: FileTrack, availableSubtitles: FileSubtitle[], subtitle?: FileSubtitle) => {
      const {
        setAudioUrl,
        setSubtitles: setPlayerSubtitles,
        play,
        setFileTrackId,
        setSessionId: setStoreSessionId,
      } = usePlayerStore.getState()

      try {
        const audioBlob = await DB.getAudioBlob(track.audioId)
        if (!audioBlob) {
          logError('[Files] audio blob not found')
          return
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
            parsedSubtitles = parseSrt(subText.content)
          }
        }

        const audioUrl = URL.createObjectURL(audioBlob.blob)
        setAudioUrl(audioUrl, track.name, '')
        setPlayerSubtitles(parsedSubtitles)

        // Set localTrackId for session tracking
        setFileTrackId(track.id)

        play()

        // Create/update session for Last Played tracking
        // Use fixed session ID to prevent duplicates with useSession
        const sessionId = `local-track-${track.id}`
        setStoreSessionId(sessionId) // Set sessionId BEFORE creating to prevent useSession from creating duplicate

        await DB.createPlaybackSession({
          id: sessionId,
          source: 'local',
          title: track.name,
          audioId: track.audioId, // Required for Last Played map
          subtitleId: subToLoad?.subtitleId || null,
          hasAudioBlob: true,
          lastPlayedAt: Date.now(),
          localTrackId: track.id,
        })

        // Trigger refresh
        onComplete?.()
      } catch (error) {
        logError('[Files] Error loading track', error)
      }
    },
    [onComplete]
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
