// src/lib/imageUtils.ts
/**
 * Utility for handling image asset transformations
 */

import { getAppConfig } from './runtimeConfig'

/**
 * Fallback image for podcasts/episodes
 */
export function getFallbackPodcastImage(): string {
  return getAppConfig().FALLBACK_PODCAST_IMAGE
}

/**
 * Normalizes discovery provider artwork URLs to requested size
 * @param url Original artwork URL (e.g. .../100x100bb.jpg)
 * @param size Target size (e.g. 200, 600)
 * @returns Resized URL string, or fallback image if url is empty
 */
export function getDiscoveryArtworkUrl(url: string | undefined, size: number = 600): string {
  if (!url) return getFallbackPodcastImage()

  // Only apply size replacement to Apple artwork URLs.
  // Example: https://is1-ssl.mzstatic.com/.../100x100bb.jpg
  let isAppleArtwork = false
  try {
    const parsed = new URL(url)
    isAppleArtwork = parsed.hostname.includes('mzstatic.com')
  } catch {
    isAppleArtwork = false
  }

  if (!isAppleArtwork) {
    return url
  }

  const applePattern = /\d+x\d+bb\.(jpg|png|jpeg)/
  if (applePattern.test(url)) {
    const sizeString = `${size}x${size}bb`
    return url.replace(/\d+x\d+bb/, sizeString)
  }

  // For non-Apple artwork URLs (like RSS feed images), return as-is
  return url
}

/**
 * Standardized mapping from UI size variants to pixel sizes for Apple Artwork
 */
export const RESOLVED_ARTWORK_SIZES = {
  sm: 100,
  md: 160,
  lg: 200,
  xl: 200,
  // Keep detail artwork at 600 to avoid upscaling 600x600 Apple URLs to 800x800,
  // which can return 404 for some catalogs and cause post-transition blank covers.
  original: 600,
} as const

/**
 * Normalizes artwork URLs with deterministic sizing
 */
export function resolveArtworkUrl(
  url: string | undefined,
  size: keyof typeof RESOLVED_ARTWORK_SIZES = 'md',
  overrideImageSize?: number
): string {
  const pixelSize = overrideImageSize ?? RESOLVED_ARTWORK_SIZES[size]
  return getDiscoveryArtworkUrl(url, pixelSize)
}
