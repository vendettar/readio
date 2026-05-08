import {
  executeMediaSessionSeekBackward,
  executeMediaSessionSeekForward,
  executeMediaSessionSeekTo,
} from '../lib/player/playerCommandActions'

export type MediaSessionTrack = {
  audioUrl: string
  title: string
  artist?: string
  artworkUrl?: string | null
  artworkType?: string
}

export type MediaSessionActions = {
  play: () => void
  pause: () => void
  prev: () => void
  next: () => void
}

const MEDIA_SESSION_ACTION_KEYS = [
  'play',
  'pause',
  'previoustrack',
  'nexttrack',
  'seekbackward',
  'seekforward',
  'seekto',
] as const

export function canUseMediaSession(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'mediaSession' in navigator &&
    typeof MediaMetadata !== 'undefined'
  )
}

function setMediaSessionHandler(
  action: MediaSessionAction,
  handler: MediaSessionActionHandler | null
): void {
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

export function buildMediaSessionMetadataInit(currentTrack: MediaSessionTrack): MediaMetadataInit {
  const artwork = currentTrack.artworkUrl
    ? [
        {
          src: currentTrack.artworkUrl,
          sizes: '512x512',
          type: currentTrack.artworkType || getMimeTypeFromUrl(currentTrack.artworkUrl),
        },
      ]
    : undefined

  return {
    title: currentTrack.title,
    artist: currentTrack.artist,
    artwork,
  }
}

export function syncMediaSessionMetadata(currentTrack: MediaSessionTrack | null): void {
  if (!canUseMediaSession()) return

  if (!currentTrack) {
    navigator.mediaSession.metadata = null
    return
  }

  navigator.mediaSession.metadata = new MediaMetadata(buildMediaSessionMetadataInit(currentTrack))
}

export function syncMediaSessionPlaybackState(
  playbackStatus: 'playing' | 'paused' | 'none' = 'none'
): void {
  if (!canUseMediaSession()) return
  navigator.mediaSession.playbackState = playbackStatus
}

function clearMediaSessionActionHandlers(): void {
  for (const action of MEDIA_SESSION_ACTION_KEYS) {
    setMediaSessionHandler(action, null)
  }
}

export function bindMediaSessionActionHandlers(
  currentTrack: MediaSessionTrack | null,
  actions: MediaSessionActions
): () => void {
  if (!canUseMediaSession()) {
    return () => {}
  }

  if (!currentTrack) {
    clearMediaSessionActionHandlers()
    return () => {}
  }

  setMediaSessionHandler('play', actions.play)
  setMediaSessionHandler('pause', actions.pause)
  setMediaSessionHandler('previoustrack', actions.prev)
  setMediaSessionHandler('nexttrack', actions.next)
  setMediaSessionHandler('seekbackward', () => {
    executeMediaSessionSeekBackward()
  })
  setMediaSessionHandler('seekforward', () => {
    executeMediaSessionSeekForward()
  })
  setMediaSessionHandler('seekto', (details) => {
    executeMediaSessionSeekTo(details?.seekTime)
  })

  return () => {
    clearMediaSessionActionHandlers()
  }
}
