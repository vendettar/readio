// src/hooks/useSession.ts
import { useCallback, useEffect, useRef } from 'react'
import { DB, type PlaybackSession } from '../lib/dexieDb'
import { log, error as logError } from '../lib/logger'
import { getAppConfig } from '../lib/runtimeConfig'
import { generateSessionId } from '../lib/session'
import { usePlayerStore } from '../store/playerStore'

export function useSession() {
  const config = getAppConfig()
  const lastSaveRef = useRef<number>(0)

  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = usePlayerStore((s) => s.subtitlesLoaded)
  const duration = usePlayerStore((s) => s.duration)
  const progress = usePlayerStore((s) => s.progress)
  const storeSessionId = usePlayerStore((s) => s.sessionId)
  const localTrackId = usePlayerStore((s) => s.localTrackId)
  const setStoreSessionId = usePlayerStore((s) => s.setSessionId)
  const setProgress = usePlayerStore((s) => s.setProgress)

  // Initialize session on mount (restore last session if no storeSessionId)
  useEffect(() => {
    // If storeSessionId is already set (e.g., from useFileHandler), skip restore
    if (storeSessionId) return

    const initSession = async () => {
      try {
        // Try to restore last playback session
        const lastSession = await DB.getLastPlaybackSession()
        if (lastSession && lastSession.progress > 0) {
          // Restore progress if we have a recent session
          setStoreSessionId(lastSession.id)
          if (lastSession.duration) {
            usePlayerStore.getState().setDuration(lastSession.duration)
          }

          log(
            '[Session] Restored playback session:',
            lastSession.id,
            'progress:',
            lastSession.progress
          )

          // Restore audio file from IndexedDB
          if (lastSession.audioId) {
            const audioData = await DB.getAudioBlob(lastSession.audioId)
            if (audioData) {
              const file = new File([audioData.blob], audioData.filename, {
                type: audioData.type,
              })
              const { loadAudio } = usePlayerStore.getState()
              await loadAudio(file)
              log('[Session] Restored audio file:', audioData.filename)
            }
          }

          // Restore subtitle file from IndexedDB
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

  // Create new session OR restore existing session when files are loaded
  useEffect(() => {
    if (!audioLoaded && !subtitlesLoaded) return
    // If we already have a sessionId (from files or manually set), don't disrupt it
    if (storeSessionId) return

    const { audioUrl, audioTitle } = usePlayerStore.getState()

    const findOrStartSession = async () => {
      try {
        let existingSession: PlaybackSession | undefined

        // 1. Try to find existing session by localTrackId (for files with track ID)
        if (localTrackId) {
          // DETERMINISTIC GUARD: Check if session with expected ID already exists
          const expectedSessionId = `local-track-${localTrackId}`
          const directSession = await DB.getPlaybackSession(expectedSessionId)
          if (directSession) {
            // Session already exists, reuse it
            log('[Session] Found existing session by ID:', directSession.id)
            setStoreSessionId(directSession.id)
            if (directSession.progress > 0) {
              setProgress(directSession.progress)
            }
            return
          }

          // Fallback: search by trackId
          existingSession = await DB.findLastSessionByTrackId(localTrackId)
        }
        // 2. Try to find existing session by URL (for podcasts)
        else if (audioUrl && !audioUrl.startsWith('blob:')) {
          existingSession = await DB.findLastSessionByUrl(audioUrl)
        }

        if (existingSession) {
          // Found a match! Resume this session
          log(
            '[Session] Found previous session:',
            existingSession.id,
            'progress:',
            existingSession.progress
          )
          setStoreSessionId(existingSession.id)
          // Also immediately restore progress to store to update UI
          if (existingSession.progress > 0) {
            setProgress(existingSession.progress)
          }
          if (existingSession.duration) {
            usePlayerStore.getState().setDuration(existingSession.duration)
          }
        } else {
          // No match, create brand new session
          const id = generateSessionId()
          setStoreSessionId(id)

          // Get episode metadata from store for History display
          const { episodeMetadata, coverArtUrl } = usePlayerStore.getState()

          // DEBUG: Log what we're reading
          if (import.meta.env.DEV) {
            console.log('[Session DEBUG] episodeMetadata at creation:', episodeMetadata)
            console.log('[Session DEBUG] coverArtUrl at creation:', coverArtUrl)
          }

          await DB.createPlaybackSession({
            id,
            progress: 0,
            duration: duration || 0,
            source: localTrackId ? 'local' : 'explore',
            // Save lookup keys immediately so we can find it next time
            audioUrl: !audioUrl.startsWith('blob:') ? audioUrl : undefined,
            audioFilename: audioTitle,
            title: audioTitle, // Ensure title is set
            localTrackId: localTrackId || undefined,
            // Episode metadata for History display
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
        // Fallback: create fresh session to ensure app works
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

  // Save progress periodically
  const saveProgress = useCallback(async () => {
    // Read from store directly to avoid effect timing races.
    const currentSessionId = usePlayerStore.getState().sessionId
    if (!currentSessionId) return
    if (progress <= 0) return

    const now = Date.now()
    if (now - lastSaveRef.current < config.SAVE_PROGRESS_INTERVAL_MS) return
    lastSaveRef.current = now

    try {
      await DB.updatePlaybackSession(currentSessionId, {
        progress,
        duration: duration || 0,
      })
      log('[Session] Saved progress:', progress.toFixed(1))
    } catch (err) {
      logError('[Session] Failed to save progress:', err)
    }
  }, [progress, duration, config.SAVE_PROGRESS_INTERVAL_MS])

  // Auto-save on progress change
  useEffect(() => {
    if (progress > 0) {
      saveProgress()
    }
  }, [progress, saveProgress])

  // Save on unmount
  useEffect(() => {
    return () => {
      const currentSessionId = usePlayerStore.getState().sessionId
      const currentProgress = usePlayerStore.getState().progress
      const currentDuration = usePlayerStore.getState().duration

      if (currentSessionId && currentProgress > 0) {
        DB.updatePlaybackSession(currentSessionId, {
          progress: currentProgress,
          duration: currentDuration,
        }).catch(logError)
      }
    }
  }, [])

  // Restore progress to audio element
  const restoreProgress = useCallback(
    async (audioElement: HTMLAudioElement) => {
      // Read from store directly to avoid effect timing races (e.g. setSessionId → canplay/loadedmetadata).
      const currentSessionId = usePlayerStore.getState().sessionId
      if (!currentSessionId) return

      try {
        const session = await DB.getPlaybackSession(currentSessionId)
        if (session && session.progress > 0) {
          audioElement.currentTime = session.progress
          setProgress(session.progress)
          log('[Session] Restored playback position:', session.progress)
        }
      } catch (err) {
        logError('[Session] Failed to restore progress:', err)
      }
    },
    [setProgress]
  )

  return {
    sessionId: storeSessionId,
    saveProgress,
    restoreProgress,
  }
}
