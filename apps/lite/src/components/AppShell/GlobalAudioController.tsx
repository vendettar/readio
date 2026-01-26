// src/components/AppShell/GlobalAudioController.tsx
/**
 * Isolated audio controller component to prevent re-renders of the root layout.
 * This component handles all audio element events and state synchronization.
 * It should be mounted once at the root level and remain persistent across routes.
 */

import { useEffect, useRef } from 'react'
import { useSession } from '../../hooks/useSession'
import { warn } from '../../lib/logger'
import { toast } from '../../lib/toast'
import { usePlayerStore } from '../../store/playerStore'

export function GlobalAudioController() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const { restoreProgress } = useSession()

  // Use atomic selectors to avoid subscribing to rapidly changing state
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const pendingSeek = usePlayerStore((s) => s.pendingSeek)

  // Audio event handlers - persistent across routes
  // Use getState() for store actions to avoid subscription
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-attach listeners when audio source changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      usePlayerStore.getState().updateProgress(audio.currentTime)
    }
    const onDurationChange = () => {
      usePlayerStore.getState().setDuration(audio.duration)
    }
    const onPlay = () => {
      usePlayerStore.getState().play()
    }
    const onPause = () => {
      usePlayerStore.getState().pause()
    }
    const onEnded = () => {
      usePlayerStore.getState().updateProgress(audio.duration || audio.currentTime)
      usePlayerStore.getState().pause()
    }
    const onWaiting = () => {
      const { isPlaying } = usePlayerStore.getState()
      if (isPlaying) {
        usePlayerStore.getState().setStatus('loading')
      }
    }
    const onCanPlay = () => {
      const { isPlaying, status } = usePlayerStore.getState()
      if (status === 'loading') {
        usePlayerStore.getState().setStatus(isPlaying ? 'playing' : 'paused')
      }
    }
    const onError = () => {
      usePlayerStore.getState().setPlayerError('Audio element error')
    }

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('waiting', onWaiting)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('error', onError)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('waiting', onWaiting)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
    }
  }, [audioUrl])

  // Restore session progress when a new audio source is loaded
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const onLoadedMetadata = () => {
      restoreProgress(audio)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [audioUrl, restoreProgress])

  // Sync play state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const { status } = usePlayerStore.getState()

    if (isPlaying) {
      if (status === 'error') return
      audio.play().catch((err) => {
        // AbortError is normal when stopping/switching tracks rapidly
        if (err.name === 'AbortError') return

        warn('[Player] play() failed', { error: err, audioUrl })
        // If it was a block, let the user know
        if (err.name === 'NotAllowedError') {
          usePlayerStore.getState().pause()
          toast.infoKey('player.autoplayBlocked')
        }
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, audioUrl])

  // Monitor pendingSeek and sync to audio element
  useEffect(() => {
    if (pendingSeek !== null && audioRef.current) {
      audioRef.current.currentTime = pendingSeek
      usePlayerStore.getState().clearPendingSeek()
    }
  }, [pendingSeek])

  // Sync volume to audio element
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-sync volume when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, audioUrl])

  // Sync playback rate to audio element
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-sync playbackRate when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, audioUrl])

  // Render nothing visible, just the audio element
  // biome-ignore lint/a11y/useMediaCaption: Audio captions handled via transcript component
  return <audio ref={audioRef} src={audioUrl ?? undefined} />
}
