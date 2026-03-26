import { describe, expect, it } from 'vitest'
import { resolveAsrIdentityUrl } from '../remoteTranscript'

describe('remoteTranscript resolveAsrIdentityUrl logic', () => {
  it('prefers originalAudioUrl as identity when provided (downloaded/podcast playback)', () => {
    const originalUrl = 'https://example.com/podcast.mp3'
    const blobUrl = 'blob:http://localhost:3000/uuid'
    const metadata = {
      originalAudioUrl: originalUrl,
    } as Parameters<typeof resolveAsrIdentityUrl>[1]

    expect(resolveAsrIdentityUrl(blobUrl, metadata)).toBe(originalUrl)
  })

  it('falls back to audioUrl when no originalAudioUrl is present (local file upload)', () => {
    const fileUrl = 'blob:http://localhost:3000/local-file'
    expect(resolveAsrIdentityUrl(fileUrl, null)).toBe(fileUrl)
  })

  it('handles empty inputs gracefully', () => {
    expect(resolveAsrIdentityUrl(null, null)).toBe('')
    expect(resolveAsrIdentityUrl('', null)).toBe('')
  })
})
