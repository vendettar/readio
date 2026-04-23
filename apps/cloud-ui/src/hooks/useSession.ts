// src/hooks/useSession.ts
import { useCallback, useEffect, useRef } from 'react'
import { DB, type PlaybackSession } from '../lib/dexieDb'
import { normalizeFeedUrl } from '../lib/discovery/feedUrl'
import { log, error as logError } from '../lib/logger'
import { normalizeCountryParam } from '../lib/routes/podcastRoutes'
import { generateSessionId } from '../lib/session'
import { usePlayerStore } from '../store/playerStore'
import { useTranscriptStore } from '../store/transcriptStore'

const COMPLETED_RESTORE_THRESHOLD_SECONDS = 2

function normalizeCountrySnapshot(country: string | undefined): string | undefined {
  return normalizeCountryParam(country) ?? undefined
}

function normalizeAudioSnapshot(audioUrl: string | null | undefined): string | undefined {
  if (typeof audioUrl !== 'string') return undefined
  const normalized = audioUrl.trim()
  if (!normalized || normalized.startsWith('blob:')) return undefined
  return normalized
}

function normalizePodcastFeedSnapshot(feedUrl: string | undefined): string | undefined {
  if (typeof feedUrl !== 'string') return undefined
  const normalized = normalizeFeedUrl(feedUrl)
  return normalized || undefined
}

function resolveSessionAudioSnapshot(
  audioUrl: string | null | undefined,
  metadata?: { originalAudioUrl?: string } | null
): string | undefined {
  return normalizeAudioSnapshot(metadata?.originalAudioUrl) ?? normalizeAudioSnapshot(audioUrl)
}

function getCurrentPlaybackIdentity(): string {
  const state = usePlayerStore.getState()
  return `${state.localTrackId ?? ''}::${resolveSessionAudioSnapshot(state.audioUrl, state.episodeMetadata) ?? ''}`
}

export function useSession() {
  const audioLoaded = usePlayerStore((s) => s.audioLoaded)
  const subtitlesLoaded = useTranscriptStore((s) => s.subtitlesLoaded)
  const duration = usePlayerStore((s) => s.duration)
  const storeSessionId = usePlayerStore((s) => s.sessionId)
  const sessionPersistenceSuspended = usePlayerStore((s) => s.sessionPersistenceSuspended)
  const localTrackId = usePlayerStore((s) => s.localTrackId)
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const setStoreSessionId = usePlayerStore((s) => s.setSessionId)
  const setProgress = usePlayerStore((s) => s.setProgress)
  const updateProgress = usePlayerStore((s) => s.updateProgress)
  const saveProgressNow = usePlayerStore((s) => s.saveProgressNow)
  const restoreSession = usePlayerStore((s) => s.restoreSession)
  const initializationStatus = usePlayerStore((s) => s.initializationStatus)
  const restoreInFlightKeysRef = useRef<Set<string>>(new Set())
  const restoreAppliedRef = useRef<Map<string, { targetTime: number; appliedAt: number }>>(
    new Map()
  )

  // 1. Initialize session on mount - now fully encapsulated in store
  useEffect(() => {
    if (initializationStatus === 'idle') {
      void restoreSession()
    }
  }, [initializationStatus, restoreSession])

  const isManagingSessionRef = useRef(false)

  // 2. Create NEW session if files are loaded manually (not via restoration)
  useEffect(() => {
    // We allow session creation if restoration is ready OR if it failed (so users can still upload)
    if (
      (initializationStatus !== 'ready' && initializationStatus !== 'failed') ||
      storeSessionId ||
      sessionPersistenceSuspended ||
      isManagingSessionRef.current
    ) {
      return
    }
    if (!audioLoaded && !subtitlesLoaded) return

    const liveState = usePlayerStore.getState()
    const currentLocalTrackId = liveState.localTrackId ?? localTrackId
    const effectiveMetadata = liveState.episodeMetadata ?? episodeMetadata
    const normalizedAudioUrl = resolveSessionAudioSnapshot(liveState.audioUrl, effectiveMetadata)
    const currentIdentity = `${currentLocalTrackId ?? ''}::${normalizedAudioUrl ?? ''}`

    const findOrStartSession = async () => {
      isManagingSessionRef.current = true
      try {
        // Identity guard: ignore stale async work after playback context switches.
        if (getCurrentPlaybackIdentity() !== currentIdentity) {
          return
        }

        let existingSession: PlaybackSession | undefined

        // Try to find existing session by localTrackId (library)
        if (currentLocalTrackId) {
          const expectedSessionId = `local-track-${currentLocalTrackId}`
          const directSession = await DB.getPlaybackSession(expectedSessionId)
          if (directSession) {
            if (getCurrentPlaybackIdentity() !== currentIdentity) return

            setStoreSessionId(directSession.id)
            if (directSession.progress > 0) {
              setProgress(directSession.progress)
              usePlayerStore.getState().seekTo(directSession.progress)
            }
            if (directSession.durationSeconds) {
              usePlayerStore.getState().setDuration(directSession.durationSeconds)
            }
            return
          }
          existingSession = await DB.findLastSessionByTrackId(currentLocalTrackId)
        }
        // Try to find existing session by URL (podcast)
        else if (normalizedAudioUrl) {
          existingSession = await DB.findLastSessionByUrl(normalizedAudioUrl)
        }

        // Identity guard: check if context switched during DB await.
        if (getCurrentPlaybackIdentity() !== currentIdentity) {
          return
        }

        if (existingSession) {
          setStoreSessionId(existingSession.id)
          if (existingSession.progress > 0) {
            setProgress(existingSession.progress)
            usePlayerStore.getState().seekTo(existingSession.progress)
          }
          if (existingSession.durationSeconds) {
            usePlayerStore.getState().setDuration(existingSession.durationSeconds)
          }
        } else {
          // Precondition check before store commitment.
          const countryAtSave = normalizeCountrySnapshot(effectiveMetadata?.countryAtSave)
          if (effectiveMetadata && !countryAtSave) {
            logError('[Session] Rejecting explore session persistence: missing countryAtSave')
            return
          }

          // Create brand new session
          const id = generateSessionId()

          const { coverArtUrl, audioTitle } = usePlayerStore.getState()
          const source = effectiveMetadata ? 'explore' : 'local'
          const podcastFeedUrl = normalizePodcastFeedSnapshot(effectiveMetadata?.podcastFeedUrl)

          await DB.upsertPlaybackSession({
            id,
            progress: 0,
            durationSeconds: duration || 0,
            source,
            audioUrl: normalizedAudioUrl,
            audioFilename: audioTitle,
            title: audioTitle,
            localTrackId: currentLocalTrackId || undefined,
            artworkUrl:
              effectiveMetadata?.artworkUrl ||
              (typeof coverArtUrl === 'string' ? coverArtUrl : undefined),
            description: effectiveMetadata?.description,
            podcastTitle: effectiveMetadata?.showTitle,
            podcastFeedUrl,
            transcriptUrl: effectiveMetadata?.transcriptUrl,
            publishedAt: effectiveMetadata?.publishedAt,
            episodeGuid: effectiveMetadata?.episodeGuid,
            podcastItunesId: effectiveMetadata?.podcastItunesId,
            countryAtSave,
          })
          if (getCurrentPlaybackIdentity() !== currentIdentity) return
          setStoreSessionId(id)
          log('[Session] Created new playback session:', id)
        }
      } catch (err) {
        logError('[Session] Failed to manage session:', err)
      } finally {
        isManagingSessionRef.current = false
      }
    }

    void findOrStartSession()
  }, [
    audioLoaded,
    subtitlesLoaded,
    duration,
    storeSessionId,
    sessionPersistenceSuspended,
    localTrackId,
    episodeMetadata,
    initializationStatus,
    setStoreSessionId,
    setProgress,
  ])

  // 3. Save on unmount
  useEffect(() => {
    return () => {
      void saveProgressNow()
    }
  }, [saveProgressNow])

  // 4. Restore progress to physical audio element
  const restoreProgress = useCallback(
    async (audioElement: HTMLAudioElement) => {
      const state = usePlayerStore.getState()
      const currentSessionId = state.sessionId
      const audioIdentity = audioElement.currentSrc || audioElement.src || state.audioUrl || ''
      const restoreKey = `${currentSessionId ?? ''}::${audioIdentity}`
      const isRestoreTargetCurrent = (): boolean => {
        const liveState = usePlayerStore.getState()
        const liveAudioIdentity =
          audioElement.currentSrc || audioElement.src || liveState.audioUrl || ''
        return liveState.sessionId === currentSessionId && liveAudioIdentity === audioIdentity
      }

      if (!currentSessionId) return
      if (restoreInFlightKeysRef.current.has(restoreKey)) return

      try {
        restoreInFlightKeysRef.current.add(restoreKey)
        const session = await DB.getPlaybackSession(currentSessionId)
        if (!isRestoreTargetCurrent()) return

        if (session && session.progress >= 0) {
          const duration = session.durationSeconds
          const isSessionComplete =
            duration > 0 &&
            session.progress >= Math.max(0, duration - COMPLETED_RESTORE_THRESHOLD_SECONDS)

          const targetTime = isSessionComplete ? 0 : session.progress
          const clampedProgress = duration > 0 ? Math.min(targetTime, duration) : targetTime
          const now = Date.now()
          const lastApplied = restoreAppliedRef.current.get(restoreKey)
          if (
            lastApplied &&
            Math.abs(lastApplied.targetTime - clampedProgress) < 0.2 &&
            now - lastApplied.appliedAt < 750
          ) {
            return
          }

          // Apply physical seek
          audioElement.currentTime = clampedProgress
          setProgress(clampedProgress)
          restoreAppliedRef.current.set(restoreKey, { targetTime: clampedProgress, appliedAt: now })

          if (isSessionComplete) {
            if (!isRestoreTargetCurrent()) return
            await DB.updatePlaybackSession(currentSessionId, { progress: 0 })
          }

          log('[Session] Restored playback physical position:', clampedProgress, {
            sessionId: currentSessionId,
            isComplete: isSessionComplete,
          })

          if (restoreAppliedRef.current.size > 64) {
            const cutoff = now - 5 * 60 * 1000
            for (const [key, value] of restoreAppliedRef.current.entries()) {
              if (value.appliedAt < cutoff) {
                restoreAppliedRef.current.delete(key)
              }
            }
          }
        }
      } catch (err) {
        logError('[Session] Failed to restore progress:', err)
      } finally {
        restoreInFlightKeysRef.current.delete(restoreKey)
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
