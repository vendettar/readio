import {
  fetchPodcastEpisodeDetail as fetchCloudPodcastEpisodeDetail,
  fetchPodcastEpisodes as fetchCloudPodcastEpisodes,
  fetchTopEpisodes as fetchCloudTopEpisodes,
  fetchTopPodcasts as fetchCloudTopPodcasts,
  getPodcastIndexPodcastByItunesId as getCloudPodcastIndexPodcastByItunesId,
  getPodcastIndexPodcastsBatchByGuid as getCloudPodcastIndexPodcastsBatchByGuid,
  searchEpisodes as searchCloudEpisodes,
  searchPodcasts as searchCloudPodcasts,
} from './cloudApi'
import type {
  EditorPickPodcast,
  Episode,
  Podcast,
  PodcastEpisodes,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
} from './schema'

const discovery = {
  // Search (Apple first-hop via cloud relay)
  searchPodcasts: (query: string, country = 'us', signal?: AbortSignal) => {
    return searchCloudPodcasts(query, country, signal)
  },

  searchEpisodes: (query: string, country = 'us', signal?: AbortSignal) => {
    return searchCloudEpisodes(query, country, signal)
  },

  // Canonical podcast detail / lookup
  getPodcastIndexPodcastByItunesId: (podcastItunesId: string, signal?: AbortSignal) => {
    return getCloudPodcastIndexPodcastByItunesId(podcastItunesId, signal)
  },

  getPodcastIndexPodcastsBatchByGuid: (guids: string[], signal?: AbortSignal) => {
    return getCloudPodcastIndexPodcastsBatchByGuid(guids, signal)
  },

  fetchPodcastEpisodes: (
    podcastItunesId: string,
    options?: { signal?: AbortSignal; limit?: number; offset?: number }
  ) => {
    return fetchCloudPodcastEpisodes(podcastItunesId, options)
  },

  fetchPodcastEpisodeDetail: (
    podcastItunesId: string,
    episodeGuid: string,
    signal?: AbortSignal
  ) => {
    return fetchCloudPodcastEpisodeDetail(podcastItunesId, episodeGuid, signal)
  },

  // Top charts (Apple first-hop via cloud relay)
  fetchTopPodcasts: (country = 'us', signal?: AbortSignal) => {
    return fetchCloudTopPodcasts(country, signal)
  },

  fetchTopEpisodes: (country = 'us', signal?: AbortSignal) => {
    return fetchCloudTopEpisodes(country, signal)
  },
}

export default discovery

// Re-export types for consumers
export type {
  Episode,
  EditorPickPodcast,
  PodcastEpisodes,
  Podcast,
  SearchEpisode,
  SearchPodcast,
  TopEpisode,
  TopPodcast,
}
