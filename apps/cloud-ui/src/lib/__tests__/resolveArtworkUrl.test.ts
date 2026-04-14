import { describe, expect, it } from 'vitest'
import { resolveArtworkUrl } from '../imageUtils'

describe('resolveArtworkUrl Regression', () => {
  it('correctly uses size mapping when imageSize is NOT provided', () => {
    const appleUrl = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/100x100bb.jpg'

    // md -> 160
    expect(resolveArtworkUrl(appleUrl, 'md')).toContain('160x160bb')
    // sm -> 100
    expect(resolveArtworkUrl(appleUrl, 'sm')).toContain('100x100bb')
    // lg -> 200
    expect(resolveArtworkUrl(appleUrl, 'lg')).toContain('200x200bb')
    // xl -> 200
    expect(resolveArtworkUrl(appleUrl, 'xl')).toContain('200x200bb')
  })

  it('honors overrideImageSize over size mapping', () => {
    const appleUrl = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/200x200bb.jpg'

    // size=sm would be 100, but we override with 400
    const result = resolveArtworkUrl(appleUrl, 'sm', 400)
    expect(result).toContain('400x400bb')
    expect(result).not.toContain('100x100bb')
  })

  it('handles already sized URLs by re-normalizing them (Option B requirement)', () => {
    // If we have a 600px URL but we want 160px (md)
    const bulkyUrl = 'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/600x600bb.jpg'
    const result = resolveArtworkUrl(bulkyUrl, 'md')
    expect(result).toContain('160x160bb')
    expect(result).not.toContain('600x600bb')
  })

  it('does not upscale 600 artwork in original mode', () => {
    const sixHundredUrl =
      'https://is1-ssl.mzstatic.com/image/thumb/Podcasts/v4/df/12/34/600x600bb.jpg'
    const result = resolveArtworkUrl(sixHundredUrl, 'original')
    expect(result).toContain('600x600bb')
    expect(result).not.toContain('800x800bb')
  })
})
