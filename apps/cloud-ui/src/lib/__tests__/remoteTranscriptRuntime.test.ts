import { beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlayerStore } from '../../store/playerStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import {
  applyRetranscribedCuesToCurrentTrack,
  clearAsrStateForTrack,
  isTrackStillCurrent,
  resolveAsrIdentityUrl,
} from '../remoteTranscriptRuntime'

describe('remoteTranscriptRuntime', () => {
  beforeEach(() => {
    usePlayerStore.getState().reset()
    useTranscriptStore.getState().resetTranscript()
  })

  it('resolves ASR identity to original remote URL for blob-backed canonical playback', () => {
    expect(
      resolveAsrIdentityUrl('blob:https://app.local/track-1', {
        kind: 'remote-episode',
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-1',
        podcastItunesId: 'podcast-1',
        countryAtSave: 'us',
        originalAudioUrl: 'https://cdn.example.com/audio.mp3',
      })
    ).toBe('https://cdn.example.com/audio.mp3')
  })

  it('checks current track ownership by request id and identity URL', () => {
    usePlayerStore.setState({
      audioUrl: 'https://example.com/audio.mp3',
      loadRequestId: 4,
    })

    expect(isTrackStillCurrent('https://example.com/audio.mp3', 4)).toBe(true)
    expect(isTrackStillCurrent('https://example.com/audio.mp3', 5)).toBe(false)
    expect(isTrackStillCurrent('https://example.com/other.mp3', 4)).toBe(false)
  })

  it('clears ASR state only for the current track', () => {
    const setAbortAsrControllerSpy = vi.spyOn(
      useTranscriptStore.getState(),
      'setAbortAsrController'
    )
    const setAsrActiveTrackKeySpy = vi.spyOn(useTranscriptStore.getState(), 'setAsrActiveTrackKey')
    const setTranscriptIngestionErrorSpy = vi.spyOn(
      useTranscriptStore.getState(),
      'setTranscriptIngestionError'
    )
    const setTranscriptIngestionStatusSpy = vi.spyOn(
      useTranscriptStore.getState(),
      'setTranscriptIngestionStatus'
    )

    usePlayerStore.setState({
      audioUrl: 'https://example.com/audio.mp3',
      loadRequestId: 8,
    })

    clearAsrStateForTrack('https://example.com/other.mp3', 8, 'failed', {
      code: 'network_error',
      message: 'mismatch',
    })
    expect(setTranscriptIngestionStatusSpy).not.toHaveBeenCalled()

    clearAsrStateForTrack('https://example.com/audio.mp3', 8, 'failed', {
      code: 'network_error',
      message: 'failure',
    })
    expect(setAbortAsrControllerSpy).toHaveBeenCalledWith(null)
    expect(setAsrActiveTrackKeySpy).toHaveBeenCalledWith(null)
    expect(setTranscriptIngestionErrorSpy).toHaveBeenCalledWith({
      code: 'network_error',
      message: 'failure',
    })
    expect(setTranscriptIngestionStatusSpy).toHaveBeenCalledWith('failed')
  })

  it('only applies retranscribed cues to the currently loaded local track', () => {
    const setSubtitlesSpy = vi.spyOn(useTranscriptStore.getState(), 'setSubtitles')

    usePlayerStore.setState({ localTrackId: 'track-1' })

    applyRetranscribedCuesToCurrentTrack('track-2', [{ start: 0, end: 1, text: 'ignore' }])
    expect(setSubtitlesSpy).not.toHaveBeenCalled()

    applyRetranscribedCuesToCurrentTrack('track-1', [{ start: 0, end: 1, text: 'apply' }])
    expect(setSubtitlesSpy).toHaveBeenCalledWith([{ start: 0, end: 1, text: 'apply' }])
  })
})
