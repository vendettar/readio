import { describe, expect, it } from 'vitest'
import { buildPlaybackIdentityKey, resolveCurrentPlaybackIdentity } from '../playbackIdentity'

describe('playbackIdentity', () => {
  it('ignores whitespace-only remote urls when resolving playback identity', () => {
    const identity = resolveCurrentPlaybackIdentity({
      localTrackId: null,
      audioUrl: '   ',
      audioTitle: 'Episode',
      episodeMetadata: {
        originalAudioUrl: '   ',
      },
    } as never)

    expect(identity).toBeNull()
  })

  it('prefers normalized originalAudioUrl over audioUrl for remote playback identity', () => {
    const identity = resolveCurrentPlaybackIdentity({
      localTrackId: null,
      audioUrl: 'https://example.com/fallback.mp3',
      audioTitle: 'Episode',
      episodeMetadata: {
        originalAudioUrl: ' https://example.com/source.mp3 ',
      },
    } as never)

    expect(identity).toMatchObject({
      originalAudioUrl: 'https://example.com/source.mp3',
      normalizedAudioUrl: 'https://example.com/source.mp3',
      playbackIdentityKey: 'remote-playback:https://example.com/source.mp3',
    })
  })

  it('normalizes remote identity key inputs before building the key', () => {
    expect(
      buildPlaybackIdentityKey({
        localTrackId: null,
        normalizedAudioUrl: null,
        originalAudioUrl: '   ',
        audioUrl: ' https://example.com/audio.mp3 ',
      })
    ).toBe('remote-playback:https://example.com/audio.mp3')
  })

  it('prefers canonical episode identity over remote urls when present', () => {
    expect(
      buildPlaybackIdentityKey({
        localTrackId: null,
        normalizedAudioUrl: 'https://example.com/audio.mp3',
        audioUrl: 'https://example.com/audio.mp3',
        canonicalEpisode: {
          podcastItunesId: 'pod-1',
          episodeGuid: 'ep-1',
          countryAtSave: 'us',
        },
      })
    ).toBe('podcast:pod-1:episode:ep-1:country:us')
  })
})
