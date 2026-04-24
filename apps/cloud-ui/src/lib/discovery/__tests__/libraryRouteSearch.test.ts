import { describe, expect, it } from 'vitest'
import { normalizeFeedUrl } from '@/lib/discovery/feedUrl'
import { libraryDetailSearchSchema, podcastShowSearchSchema } from '../libraryRouteSearch'

describe('libraryRouteSearch schemas', () => {
  it('keeps library detail routes path-only by ignoring query hints', () => {
    expect(
      libraryDetailSearchSchema.parse({
        source: 'search',
        feedUrl: normalizeFeedUrl('https://example.com/feed.xml'),
        audioUrl: 'https://example.com/audio.mp3',
        episodeGuid: 'episode-guid-1',
        sessionId: 'session-1',
      })
    ).toEqual({})
  })

  it('does not accept fromLayoutPrefix as show-route search contract', () => {
    expect(
      podcastShowSearchSchema.parse({
        fromLayoutPrefix: 'top-shows',
      })
    ).toEqual({})
  })
})
