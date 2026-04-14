import { describe, expect, it } from 'vitest'
import { matchTopEpisodeToPodcastIndexEpisode } from '../topEpisodes'

describe('matchTopEpisodeToPodcastIndexEpisode', () => {
  it('prefers exact episodeGuid matches when the source already has one', () => {
    const match = matchTopEpisodeToPodcastIndexEpisode(
      {
        title: 'Apple Title',
        audioUrl: 'https://example.com/apple.mp3',
        episodeGuid: 'episode-guid-42',
      },
      [
        {
          id: 'older-id',
          title: 'Different Title',
          description: '',
          audioUrl: 'https://example.com/other.mp3',
          pubDate: '2024-01-01T00:00:00.000Z',
          episodeGuid: 'episode-guid-42',
        },
      ]
    )

    expect(match?.episodeGuid).toBe('episode-guid-42')
  })

  it('falls back to normalized title matching', () => {
    const match = matchTopEpisodeToPodcastIndexEpisode(
      {
        title: "What's Up? Episode 12",
        audioUrl: 'https://example.com/apple.mp3',
      },
      [
        {
          id: 'episode-guid-12',
          title: 'Whats Up Episode 12',
          description: '',
          audioUrl: 'https://example.com/other.mp3',
          pubDate: '2024-01-01T00:00:00.000Z',
          episodeGuid: 'episode-guid-12',
        },
      ]
    )

    expect(match?.id).toBe('episode-guid-12')
  })

  it('falls back to audio url stem matching using Apple episode audio, not the Apple page url', () => {
    const match = matchTopEpisodeToPodcastIndexEpisode(
      {
        title: 'Apple Title',
        audioUrl: 'https://cdn.example.com/audio/episode-99.mp3?token=abc',
      },
      [
        {
          id: 'episode-guid-99',
          title: 'Different Title',
          description: '',
          audioUrl: 'https://cdn.example.com/audio/episode-99.mp3?signature=xyz',
          pubDate: '2024-01-01T00:00:00.000Z',
          episodeGuid: 'episode-guid-99',
        },
      ]
    )

    expect(match?.id).toBe('episode-guid-99')
  })

  it('does not treat the Apple page url as an audio-url fallback candidate', () => {
    const match = matchTopEpisodeToPodcastIndexEpisode(
      {
        title: 'Apple Title',
        audioUrl: 'https://podcasts.apple.com/us/podcast/example/id12345?i=episode-99',
      },
      [
        {
          id: 'episode-guid-99',
          title: 'Different Title',
          description: '',
          audioUrl: 'https://cdn.example.com/audio/episode-99.mp3?signature=xyz',
          pubDate: '2024-01-01T00:00:00.000Z',
          episodeGuid: 'episode-guid-99',
        },
      ]
    )

    expect(match).toBeUndefined()
  })
})
