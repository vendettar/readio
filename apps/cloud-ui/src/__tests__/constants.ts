export const TEST_ORIGIN = 'http://localhost:3000'

export const DISCOVERY_TEST_ROUTE = {
  topPodcasts: '/api/v1/discovery/top-podcasts',
  topEpisodes: '/api/v1/discovery/top-episodes',
  searchPodcasts: '/api/v1/discovery/search/podcasts',
  searchEpisodes: '/api/v1/discovery/search/episodes',
  feed: '/api/v1/discovery/feed',
  podcastsBatch: '/api/v1/discovery/podcasts/batch',
  podcastByItunesId: (id: string) => `/api/v1/discovery/podcasts/${encodeURIComponent(id)}`,
} as const

export function discoveryUrl(pathname: string): string {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${TEST_ORIGIN}${normalizedPath}`
}
