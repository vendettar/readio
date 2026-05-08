import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  bindMediaSessionActionHandlers,
  buildMediaSessionMetadataInit,
  type MediaSessionActions,
  type MediaSessionTrack,
  syncMediaSessionMetadata,
  syncMediaSessionPlaybackState,
} from '../mediaSessionRuntime'

const {
  executeMediaSessionSeekBackwardMock,
  executeMediaSessionSeekForwardMock,
  executeMediaSessionSeekToMock,
} = vi.hoisted(() => ({
  executeMediaSessionSeekBackwardMock: vi.fn(),
  executeMediaSessionSeekForwardMock: vi.fn(),
  executeMediaSessionSeekToMock: vi.fn(),
}))

vi.mock('../../lib/player/playerCommandActions', () => ({
  executeMediaSessionSeekBackward: executeMediaSessionSeekBackwardMock,
  executeMediaSessionSeekForward: executeMediaSessionSeekForwardMock,
  executeMediaSessionSeekTo: executeMediaSessionSeekToMock,
}))

describe('mediaSessionRuntime', () => {
  const handlerMap = new Map<string, MediaSessionActionHandler | null>()

  beforeEach(() => {
    vi.clearAllMocks()
    handlerMap.clear()

    vi.stubGlobal('navigator', {
      mediaSession: {
        metadata: null,
        playbackState: 'none',
        setActionHandler: vi.fn((action: string, handler: MediaSessionActionHandler | null) => {
          handlerMap.set(action, handler)
        }),
      },
    })

    vi.stubGlobal(
      'MediaMetadata',
      class {
        constructor(public readonly value: MediaMetadataInit) {}
      }
    )
  })

  it('builds media metadata with inferred artwork mime types', () => {
    const track: MediaSessionTrack = {
      audioUrl: 'https://example.com/audio.mp3',
      title: 'Episode',
      artist: 'Podcast',
      artworkUrl: 'https://example.com/artwork.webp?size=512',
    }

    expect(buildMediaSessionMetadataInit(track)).toEqual({
      title: 'Episode',
      artist: 'Podcast',
      artwork: [
        {
          src: 'https://example.com/artwork.webp?size=512',
          sizes: '512x512',
          type: 'image/webp',
        },
      ],
    })
  })

  it('syncs media session metadata and playback state', () => {
    syncMediaSessionMetadata({
      audioUrl: 'https://example.com/audio.mp3',
      title: 'Episode',
      artist: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
    })
    syncMediaSessionPlaybackState('playing')

    expect(navigator.mediaSession.playbackState).toBe('playing')
    const metadata = navigator.mediaSession.metadata as unknown as { value: MediaMetadataInit }
    expect(metadata.value).toMatchObject({
      title: 'Episode',
      artist: 'Podcast',
    })

    syncMediaSessionMetadata(null)
    expect(navigator.mediaSession.metadata).toBeNull()
  })

  it('binds handlers and clears them on teardown', () => {
    const actions: MediaSessionActions = {
      play: vi.fn(),
      pause: vi.fn(),
      prev: vi.fn(),
      next: vi.fn(),
    }

    const teardown = bindMediaSessionActionHandlers(
      {
        audioUrl: 'https://example.com/audio.mp3',
        title: 'Episode',
      },
      actions
    )

    handlerMap.get('play')?.({} as MediaSessionActionDetails)
    handlerMap.get('pause')?.({} as MediaSessionActionDetails)
    handlerMap.get('previoustrack')?.({} as MediaSessionActionDetails)
    handlerMap.get('nexttrack')?.({} as MediaSessionActionDetails)
    handlerMap.get('seekbackward')?.({} as MediaSessionActionDetails)
    handlerMap.get('seekforward')?.({} as MediaSessionActionDetails)
    handlerMap.get('seekto')?.({ seekTime: 123 } as MediaSessionActionDetails)

    expect(actions.play).toHaveBeenCalledTimes(1)
    expect(actions.pause).toHaveBeenCalledTimes(1)
    expect(actions.prev).toHaveBeenCalledTimes(1)
    expect(actions.next).toHaveBeenCalledTimes(1)
    expect(executeMediaSessionSeekBackwardMock).toHaveBeenCalledTimes(1)
    expect(executeMediaSessionSeekForwardMock).toHaveBeenCalledTimes(1)
    expect(executeMediaSessionSeekToMock).toHaveBeenCalledWith(123)

    teardown()

    expect(handlerMap.get('play')).toBeNull()
    expect(handlerMap.get('pause')).toBeNull()
    expect(handlerMap.get('previoustrack')).toBeNull()
    expect(handlerMap.get('nexttrack')).toBeNull()
    expect(handlerMap.get('seekbackward')).toBeNull()
    expect(handlerMap.get('seekforward')).toBeNull()
    expect(handlerMap.get('seekto')).toBeNull()
  })
})
