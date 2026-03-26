import { describe, expect, it } from 'vitest'
import { libraryDetailSearchSchema, podcastShowSearchSchema } from '../libraryRouteSearch'

describe('libraryRouteSearch schemas', () => {
  it('ignores legacy episode/episodes query hints', () => {
    expect(
      libraryDetailSearchSchema.parse({
        source: 'search',
        feedUrl: 'https://example.com/feed.xml',
        audioUrl: 'https://example.com/audio.mp3',
        providerEpisodeId: 'provider-1',
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
