import { describe, expect, it } from 'vitest'
import { buildRestoredRemoteSessionState } from '../playerSessionRestore'

describe('buildRestoredRemoteSessionState', () => {
  it('restores remote session metadata needed by download and export flows', () => {
    const restored = buildRestoredRemoteSessionState({
      session: {
        id: 'session-1',
        source: 'explore',
        title: 'Episode Title',
        createdAt: 1700000000000,
        lastPlayedAt: 1700000000000,
        sizeBytes: 0,
        durationSeconds: 245,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        progress: 42,
        audioFilename: '',
        subtitleFilename: '',
        audioUrl: 'https://example.com/episode.mp3',
        artworkUrl: 'https://example.com/art.jpg',
        description: 'Episode description',
        podcastTitle: 'Podcast Title',
        podcastFeedUrl: 'https://example.com/feed.xml',
        publishedAt: 1700001234,
        episodeGuid: 'episode-guid-1',
        podcastItunesId: 'podcast-1',
        transcriptUrl: 'https://example.com/transcript.vtt',
        countryAtSave: 'us',
      },
      audioUrl: 'blob:restored',
      coverArtUrl: 'https://example.com/art.jpg',
      originalAudioUrl: 'https://example.com/episode.mp3',
    })

    expect(restored.episodeMetadata).toEqual(
      expect.objectContaining({
        countryAtSave: 'us',
        durationSeconds: 245,
        originalAudioUrl: 'https://example.com/episode.mp3',
        transcriptUrl: 'https://example.com/transcript.vtt',
      })
    )
  })
})
