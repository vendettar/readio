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
  const progress = usePlayerStore((s) => s.progress)
  const storeSessionId = usePlayerStore((s) => s.sessionId)
  const localTrackId = usePlayerStore((s) => s.localTrackId)
  const setStoreSessionId = usePlayerStore((s) => s.setSessionId)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const updateProgress = usePlayerStore((s) => s.updateProgress)
  const saveProgressNow = usePlayerStore((s) => s.saveProgressNow)

  // Use a ref to ensure initialization only runs ONCE ever, even if sessionId flickers
  const hasInitializedRef = useRef(false)

  // Initialize session on mount (restore last session if no storeSessionId)
  useEffect(() => {
    // If we've already tried to initialize or if we have an ID from FileHandler, stop.
    if (hasInitializedRef.current || storeSessionId) return
    hasInitializedRef.current = true

    const initSession = async () => {
      try {
        // Try to restore last playback session
        const lastSession = await DB.getLastPlaybackSession()
        if (lastSession && lastSession.progress > 0) {
          // 1. Set the Session ID in store FIRST
          setStoreSessionId(lastSession.id)

          if (lastSession.duration) {
            usePlayerStore.getState().setDuration(lastSession.duration)
          }

          log(
            '[Session] Restoring playback session:',
            lastSession.id,
            'progress:',
            lastSession.progress
          )

          // 2. Restore audio file from IndexedDB
          if (lastSession.audioId) {
            const audioData = await DB.getAudioBlob(lastSession.audioId)
            if (audioData) {
              const file = new File([audioData.blob], audioData.filename, {
                type: audioData.type,
              })
              const { loadAudio } = usePlayerStore.getState()
              // CRITICAL: Call loadAudio with resetSession: false to preserve the sessionId we just set
              await loadAudio(file, { resetSession: false })
              log('[Session] Restored audio file:', audioData.filename)
            }
          }

          // 3. Restore subtitle file from IndexedDB
          if (lastSession.subtitleId) {
            const subtitleData = await DB.getSubtitle(lastSession.subtitleId)
            if (subtitleData) {
              const file = new File([subtitleData.content], subtitleData.filename, {
                type: 'application/x-subrip',
              })
              const { loadSubtitles } = usePlayerStore.getState()
              await loadSubtitles(file)
              log('[Session] Restored subtitle file:', subtitleData.filename)
            }
          }
        }
      } catch (err) {
        logError('[Session] Failed to restore session:', err)
      }
    }

    initSession()
  }, [storeSessionId, setStoreSessionId])

  // Create new session OR restore existing session when NEW files are loaded manually
  useEffect(() => {
    if (!audioLoaded && !subtitlesLoaded) return
    // If we already have a sessionId (from files or restoration), don't disrupt it
    if (storeSessionId) return

    const { audioUrl, audioTitle } = usePlayerStore.getState()

    const findOrStartSession = async () => {
      try {
        let existingSession: PlaybackSession | undefined

        // 1. Try to find existing session by localTrackId (for library tracks)
        if (localTrackId) {
          const expectedSessionId = `local-track-${localTrackId}`
          const directSession = await DB.getPlaybackSession(expectedSessionId)
          if (directSession) {
            log('[Session] Found existing session by ID:', directSession.id)
            setStoreSessionId(directSession.id)
            if (directSession.progress > 0) {
              setProgress(directSession.progress)
            }
            return
          }
          existingSession = await DB.findLastSessionByTrackId(localTrackId)
        }
        // 2. Try to find existing session by URL (for podcasts)
        else if (audioUrl && !audioUrl.startsWith('blob:')) {
          existingSession = await DB.findLastSessionByUrl(audioUrl)
        }

        if (existingSession) {
          log(
            '[Session] Found previous matching session:',
            existingSession.id,
            'progress:',
            existingSession.progress
          )
          setStoreSessionId(existingSession.id)
          if (existingSession.progress > 0) {
            setProgress(existingSession.progress)
          }
          if (existingSession.duration) {
            usePlayerStore.getState().setDuration(existingSession.duration)
          }
        } else {
          // 3. No match, create brand new session
          const id = generateSessionId()
          setStoreSessionId(id)

          const { episodeMetadata, coverArtUrl } = usePlayerStore.getState()

          await DB.createPlaybackSession({
            id,
            progress: 0,
            duration: duration || 0,
            source: localTrackId ? 'local' : 'explore',
            audioUrl: !audioUrl.startsWith('blob:') ? audioUrl : undefined,
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
        const id = generateSessionId()
        setStoreSessionId(id)
      }
    }

    findOrStartSession()
  }, [
    audioLoaded,
    subtitlesLoaded,
    duration,
    storeSessionId,
    localTrackId,
    setStoreSessionId,
    setProgress,
  ])

  // Save on unmount
  useEffect(() => {
    return () => {
      saveProgressNow()
    }
  }, [saveProgressNow])

  // Restore progress to audio element
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
    updateProgress,
    restoreProgress,
  }
}
