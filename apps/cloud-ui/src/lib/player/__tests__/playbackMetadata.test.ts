import { describe, expect, it } from 'vitest'
import {
  createCanonicalRemoteEpisodeMetadata,
  createLocalEpisodeMetadata,
  type EpisodeMetadataInput,
  isLocalEpisodeMetadata,
  normalizeEpisodeMetadata,
  resolveCanonicalRemotePlaybackSource,
  resolvePlaybackContentIdentityKey,
  resolvePlaybackSourceAudioUrl,
  resolvePlaybackStateIdentity,
  withPlaybackRequestMode,
} from '../playbackMetadata'

describe('playbackMetadata normalization', () => {
  function expectCanonicalRemoteMetadata(
    metadata: ReturnType<typeof createCanonicalRemoteEpisodeMetadata>
  ) {
    expect(metadata).not.toBeNull()
    return metadata
  }

  it('rejects remote-shaped metadata when canonical country snapshot is missing', () => {
    expect(
      normalizeEpisodeMetadata({
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-1',
        podcastItunesId: 'podcast-1',
      } as unknown as EpisodeMetadataInput)
    ).toBeNull()
  })

  it('preserves canonical remote metadata shape when updating playback mode', () => {
    const metadata = expectCanonicalRemoteMetadata(
      createCanonicalRemoteEpisodeMetadata({
        showTitle: 'Podcast',
        artworkUrl: 'https://example.com/art.jpg',
        episodeGuid: 'episode-1',
        podcastItunesId: 'podcast-1',
        countryAtSave: 'us',
      })
    )

    expect(withPlaybackRequestMode(metadata, 'default')).toMatchObject({
      kind: 'remote-episode',
      countryAtSave: 'us',
      playbackRequestMode: 'default',
    })
  })

  it('normalizes loose local metadata into a discriminated local union', () => {
    const metadata = normalizeEpisodeMetadata({
      transcriptUrl: ' https://example.com/transcript.vtt ',
    })

    expect(metadata).toEqual(
      createLocalEpisodeMetadata({
        transcriptUrl: 'https://example.com/transcript.vtt',
      })
    )
    expect(metadata?.kind).toBe('local')
    expect(isLocalEpisodeMetadata(metadata)).toBe(true)
  })

  it('resolves stable side-channel source url and canonical remote metadata together', () => {
    const metadata = createCanonicalRemoteEpisodeMetadata({
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      episodeGuid: 'episode-1',
      podcastItunesId: 'podcast-1',
      countryAtSave: 'us',
      originalAudioUrl: ' https://example.com/source.mp3 ',
    })

    expect(resolvePlaybackSourceAudioUrl('blob:http://localhost/audio', metadata)).toBe(
      'https://example.com/source.mp3'
    )
    expect(
      resolveCanonicalRemotePlaybackSource({
        audioUrl: 'blob:http://localhost/audio',
        metadata,
      })
    ).toMatchObject({
      audioUrl: 'https://example.com/source.mp3',
      metadata: expect.objectContaining({
        episodeGuid: 'episode-1',
        podcastItunesId: 'podcast-1',
        countryAtSave: 'us',
      }),
    })
  })

  it('builds playback content identity from canonical metadata before falling back to audio url', () => {
    const metadata = createCanonicalRemoteEpisodeMetadata({
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      episodeGuid: 'episode-1',
      podcastItunesId: 'podcast-1',
      countryAtSave: 'us',
      originalAudioUrl: 'https://example.com/source.mp3',
    })

    expect(
      resolvePlaybackContentIdentityKey({
        audioUrl: 'blob:http://localhost/audio',
        metadata,
      })
    ).toBe('podcast:podcast-1:episode:episode-1:country:us')

    expect(
      resolvePlaybackContentIdentityKey({
        audioUrl: ' https://example.com/fallback.mp3 ',
        metadata: null,
      })
    ).toBe('remote-playback:https://example.com/fallback.mp3')
  })

  it('resolves playback state identity with canonical metadata before local and url fallbacks', () => {
    const metadata = createCanonicalRemoteEpisodeMetadata({
      showTitle: 'Podcast',
      artworkUrl: 'https://example.com/art.jpg',
      episodeGuid: 'episode-identity',
      podcastItunesId: 'podcast-identity',
      countryAtSave: 'us',
      originalAudioUrl: 'https://example.com/source.mp3',
    })

    expect(
      resolvePlaybackStateIdentity({
        localTrackId: 'download-track-1',
        audioUrl: 'https://example.com/fallback.mp3',
        metadata,
      })
    ).toMatchObject({
      key: 'podcast:podcast-identity:episode:episode-identity:country:us',
      localTrackId: 'download-track-1',
      normalizedAudioUrl: 'https://example.com/source.mp3',
    })
  })
})
