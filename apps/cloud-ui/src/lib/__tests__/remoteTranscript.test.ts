import { describe, expect, it } from 'vitest'
import {
  deriveRemoteTranscriptCacheId,
  getValidTranscriptUrl,
  normalizeAsrAudioUrl,
  normalizeTranscriptUrl,
  parseRemoteTranscriptContent,
} from '../remoteTranscript'

describe('remoteTranscript parser', () => {
  it('normalizes URL identity and removes hash', () => {
    const url = 'https://example.com/transcript.vtt#chapter-1'
    expect(normalizeTranscriptUrl(url)).toBe('https://example.com/transcript.vtt')
    expect(deriveRemoteTranscriptCacheId(url)).toBe(
      'remote-transcript:https://example.com/transcript.vtt'
    )
  })

  it('accepts absolute, root-relative, and protocol-relative transcript URLs but rejects junk', () => {
    expect(getValidTranscriptUrl('https://example.com/transcript.vtt')).toBe(
      'https://example.com/transcript.vtt'
    )
    expect(getValidTranscriptUrl('/transcripts/episode.vtt')).toBe(
      `${window.location.origin}/transcripts/episode.vtt`
    )
    expect(getValidTranscriptUrl('//cdn.example.com/transcript.vtt')).toBe(
      `${window.location.protocol}//cdn.example.com/transcript.vtt`
    )
    expect(getValidTranscriptUrl('  foo  ')).toBeNull()
  })

  it('normalizes ASR audio cache keys by removing tracking params', () => {
    const plain = normalizeAsrAudioUrl('http://Example.com/audio.mp3/')
    const tracked = normalizeAsrAudioUrl('https://example.com/audio.mp3/?utm_source=rss&fbclid=abc')
    expect(plain).toBe('https://example.com/audio.mp3')
    expect(tracked).toBe('https://example.com/audio.mp3')
  })

  it('parses SRT transcript payload', () => {
    const payload = `1
00:00:00,000 --> 00:00:02,000
Hello world
`

    const result = parseRemoteTranscriptContent('https://example.com/a.srt', payload)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].text).toBe('Hello world')
    }
  })

  it('parses VTT transcript payload', () => {
    const payload = `WEBVTT

00:00:00.000 --> 00:00:01.500
First line
`

    const result = parseRemoteTranscriptContent('https://example.com/a.vtt', payload)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(1)
      expect(result.cues[0].text).toBe('First line')
    }
  })

  it('parses podcast transcript JSON variants into deterministic cues', () => {
    const payload = JSON.stringify({
      segments: [
        { startTime: '00:00:00.000', endTime: '00:00:01.200', body: 'Segment A' },
        { start: 1.2, duration: 1.1, text: 'Segment B' },
      ],
    })

    const result = parseRemoteTranscriptContent('https://example.com/a.json', payload)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(2)
      expect(result.cues[0].text).toBe('Segment A')
      expect(result.cues[1].text).toBe('Segment B')
      expect(result.cues[1].start).toBeGreaterThanOrEqual(result.cues[0].end)
    }
  })

  it('parses timestamped plain-text transcript payloads', () => {
    const payload = `00:00 Intro line
00:05 Follow-up line
01:12 Closing line`

    const result = parseRemoteTranscriptContent(
      'https://api.omny.fm/transcript?format=TextWithTimestamps',
      payload
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(3)
      expect(result.cues[0]).toMatchObject({ start: 0, text: 'Intro line' })
      expect(result.cues[1]).toMatchObject({ start: 5, text: 'Follow-up line' })
      expect(result.cues[2]).toMatchObject({ start: 72, text: 'Closing line' })
      expect(result.cues[0].end).toBe(5)
      expect(result.cues[1].end).toBe(72)
    }
  })

  it('parses bracketed timestamped plain-text transcript payloads from TextWithTimestamps URLs', () => {
    const payload = `[00:00] Intro line
[00:05] Follow-up line
[01:12] Closing line`

    const result = parseRemoteTranscriptContent(
      'https://api.omny.fm/transcript?format=TextWithTimestamps',
      payload
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(3)
      expect(result.cues[0]).toMatchObject({ start: 0, text: 'Intro line' })
      expect(result.cues[1]).toMatchObject({ start: 5, text: 'Follow-up line' })
      expect(result.cues[2]).toMatchObject({ start: 72, text: 'Closing line' })
    }
  })

  it('parses timestamp-only lines followed by transcript text blocks', () => {
    const payload = `00:00:48
If you live in the Northeastern U.S. then you may know someone who has had Lyme disease.

00:01:04
But it's spreading all over the country and parts of the world.

00:01:25
Learn all about this tick-borne disease in this classic episode.`

    const result = parseRemoteTranscriptContent(
      'https://api.omny.fm/transcript?format=TextWithTimestamps',
      payload
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.cues).toHaveLength(3)
      expect(result.cues[0]).toMatchObject({
        start: 48,
        text: 'If you live in the Northeastern U.S. then you may know someone who has had Lyme disease.',
      })
      expect(result.cues[1]).toMatchObject({
        start: 64,
        text: "But it's spreading all over the country and parts of the world.",
      })
      expect(result.cues[2]).toMatchObject({
        start: 85,
        text: 'Learn all about this tick-borne disease in this classic episode.',
      })
      expect(result.cues[0].end).toBe(64)
      expect(result.cues[1].end).toBe(85)
    }
  })

  it('fails gracefully for malformed/unsupported payloads', () => {
    const malformedJson = parseRemoteTranscriptContent('https://example.com/a.json', '{"x":')
    expect(malformedJson.ok).toBe(false)

    const unsupported = parseRemoteTranscriptContent(
      'https://example.com/a.txt',
      'plain text without timing cues'
    )
    expect(unsupported.ok).toBe(false)
  })
})
