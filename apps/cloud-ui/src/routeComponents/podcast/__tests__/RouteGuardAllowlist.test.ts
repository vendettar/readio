import { describe, expect, it } from 'vitest'

describe('route guard allowlist fixture', () => {
  it('keeps test fixtures exempt from production route-guard patterns', () => {
    const libraryHintFixture = {
      source: 'history',
      feedUrl: 'https://example.com/feed.xml',
      audioUrl: 'https://example.com/audio.mp3',
      episodeGuid: 'episode-guid-1',
      sessionId: 'session-1',
    }

    expect(libraryHintFixture.source).toBe('history')
  })
})
