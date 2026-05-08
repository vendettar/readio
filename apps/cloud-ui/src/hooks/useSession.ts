// src/hooks/useSession.ts
import { useCallback, useEffect, useRef } from 'react'
import { log, error as logError } from '../lib/logger'
import { resolvePlaybackStateIdentityKey } from '../lib/player/playbackIdentity'
import { resolveManagedPlaybackSession } from '../lib/player/session/playerManagedSessionResolver'
import type { RestoreAppliedEntry } from '../lib/player/session/playerRestoreProgressResolver'
import {
  applyExistingManagedPlaybackSession,
  resolveCurrentPlaybackRestoreTarget,
  restorePlaybackProgressForTarget,
} from '../lib/player/session/playerSessionRuntime'
import { usePlayerStore } from '../store/playerStore'
import { useTranscriptStore } from '../store/transcriptStore'

const COMPLETED_RESTORE_THRESHOLD_SECONDS = 2

function getCurrentPlaybackIdentity(): string {
  return resolvePlaybackStateIdentityKey() ?? ''
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
  const restoreAppliedRef = useRef<Map<string, RestoreAppliedEntry>>(new Map())

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

    const findOrStartSession = async () => {
      isManagingSessionRef.current = true
      try {
        const liveState = usePlayerStore.getState()
        const resolved = await resolveManagedPlaybackSession({
          durationSeconds: duration || 0,
          liveState: {
            audioTitle: liveState.audioTitle,
            audioUrl: liveState.audioUrl,
            coverArtUrl: liveState.coverArtUrl,
            localTrackId: liveState.localTrackId,
            episodeMetadata: liveState.episodeMetadata,
          },
          fallbackLocalTrackId: localTrackId,
          fallbackEpisodeMetadata: episodeMetadata,
          getCurrentPlaybackIdentity,
        })
        if (resolved.kind === 'stale') {
          return
        }
        if (resolved.kind === 'invalid_remote_metadata') {
          logError('[Session] Rejecting session persistence: invalid canonical remote metadata')
          return
        }

        if (resolved.kind === 'existing') {
          applyExistingManagedPlaybackSession(resolved.session)
          return
        }

        setStoreSessionId(resolved.sessionId)
        log('[Session] Created new playback session:', resolved.sessionId)
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
      const target = resolveCurrentPlaybackRestoreTarget()
      if (!target) return

      try {
        await restorePlaybackProgressForTarget({
          audioElement,
          target,
          restoreInFlight: restoreInFlightKeysRef.current,
          restoreApplied: restoreAppliedRef.current,
          completedRestoreThresholdSeconds: COMPLETED_RESTORE_THRESHOLD_SECONDS,
          setProgress,
        })
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
