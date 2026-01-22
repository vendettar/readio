// src/hooks/useSession.ts
import { useCallback, useEffect, useRef } from 'react'
import { DB, type PlaybackSession } from '../lib/dexieDb'
import { log, error as logError } from '../lib/logger'
import { generateSessionId } from '../lib/session'
import { usePlayerStore } from '../store/playerStore'

export function useSession() {
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = usePlayerStore((s) => s.subtitlesLoaded)
  const duration = usePlayerStore((s) => s.duration)
  const storeSessionId = usePlayerStore((s) => s.sessionId)
  const localTrackId = usePlayerStore((s) => s.localTrackId)
  const setStoreSessionId = usePlayerStore((s) => s.setSessionId)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const updateProgress = usePlayerStore((s) => s.updateProgress)
  const saveProgressNow = usePlayerStore((s) => s.saveProgressNow)
  const restoreSession = usePlayerStore((s) => s.restoreSession)
  const initializationStatus = usePlayerStore((s) => s.initializationStatus)

  // 1. Initialize session on mount - now fully encapsulated in store
  useEffect(() => {
    if (initializationStatus === 'idle') {
      restoreSession()
    }
  }, [initializationStatus, restoreSession])

  const isManagingSessionRef = useRef(false)

  // 2. Create NEW session if files are loaded manually (not via restoration)
  useEffect(() => {
    // We allow session creation if restoration is ready OR if it failed (so users can still upload)
    if (
      (initializationStatus !== 'ready' && initializationStatus !== 'failed') ||
      storeSessionId ||
      isManagingSessionRef.current
    ) {
      return
    }
    if (!audioLoaded && !subtitlesLoaded) return

    const { audioUrl, audioTitle } = usePlayerStore.getState()

    const findOrStartSession = async () => {
      isManagingSessionRef.current = true
      try {
        let existingSession: PlaybackSession | undefined

        // Try to find existing session by localTrackId (library)
        if (localTrackId) {
          const expectedSessionId = `local-track-${localTrackId}`
          const directSession = await DB.getPlaybackSession(expectedSessionId)
          if (directSession) {
            setStoreSessionId(directSession.id)
            if (directSession.progress > 0) setProgress(directSession.progress)
            return
          }
          existingSession = await DB.findLastSessionByTrackId(localTrackId)
        }
        // Try to find existing session by URL (podcast)
        else if (audioUrl && !audioUrl.startsWith('blob:')) {
          existingSession = await DB.findLastSessionByUrl(audioUrl)
        }

        if (existingSession) {
          setStoreSessionId(existingSession.id)
          if (existingSession.progress > 0) setProgress(existingSession.progress)
          if (existingSession.duration)
            usePlayerStore.getState().setDuration(existingSession.duration)
        } else {
          // Create brand new session
          const id = generateSessionId()
          setStoreSessionId(id)

          const { episodeMetadata, coverArtUrl } = usePlayerStore.getState()
          await DB.upsertPlaybackSession({
            id,
            progress: 0,
            duration: duration || 0,
            source: localTrackId ? 'local' : 'explore',
            audioUrl: audioUrl && !audioUrl.startsWith('blob:') ? audioUrl : undefined,
            audioFilename: audioTitle,
            title: audioTitle,
            localTrackId: localTrackId || undefined,
            artworkUrl: episodeMetadata?.artworkUrl || coverArtUrl,
            description: episodeMetadata?.description,
            podcastTitle: episodeMetadata?.podcastTitle,
            podcastFeedUrl: episodeMetadata?.podcastFeedUrl,
            publishedAt: episodeMetadata?.publishedAt,
            episodeId: episodeMetadata?.episodeId,
          })
          log('[Session] Created new playback session:', id)
        }
      } catch (err) {
        logError('[Session] Failed to manage session:', err)
      } finally {
        isManagingSessionRef.current = false
      }
    }

    findOrStartSession()
  }, [
    audioLoaded,
    subtitlesLoaded,
    duration,
    storeSessionId,
    localTrackId,
    initializationStatus,
    setStoreSessionId,
    setProgress,
  ])

  // 3. Save on unmount
  useEffect(() => {
    return () => {
      saveProgressNow()
    }
  }, [saveProgressNow])

  // 4. Restore progress to physical audio element
  const restoreProgress = useCallback(
    async (audioElement: HTMLAudioElement) => {
      const currentSessionId = usePlayerStore.getState().sessionId
      if (!currentSessionId) return

      try {
        const session = await DB.getPlaybackSession(currentSessionId)
        if (session && session.progress > 0) {
          audioElement.currentTime = session.progress
          setProgress(session.progress)
          log('[Session] Restored playback physical position:', session.progress)
        }
      } catch (err) {
        logError('[Session] Failed to restore progress:', err)
      }
    },
    [setProgress]
  )

  return {
    sessionId: storeSessionId,
    initializationStatus,
    updateProgress,
    restoreProgress,
  }
}
