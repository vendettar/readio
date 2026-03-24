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
