import type React from 'react'
import { useEffect } from 'react'

interface UseAudioElementSyncParams {
  audioRef: React.RefObject<HTMLAudioElement | null>
  audioUrl: string | null
  volume: number
  playbackRate: number
}

export function useAudioElementSync({
  audioRef,
  audioUrl,
  volume,
  playbackRate,
}: UseAudioElementSyncParams): void {
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    if (!audioUrl) {
      if (audio.getAttribute('src') !== null) {
        audio.removeAttribute('src')
        audio.load()
      }
      return
    }

    if (audio.getAttribute('src') !== audioUrl) {
      // Don't overwrite if the audio element is already using a proxy source
      // for this same track (set by useRemotePlaybackFallback during fallback).
      // When audioUrl changes to a different track, the proxy URL won't match
      // and the new track's src must be assigned.
      if (audio.src.includes('/api/proxy') && audio.src.includes(encodeURIComponent(audioUrl)))
        return
      audio.src = audioUrl
    }
  }, [audioRef, audioUrl])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-sync volume when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [audioRef, volume, audioUrl])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-sync playbackRate when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [audioRef, playbackRate, audioUrl])
}
