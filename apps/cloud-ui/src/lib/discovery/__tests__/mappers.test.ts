import { describe, expect, it } from 'vitest'
import { mapSessionToDiscovery, mapTrackToDiscovery } from '../mappers'

describe('discovery mappers', () => {
  it('does not fabricate canonical episodeGuid from podcast download track ids', () => {
    const { episode } = mapTrackToDiscovery({
      id: 'track-local-only-id',
      sourceType: 'podcast_download',
      name: 'Downloaded Episode',
      audioId: 'audio-1',
      sizeBytes: 1024,
      createdAt: 1700000000000,
      sourceUrlNormalized: 'https://example.com/download.mp3',
      downloadedAt: 1700000000000,
      countryAtSave: 'us',
      sourceFeedUrl: 'https://example.com/feed.xml',
      sourceEpisodeTitle: 'Downloaded Episode',
    })

    expect(episode.episodeGuid).toBeUndefined()
  })

  it('keeps canonical episodeGuid when the download track already has one', () => {
    const { episode } = mapTrackToDiscovery({
      id: 'track-local-only-id',
      sourceType: 'podcast_download',
      name: 'Downloaded Episode',
      audioId: 'audio-1',
      sizeBytes: 1024,
      createdAt: 1700000000000,
      sourceUrlNormalized: 'https://example.com/download.mp3',
      downloadedAt: 1700000000000,
      countryAtSave: 'us',
      sourceFeedUrl: 'https://example.com/feed.xml',
      sourceEpisodeTitle: 'Downloaded Episode',
      sourceEpisodeGuid: 'feed-guid-123',
    })

    expect(episode.episodeGuid).toBe('feed-guid-123')
  })

  it('does not fabricate canonical episodeGuid from playback session ids', () => {
    const { episode } = mapSessionToDiscovery({
      id: 'session-local-only-id',
      source: 'explore',
      title: 'Played Episode',
      createdAt: 1700000000000,
      lastPlayedAt: 1700000000000,
      sizeBytes: 0,
      durationSeconds: 90,
      audioId: null,
      subtitleId: null,
      hasAudioBlob: false,
      progress: 12,
      audioFilename: '',
      subtitleFilename: '',
      audioUrl: 'https://example.com/download.mp3',
      podcastFeedUrl: 'https://example.com/feed.xml',
      podcastTitle: 'Podcast',
    })

    expect(episode.episodeGuid).toBeUndefined()
  })
})
