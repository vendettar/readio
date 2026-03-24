import discovery, { type DiscoveryPodcast } from '../discovery'
import type { RecommendedPodcast } from './types'

// Mapper function
function mapToRecommended(p: DiscoveryPodcast): RecommendedPodcast {
  return {
    id: p.id || '',
    title: p.name || '',
    author: p.artistName || '',
    artworkUrl: p.artworkUrl100 || '', // DiscoveryPodcast usually has 100
    feedUrl: p.feedUrl || '',
    genreNames: p.genres ? p.genres.map((g) => g.name) : [],
  }
}

export async function fetchDiscoveryChartIds(
  country: string,
  limit: number = 50,
  signal?: AbortSignal
): Promise<string[]> {
  // Use discovery provider to get top podcasts and extract IDs
  const podcasts = await discovery.fetchTopPodcasts(country, limit, signal)
  return podcasts.map((p: DiscoveryPodcast) => p.id).filter((id): id is string => !!id)
}

export async function lookupPodcastsByIds(
  ids: string[],
  country: string,
  signal?: AbortSignal
): Promise<RecommendedPodcast[]> {
  if (ids.length === 0) return []
  const podcasts = await discovery.lookupPodcastsByIds(ids, country, signal)
  return podcasts.map(mapToRecommended)
}

export async function fetchTopPodcastsFromSource(
  country: string,
  limit: number = 50,
  signal?: AbortSignal
): Promise<RecommendedPodcast[]> {
  // Optimization: fetchTopPodcasts directly returns objects, no need for two-step ID+Lookup
  const podcasts = await discovery.fetchTopPodcasts(country, limit, signal)
  return podcasts.map(mapToRecommended)
}
