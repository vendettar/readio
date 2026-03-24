import { describe, expect, it } from 'vitest'
import {
  deriveRemoteTranscriptCacheId,
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
