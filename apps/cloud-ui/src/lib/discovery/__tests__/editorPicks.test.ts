import { describe, expect, it } from 'vitest'
import {
  buildEpisodeCompactKey,
  getCanonicalEditorPickPodcastID,
  getStableEpisodeIdentifier,
  matchesEditorPickRouteID,
  parseEpisodeCompactKey,
} from '../editorPicks'

describe('editorPicks canonical identifiers', () => {
  it('builds and parses compact episode keys for valid UUIDs', () => {
    const uuid = '766f112e-abcd-1234-5678-07e05e548074'
    const key = buildEpisodeCompactKey(uuid)

    expect(key).toBe('dm8RLqvNEjRWeAfgXlSAdA')
    // biome-ignore lint/style/noNonNullAssertion: test assertion
    expect(parseEpisodeCompactKey(key!)).toBe(uuid)
  })

  it('returns null for invalid UUIDs', () => {
    expect(buildEpisodeCompactKey('not-a-uuid')).toBeNull()
    expect(parseEpisodeCompactKey('not-a-key')).toBeNull()
  })

  it('uses podcastItunesId as the canonical editor-pick show identifier when available', () => {
    expect(
      getCanonicalEditorPickPodcastID({
        id: 'podcast-guid',
        title: 'Show Name',
        url: 'https://example.com/show',
        genres: [],
        podcastItunesId: '1200361736',
        feedId: '75075',
      })
    ).toBe('1200361736')
  })

  it('matches route ids against canonical show identifiers only', () => {
    expect(
      matchesEditorPickRouteID(
        {
          id: 'podcast-guid',
          title: 'Show Name',
          url: 'https://example.com/show',
          genres: [],
          podcastItunesId: '1200361736',
          feedId: '75075',
          podcastGuid: 'podcast-guid',
        },
        '1200361736'
      )
    ).toBe(true)

    expect(
      matchesEditorPickRouteID(
        {
          id: 'podcast-guid',
          title: 'Show Name',
          url: 'https://example.com/show',
          genres: [],
          feedId: '75075',
          podcastGuid: 'podcast-guid',
        },
        '75075'
      )
    ).toBe(false)
  })

  it('prefers episodeGuid over fallback ids for stable episode identity', () => {
    expect(
      getStableEpisodeIdentifier({
        id: 'fallback-id',
        episodeGuid: 'episode-guid-42',
      })
    ).toBe('episode-guid-42')
  })
})
