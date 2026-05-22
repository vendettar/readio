import { describe, expect, it } from 'vitest'
import {
  buildPlaybackSessionRecord,
  buildSubscriptionRecord,
  normalizeFavoriteRecord,
  normalizePlaybackSessionRecord,
} from '../recordNormalizers'

describe('recordNormalizers', () => {
  it('builds subscription records with canonical trimmed fields', () => {
    const record = buildSubscriptionRecord({
      podcastItunesId: ' pod-1 ',
      title: ' Podcast Title ',
      author: ' Podcast Author ',
      artworkUrl: ' https://example.com/show.jpg ',
      addedAt: 1700000000000,
      countryAtSave: ' US ',
    })

    expect(record).toMatchObject({
      podcastItunesId: 'pod-1',
      title: 'Podcast Title',
      author: 'Podcast Author',
      artworkUrl: 'https://example.com/show.jpg',
      countryAtSave: 'us',
    })
    expect(record.id).toBeTruthy()
  })

  it('normalizes favorites from canonical identity instead of trusting the incoming key', () => {
    const record = normalizeFavoriteRecord(
      {
        id: 'fav-1',
        key: 'stale-key',
        audioUrl: ' https://example.com/audio.mp3 ',
        episodeTitle: ' Episode Title ',
        podcastTitle: ' Podcast Title ',
        artworkUrl: ' https://example.com/show.jpg ',
        addedAt: 1700000000000,
        description: '   ',
        pubDate: 1738368000,
        durationSeconds: 180,
        episodeArtworkUrl: '   ',
        episodeGuid: ' episode-guid-1 ',
        podcastItunesId: ' pod-1 ',
        countryAtSave: ' US ',
      },
      'favorite'
    )

    expect(record).toMatchObject({
      key: 'pod-1::episode-guid-1',
      audioUrl: 'https://example.com/audio.mp3',
      episodeTitle: 'Episode Title',
      podcastTitle: 'Podcast Title',
      artworkUrl: 'https://example.com/show.jpg',
      description: '',
      pubDate: 1738368000,
      durationSeconds: 180,
      episodeArtworkUrl: '',
      episodeGuid: 'episode-guid-1',
      podcastItunesId: 'pod-1',
      countryAtSave: 'us',
    })
  })

  it('builds explore playback sessions with strict canonical metadata', () => {
    const record = buildPlaybackSessionRecord({
      source: 'explore',
      title: 'Episode',
      audioUrl: ' https://example.com/audio.mp3 ',
      artworkUrl: ' https://example.com/art.jpg ',
      showTitle: ' Podcast Title ',
      episodeGuid: ' episode-guid-1 ',
      podcastItunesId: ' pod-1 ',
      countryAtSave: ' US ',
    })

    expect(record).toMatchObject({
      source: 'explore',
      title: 'Episode',
      audioUrl: 'https://example.com/audio.mp3',
      artworkUrl: 'https://example.com/art.jpg',
      showTitle: 'Podcast Title',
      episodeGuid: 'episode-guid-1',
      podcastItunesId: 'pod-1',
      countryAtSave: 'us',
    })
  })

  it('strips canonical remote metadata from local playback sessions', () => {
    const record = normalizePlaybackSessionRecord(
      {
        id: 'local-session-1',
        source: 'local',
        title: 'Local Session',
        createdAt: 1700000000000,
        lastPlayedAt: 1700000000000,
        sizeBytes: 0,
        durationSeconds: 0,
        audioId: null,
        subtitleId: null,
        hasAudioBlob: false,
        progress: 0,
        audioFilename: '',
        subtitleFilename: '',
        audioUrl: 'https://example.com/local.mp3',
        artworkUrl: 'https://example.com/local.jpg',
        showTitle: ' Local Title ',
        episodeGuid: 'should-be-stripped',
        podcastItunesId: 'should-be-stripped',
        countryAtSave: 'us',
      } as unknown as Parameters<typeof normalizePlaybackSessionRecord>[0],
      'local playback session'
    )

    expect(record).toMatchObject({
      source: 'local',
      showTitle: 'Local Title',
    })
    expect(record.episodeGuid).toBeUndefined()
    expect(record.podcastItunesId).toBeUndefined()
    expect(record.countryAtSave).toBeUndefined()
  })
})
