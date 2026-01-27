import { useEffect } from 'react'

type MediaSessionTrack = {
  audioUrl: string
  title: string
  artist?: string
  artworkUrl?: string | null
  artworkType?: string
}

type MediaSessionActions = {
  play: () => void
  pause: () => void
  prev: () => void
  next: () => void
  seekRelative: (deltaSeconds: number) => void
  seek: (timeSeconds: number) => void
}

const SEEK_BACK_SECONDS = -10
const SEEK_FORWARD_SECONDS = 30

function canUseMediaSession(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaSession' in navigator &&
    typeof MediaMetadata !== 'undefined'
  )
}

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler)
  } catch {
    // Some browsers throw on unsupported actions; silently ignore.
  }
}

function getMimeTypeFromUrl(url: string): string | undefined {
  const extension = url.split(/[#?]/)[0].split('.').pop()?.toLowerCase()
  switch (extension) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return undefined
  }
}

export function useMediaSession(
  currentTrack: MediaSessionTrack | null,
  actions: MediaSessionActions,
  playbackStatus?: 'playing' | 'paused' | 'none'
) {
  useEffect(() => {
    if (!canUseMediaSession()) return

    if (!currentTrack) {
      navigator.mediaSession.metadata = null
      return
    }

    const artwork = currentTrack.artworkUrl
      ? [
          {
            src: currentTrack.artworkUrl,
            sizes: '512x512',
            type: currentTrack.artworkType || getMimeTypeFromUrl(currentTrack.artworkUrl),
          },
        ]
      : undefined

    if (typeof MediaMetadata !== 'undefined') {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        artwork,
      })
    }
  }, [currentTrack])

  useEffect(() => {
    if (!canUseMediaSession()) return
    navigator.mediaSession.playbackState = playbackStatus || 'none'
  }, [playbackStatus])

  useEffect(() => {
    if (!canUseMediaSession()) return

    if (!currentTrack) {
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
      setHandler('seekto', null)
      return
    }

    setHandler('play', actions.play)
    setHandler('pause', actions.pause)
    setHandler('previoustrack', actions.prev)
    setHandler('nexttrack', actions.next)
    setHandler('seekbackward', () => actions.seekRelative(SEEK_BACK_SECONDS))
    setHandler('seekforward', () => actions.seekRelative(SEEK_FORWARD_SECONDS))
    setHandler('seekto', (details) => {
      const seekTime = details?.seekTime
      if (typeof seekTime !== 'number' || Number.isNaN(seekTime)) return
      actions.seek(seekTime)
    })

    return () => {
      setHandler('play', null)
      setHandler('pause', null)
      setHandler('previoustrack', null)
      setHandler('nexttrack', null)
      setHandler('seekbackward', null)
      setHandler('seekforward', null)
      setHandler('seekto', null)
    }
  }, [actions, currentTrack])
}
