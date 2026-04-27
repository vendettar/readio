import { describe, expect, it } from 'vitest'
import {
  buildSearchEpisodeRouteState,
  buildEpisodeCompactKey,
  getEditorPickRouteState,
  getCanonicalEditorPickPodcastID,
  getEpisodeGuid,
  matchesEditorPickRouteID,
} from '../editorPicks'
import { makeEditorPickPodcast } from './fixtures'

describe('editorPicks canonical identifiers', () => {
  it('builds compact episode keys for valid UUIDs', () => {
    const uuid = '766f112e-abcd-1234-5678-07e05e548074'
    const key = buildEpisodeCompactKey(uuid)

    expect(key).toBe('dm8RLqvNEjRWeAfgXlSAdA')
  })

  it('builds compact episode keys for non-UUID identities', () => {
    expect(buildEpisodeCompactKey('not-a-uuid')).toBe('e_bm90LWEtdXVpZA')
  })

  it('uses podcastItunesId as the canonical editor-pick show identifier when available', () => {
    expect(
      getCanonicalEditorPickPodcastID(
        makeEditorPickPodcast({
          podcastItunesId: '1200361736',
        })
      )
    ).toBe('1200361736')
  })

  it('matches route ids against canonical show identifiers only', () => {
    expect(
      matchesEditorPickRouteID(
        makeEditorPickPodcast({
          podcastItunesId: '1200361736',
        }),
        '1200361736'
      )
    ).toBe(true)

    expect(
      matchesEditorPickRouteID(
        makeEditorPickPodcast({
          podcastItunesId: undefined,
        }),
        '75075'
      )
    ).toBe(false)
  })

  it('prefers episodeGuid for stable feed episode identity', () => {
    expect(
      getEpisodeGuid({
        episodeGuid: 'episode-guid-with-more-than-32-chars-long-string',
      })
    ).toBe('episode-guid-with-more-than-32-chars-long-string')
  })

  it('returns undefined when episodeGuid is absent', () => {
    expect(
      getEpisodeGuid({
        episodeGuid: '',
      })
    ).toBeUndefined()
  })

  it('builds search episode route state with a typed episode snapshot', () => {
    const state = buildSearchEpisodeRouteState({
      title: 'Search Episode',
      episodeUrl: 'https://example.com/search.mp3',
      shortDescription: 'desc',
      releaseDate: '2025-01-02',
    })

    expect(state).toEqual({
      episodeSnapshot: {
        title: 'Search Episode',
        audioUrl: 'https://example.com/search.mp3',
        description: 'desc',
        pubDate: '2025-01-02',
      },
    })
  })

  it('parses route state when only episodeSnapshot is present', () => {
    const state = getEditorPickRouteState({
      episodeSnapshot: {
        title: 'Search Episode',
        audioUrl: 'https://example.com/search.mp3',
      },
    })

    expect(state).toEqual({
      episodeSnapshot: {
        title: 'Search Episode',
        audioUrl: 'https://example.com/search.mp3',
      },
    })
  })

  it('preserves both editorPickSnapshot and episodeSnapshot when both are valid', () => {
    const editorPickSnapshot = makeEditorPickPodcast({
      podcastItunesId: '1200361736',
    })

    const state = getEditorPickRouteState({
      editorPickSnapshot,
      episodeSnapshot: {
        title: 'Search Episode',
        audioUrl: 'https://example.com/search.mp3',
      },
    })

    expect(state).toEqual({
      editorPickSnapshot,
      episodeSnapshot: {
        title: 'Search Episode',
        audioUrl: 'https://example.com/search.mp3',
      },
    })
  })

  it('rejects route state without a usable editor pick or episode snapshot', () => {
    expect(
      getEditorPickRouteState({
        episodeSnapshot: {
          title: '   ',
        },
      })
    ).toBeNull()
  })
})
