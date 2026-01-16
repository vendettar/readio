// src/libs/imageUtils.ts
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

  // Only apply size replacement to Apple artwork URLs (contain NxNbb pattern)
  // Example: https://is1-ssl.mzstatic.com/.../100x100bb.jpg
  const applePattern = /\d+x\d+bb\.(jpg|png|jpeg)/
  if (applePattern.test(url)) {
    const sizeString = `${size}x${size}bb`
    return url.replace(/\d+x\d+bb/, sizeString)
  }

  // For non-Apple artwork URLs (like RSS feed images), return as-is
  return url
}
