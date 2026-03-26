import { describe, expect, it } from 'vitest'
import type { EpisodeMetadata } from '../../../store/playerStore'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../playbackMode'

function assertPlaybackModeType(_value: PlaybackRequestMode | undefined): void {}

describe('playbackMode SSOT', () => {
  it('exposes stable request-mode literals', () => {
    expect(PLAYBACK_REQUEST_MODE.DEFAULT).toBe('default')
    expect(PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT).toBe('stream_without_transcript')
  })

  it('matches EpisodeMetadata.playbackRequestMode type usage', () => {
    const metadataMode: EpisodeMetadata['playbackRequestMode'] =
      PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT
    assertPlaybackModeType(metadataMode)
    expect(metadataMode).toBe(PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT)
  })
})
