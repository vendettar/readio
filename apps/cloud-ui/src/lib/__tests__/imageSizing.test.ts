import { describe, expect, it } from 'vitest'
import { getDiscoveryArtworkUrl } from '../imageUtils'

describe('getDiscoveryArtworkUrl Sizing Logic', () => {
  it('correctly replaces Apple artwork size with requested size', () => {
    const originalUrl =
      'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/100x100bb.jpg'
    const result = getDiscoveryArtworkUrl(originalUrl, 200)
    expect(result).toContain('200x200bb')
    expect(result).not.toContain('100x100bb')
  })

  it('handles other sizes like 600', () => {
    const originalUrl =
      'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/100x100bb.jpg'
    const result = getDiscoveryArtworkUrl(originalUrl, 600)
    expect(result).toContain('600x600bb')
  })

  it('keeps as-is for non-matching URLs', () => {
    const originalUrl = 'https://example.com/podcast.jpg'
    const result = getDiscoveryArtworkUrl(originalUrl, 200)
    expect(result).toBe(originalUrl)
  })

  it('keeps as-is for non-Apple URLs even when they contain NxNbb pattern', () => {
    const originalUrl = 'https://cdn.example.com/assets/100x100bb.jpg'
    const result = getDiscoveryArtworkUrl(originalUrl, 600)
    expect(result).toBe(originalUrl)
  })

  it('returns fallback for empty url', () => {
    const result = getDiscoveryArtworkUrl('')
    expect(result).toContain('placeholder-podcast.svg')
  })
})
