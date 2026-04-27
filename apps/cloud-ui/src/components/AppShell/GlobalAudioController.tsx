// src/components/AppShell/GlobalAudioController.tsx
/**
 * Isolated audio controller component to prevent re-renders of the root layout.
 * This component handles all audio element events and state synchronization.
 * It should be mounted once at the root level and remain persistent across routes.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAudioElementEvents } from '../../hooks/useAudioElementEvents'
import { useAudioElementSync } from '../../hooks/useAudioElementSync'
import { useAudioProxyFallback } from '../../hooks/useAudioProxyFallback'
import { useAutoplayRetry } from '../../hooks/useAutoplayRetry'
import { useForegroundAudioPrefetch } from '../../hooks/useForegroundAudioPrefetch'
import { useImageObjectUrl } from '../../hooks/useImageObjectUrl'
import { useMediaSession } from '../../hooks/useMediaSession'
import { usePageVisibility } from '../../hooks/usePageVisibility'
import { usePlayerController } from '../../hooks/usePlayerController'
import { useSession } from '../../hooks/useSession'
import { useTabSync } from '../../hooks/useTabSync'
import { usePlayerStore } from '../../store/playerStore'

export function GlobalAudioController() {
  const { t } = useTranslation()
  const audioRef = useRef<HTMLAudioElement>(null)
  const isVisible = usePageVisibility()
  const isVisibleRef = useRef(isVisible)
  const lastProgressUpdateRef = useRef(0)
  const [mediaReadySrc, setMediaReadySrc] = useState<string | null>(null)
  const lastRestoreRequestKeyRef = useRef<string | null>(null)
  const lastAudioUrlRef = useRef<string | null>(null)
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
  const sessionId = usePlayerStore((s) => s.sessionId)

  useEffect(() => {
    if (lastAudioUrlRef.current === audioUrl) return
    lastAudioUrlRef.current = audioUrl
    setMediaReadySrc(null)
    lastRestoreRequestKeyRef.current = null
  }, [audioUrl])

  const coverArtBlobUrl = useImageObjectUrl(coverArtUrl instanceof Blob ? coverArtUrl : null)
  const artworkUrl = typeof coverArtUrl === 'string' ? coverArtUrl : coverArtBlobUrl

  useTabSync()

  const currentTrack = useMemo(() => {
    if (!audioUrl) return null
    return {
      audioUrl,
      title: audioTitle || '',
      artist: episodeMetadata?.showTitle,
      artworkUrl: artworkUrl ?? null,
      artworkType: coverArtUrl instanceof Blob ? coverArtUrl.type : undefined,
    }
  }, [audioTitle, artworkUrl, audioUrl, episodeMetadata?.showTitle, coverArtUrl])

  const handlePlay = useCallback(() => {
    usePlayerStore.getState().play()
  }, [])

  const handlePause = useCallback(() => {
    usePlayerStore.getState().pause()
  }, [])

  const handleMetadataReady = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    const currentSrc = audio.currentSrc || audio.src || null
    setMediaReadySrc(currentSrc)
  }, [])

  const { prevSmart, nextSmart } = usePlayerController()

  const mediaSessionActions = useMemo(
    () => ({
      play: handlePlay,
      pause: handlePause,
      prev: prevSmart,
      next: nextSmart,
    }),
    [handlePause, handlePlay, nextSmart, prevSmart]
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

  useAudioElementSync({ audioRef, audioUrl, volume, playbackRate })
  useForegroundAudioPrefetch({ audioRef, audioUrl })
  useAudioElementEvents({
    audioRef,
    isVisibleRef,
    lastProgressUpdateRef,
    onPlay: handlePlay,
    onPause: handlePause,
    onLoadedMetadata: handleMetadataReady,
    t,
  })
  useAutoplayRetry({ audioRef, audioUrl, isPlaying })
  useAudioProxyFallback({ audioRef, audioUrl })

  // Monitor pendingSeek and sync to audio element
  useEffect(() => {
    const audio = audioRef.current
    if (pendingSeek === null || !audio) return
    if (audio.readyState < 1 && !mediaReadySrc) return

    audio.currentTime = pendingSeek
    const state = usePlayerStore.getState()
    state.clearPendingSeek()

    if (state.autoplayAfterPendingSeek) {
      state.clearAutoplayAfterPendingSeek()
      state.play()
    }
  }, [pendingSeek, mediaReadySrc])

  // AUTHORITATIVE RESTORE: Single entry point for both event-based and state-based triggers.
  // Triggers once per (sessionId + audioUrl) after metadata is ready for the current src.
  useEffect(() => {
    const audio = audioRef.current
    if (!sessionId || !audio || !audioUrl || !mediaReadySrc) return
    const currentSrc = audio.currentSrc || audio.src || null
    if (!currentSrc || currentSrc !== mediaReadySrc) return

    const requestKey = `${sessionId}::${audioUrl}`
    if (lastRestoreRequestKeyRef.current === requestKey) return
    lastRestoreRequestKeyRef.current = requestKey

    void restoreProgress(audio)
  }, [sessionId, audioUrl, restoreProgress, mediaReadySrc])

  // Render nothing visible, just the audio element
  // biome-ignore lint/a11y/useMediaCaption: Audio captions handled via transcript component
  return <audio ref={audioRef} />
}
