// src/components/AppShell/GlobalAudioController.tsx
/**
 * Isolated audio controller component to prevent re-renders of the root layout.
 * This component handles all audio element events and state synchronization.
 * It should be mounted once at the root level and remain persistent across routes.
 */

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { useMediaSession } from '../../hooks/useMediaSession'
import { usePageVisibility } from '../../hooks/usePageVisibility'
import { useSession } from '../../hooks/useSession'
import { useTabSync } from '../../hooks/useTabSync'
import { warn } from '../../lib/logger'
import { toast } from '../../lib/toast'
import { usePlayerStore } from '../../store/playerStore'

const TRACK_SKIP_SECONDS = 10

export function GlobalAudioController() {
  const audioRef = useRef<HTMLAudioElement>(null)
  const isVisible = usePageVisibility()
  const isVisibleRef = useRef(isVisible)
  const lastProgressUpdateRef = useRef(0)
  const { restoreProgress } = useSession()

  // Use atomic selectors to avoid subscribing to rapidly changing state
  const audioUrl = usePlayerStore((s) => s.audioUrl)
  const audioTitle = usePlayerStore((s) => s.audioTitle)
  const coverArtUrl = usePlayerStore((s) => s.coverArtUrl)
  const episodeMetadata = usePlayerStore((s) => s.episodeMetadata)
  const isPlaying = usePlayerStore((s) => s.isPlaying)
  const volume = usePlayerStore((s) => s.volume)
  const playbackRate = usePlayerStore((s) => s.playbackRate)
  const pendingSeek = usePlayerStore((s) => s.pendingSeek)

  const coverArtBlobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const artworkUrl = typeof coverArtUrl === 'string' ? coverArtUrl : coverArtBlobUrl

  useTabSync()

  const currentTrack = useMemo(() => {
    if (!audioUrl) return null
    return {
      audioUrl,
      title: audioTitle || '',
      artist: episodeMetadata?.podcastTitle,
      artworkUrl: artworkUrl ?? null,
      artworkType: coverArtUrl instanceof Blob ? coverArtUrl.type : undefined,
    }
  }, [audioTitle, artworkUrl, audioUrl, episodeMetadata?.podcastTitle, coverArtUrl])

  const handlePlay = useCallback(() => {
    usePlayerStore.getState().play()
  }, [])

  const handlePause = useCallback(() => {
    usePlayerStore.getState().pause()
  }, [])

  const handlePrev = useCallback(() => {
    const { currentIndex, subtitles, progress, duration, seekTo } = usePlayerStore.getState()
    if (currentIndex > 0 && subtitles[currentIndex - 1]) {
      seekTo(subtitles[currentIndex - 1].start)
      return
    }

    const target = Math.max(0, Math.min(duration || 0, progress - TRACK_SKIP_SECONDS))
    if (duration > 0 || target === 0) seekTo(target)
  }, [])

  const handleNext = useCallback(() => {
    const { currentIndex, subtitles, progress, duration, seekTo } = usePlayerStore.getState()
    if (currentIndex >= 0 && currentIndex < subtitles.length - 1 && subtitles[currentIndex + 1]) {
      seekTo(subtitles[currentIndex + 1].start)
      return
    }

    const target = Math.max(0, Math.min(duration || 0, progress + TRACK_SKIP_SECONDS))
    if (duration > 0) seekTo(target)
  }, [])

  const mediaSessionActions = useMemo(
    () => ({
      play: handlePlay,
      pause: handlePause,
      prev: handlePrev,
      next: handleNext,
    }),
    [handleNext, handlePause, handlePlay, handlePrev]
  )

  const playbackStatus = useMemo(() => {
    if (!audioUrl) return 'none'
    return isPlaying ? 'playing' : 'paused'
  }, [audioUrl, isPlaying])

  useMediaSession(currentTrack, mediaSessionActions, playbackStatus)

  useEffect(() => {
    isVisibleRef.current = isVisible
    if (isVisible) {
      lastProgressUpdateRef.current = 0
    }
  }, [isVisible])

  // Audio event handlers - persistent across routes
  // Use getState() for store actions to avoid subscription
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-attach listeners when audio source changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTimeUpdate = () => {
      const now = Date.now()
      if (!isVisibleRef.current) {
        if (now - lastProgressUpdateRef.current < 1000) return
      }
      lastProgressUpdateRef.current = now
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
