import { describe, expect, it, vi } from 'vitest'
import {
  applySurfacePolicy,
  deriveSurfacePolicyFromEpisode,
  deriveSurfacePolicyFromFavorite,
  deriveSurfacePolicyFromHistorySession,
  deriveSurfacePolicyFromSearchEpisode,
} from '../surfacePolicy'

describe('surfacePolicy', () => {
  it('derives docked policy when transcript url exists', () => {
    const episodePolicy = deriveSurfacePolicyFromEpisode({
      transcriptUrl: 'https://example.com/episode.vtt',
    })
    const favoritePolicy = deriveSurfacePolicyFromFavorite({
      transcriptUrl: 'https://example.com/favorite.srt',
    })
    const historyPolicy = deriveSurfacePolicyFromHistorySession({
      transcriptUrl: 'https://example.com/history.srt',
    })

    expect(episodePolicy).toEqual({ playableContext: true, mode: 'docked' })
    expect(favoritePolicy).toEqual({ playableContext: true, mode: 'docked' })
    expect(historyPolicy).toEqual({ playableContext: true, mode: 'docked' })
  })

  it('keeps docked policy when transcript url is missing or blank', () => {
    expect(deriveSurfacePolicyFromEpisode({ transcriptUrl: undefined })).toEqual({
      playableContext: true,
      mode: 'docked',
    })
    expect(deriveSurfacePolicyFromFavorite({ transcriptUrl: '' })).toEqual({
      playableContext: true,
      mode: 'docked',
    })
    expect(deriveSurfacePolicyFromHistorySession({ transcriptUrl: '   ' })).toEqual({
      playableContext: true,
      mode: 'docked',
    })
    expect(
      deriveSurfacePolicyFromSearchEpisode({
        podcastItunesId: '2',
        title: 'Search Episode',
        showTitle: 'Podcast',
        artwork: 'https://example.com/art.jpg',
        feedUrl: 'https://example.com/feed.xml',
        episodeUrl: 'https://example.com/episode.mp3',
        episodeGuid: 'guid-surface-1',
        releaseDate: '2026-01-01T00:00:00Z',
        trackTimeMillis: 61000,
        shortDescription: 'desc',
      })
    ).toEqual({
      playableContext: true,
      mode: 'docked',
    })
  })

  it('applies policy through player surface actions', () => {
    const actions = {
      setPlayableContext: vi.fn(),
      toDocked: vi.fn(),
      toMini: vi.fn(),
    }

    applySurfacePolicy(actions, { playableContext: true, mode: 'docked' })
    expect(actions.setPlayableContext).toHaveBeenCalledWith(true)
    expect(actions.toDocked).toHaveBeenCalledTimes(1)
    expect(actions.toMini).not.toHaveBeenCalled()

    actions.setPlayableContext.mockClear()
    actions.toDocked.mockClear()
    actions.toMini.mockClear()

    applySurfacePolicy(actions, { playableContext: true, mode: 'mini' })
    expect(actions.setPlayableContext).toHaveBeenCalledWith(true)
    expect(actions.toMini).toHaveBeenCalledTimes(1)
    expect(actions.toDocked).not.toHaveBeenCalled()
  })
})
