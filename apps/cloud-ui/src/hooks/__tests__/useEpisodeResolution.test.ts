import { describe, expect, it } from 'vitest'
import type { Episode } from '@/lib/discovery'
import { generateSlug } from '@/lib/slugUtils'
import { resolveEpisodeByShortId } from '../useEpisodeResolution'

function createEpisode(input: Partial<Episode> & Pick<Episode, 'id' | 'title'>): Episode {
  return {
    id: input.id,
    title: input.title,
    description: input.description ?? '',
    audioUrl: input.audioUrl ?? `https://example.com/${input.id}.mp3`,
    pubDate: input.pubDate ?? '2024-01-01T00:00:00.000Z',
    artworkUrl: input.artworkUrl,
    providerEpisodeId: input.providerEpisodeId,
  }
}

describe('resolveEpisodeByShortId', () => {
  it('uses title slug as deterministic tie-breaker', () => {
    const shortId = 'abc12345'
    const first = createEpisode({ id: 'ep-1', title: 'First Episode', providerEpisodeId: shortId })
    const second = createEpisode({
      id: 'ep-2',
      title: 'Second Episode',
      providerEpisodeId: shortId,
    })

    const resolved = resolveEpisodeByShortId(
      [first, second],
      shortId,
      generateSlug('Second Episode')
    )

    expect(resolved?.id).toBe('ep-2')
  })

  it('falls back to recency then id order when title slug does not match', () => {
    const shortId = 'abc12345'
    const older = createEpisode({
      id: 'ep-b',
      title: 'Older',
      providerEpisodeId: shortId,
      pubDate: '2024-01-01T00:00:00.000Z',
    })
    const newer = createEpisode({
      id: 'ep-a',
      title: 'Newer',
      providerEpisodeId: shortId,
      pubDate: '2025-01-01T00:00:00.000Z',
    })

    const resolved = resolveEpisodeByShortId([older, newer], shortId, 'no-match')

    expect(resolved?.id).toBe('ep-a')
  })
})
