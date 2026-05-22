import { describe, expect, it } from 'vitest'
import {
  buildPodcastDetailQueryKey,
  buildPodcastEpisodeDetailQueryKey,
  buildPodcastEpisodesPagesQueryKey,
} from '../podcastQueryContract'

describe('podcastQueryContract', () => {
  it('keys page-rendering episode pages by trimmed podcastItunesId', () => {
    expect(buildPodcastEpisodesPagesQueryKey(' 123 ')).toEqual(['podcast', 'episodes-pages', '123'])
  })

  it('adds route-country scope to page-rendering episode-page keys when present', () => {
    expect(buildPodcastEpisodesPagesQueryKey('123', 'jp')).toEqual([
      'podcast',
      'episodes-pages',
      '123',
      'country-jp',
    ])
  })

  it('keys podcast detail only by trimmed podcastItunesId', () => {
    expect(buildPodcastDetailQueryKey(' 123 ')).toEqual(['podcast', 'detail', '123'])
  })

  it('adds route-country scope to podcast detail keys when present', () => {
    expect(buildPodcastDetailQueryKey('123', 'jp')).toEqual([
      'podcast',
      'detail',
      '123',
      'country-jp',
    ])
  })

  it('keys episode detail without internal source-family tokens', () => {
    expect(buildPodcastEpisodeDetailQueryKey(' 123 ', ' ep-1 ', 'jp')).toEqual([
      'podcast',
      'episode-detail',
      '123',
      'country-jp',
      'ep-1',
    ])
  })
})
