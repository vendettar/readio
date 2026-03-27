export const AUDIO_CACHE_NAME = 'readio-audio-v2'
export const API_CACHE_NAME = 'readio-api-v1'

const AUDIO_PATH_PATTERN = /\.(?:mp3|m4a|aac|ogg|wav)$/i

export function isAudioRequest({ url }: { url: URL }) {
  return url.protocol.startsWith('http') && AUDIO_PATH_PATTERN.test(url.pathname)
}

export function isDiscoveryApiRequest({ url }: { url: URL }) {
  if (!url.protocol.startsWith('http')) return false
  if (AUDIO_PATH_PATTERN.test(url.pathname)) return false

  return (
    url.hostname === 'itunes.apple.com' ||
    url.hostname === 'podcasts.apple.com' ||
    url.pathname.endsWith('.xml')
  )
}

export const AUDIO_RUNTIME_CACHING = {
  urlPattern: isAudioRequest,
  handler: 'StaleWhileRevalidate' as const,
  options: {
    cacheName: AUDIO_CACHE_NAME,
    expiration: {
      maxEntries: 50,
      maxAgeSeconds: 60 * 60 * 24 * 7,
    },
    cacheableResponse: {
      statuses: [200, 206],
    },
    rangeRequests: true,
  },
}

export const API_RUNTIME_CACHING = {
  urlPattern: isDiscoveryApiRequest,
  handler: 'NetworkFirst' as const,
  options: {
    cacheName: API_CACHE_NAME,
    networkTimeoutSeconds: 5,
    expiration: {
      maxEntries: 80,
      maxAgeSeconds: 60 * 60 * 24,
    },
    cacheableResponse: {
      statuses: [200],
    },
  },
}
