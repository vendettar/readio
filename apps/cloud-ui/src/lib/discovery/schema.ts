import { z } from 'zod'

/**
 * DiscoveryPodcast type for cloud-ui (PodcastIndex format - used for Top Charts)
 */
export const DiscoveryPodcastSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  author: z.string().optional(),
  image: z.string().url().optional(),
  artwork: z.string().url().optional(),
  url: z.string().min(1),
  audioUrl: z.string().url().optional(),
  genres: z
    .array(
      z.object({
        genreId: z.string().min(1),
        name: z.string().min(1),
        url: z.string().optional(),
      })
    )
    .optional(),
  description: z.string().optional(),
  releaseDate: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  feedUrl: z.string().optional(),
  podcastItunesId: z.string().optional(),
  providerEpisodeId: z.string().optional(),
  feedId: z.string().min(1).optional(),
  podcastGuid: z.string().min(1).optional(),
  episodeGuid: z.string().min(1).optional(),
  episodeCount: z.number().int().nonnegative().optional(),
  language: z.string().min(1).optional(),
  link: z.string().optional(),
})

/**
 * Podcast type for cloud-ui (PodcastIndex format)
 */
export const PodcastSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  author: z.string().optional(),
  image: z.string().url().optional(),
  artwork: z.string().url().optional(),
  feedUrl: z.string().optional(),
  description: z.string().optional(),
  podcastItunesId: z.string().optional(),
  feedId: z.string().min(1).optional(),
  podcastGuid: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  episodeCount: z.number().int().nonnegative().optional(),
  genres: z
    .array(
      z.object({
        genreId: z.string().min(1),
        name: z.string().min(1),
        url: z.string().optional(),
      })
    )
    .optional(),
  collectionViewUrl: z.string().url().optional(),
})

/**
 * Episode result from PodcastIndex Search API
 */
export const SearchEpisodeSchema = z.object({
  id: z.string().min(1),
  podcastItunesId: z.coerce.string().optional(),
  title: z.string().min(1),
  author: z.string().optional(),
  podcastTitle: z.string().optional(),
  image: z.string().url().optional(),
  artwork: z.string().url().optional(),
  feedUrl: z.string().url().optional(),
  episodeUrl: z.string().url(),
  releaseDate: z.string().datetime().optional(),
  trackTimeMillis: z.number().int().optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  episodeGuid: z.string().optional(),
  providerEpisodeId: z.coerce.string().optional(),
})

/**
 * Episode type for cloud-ui (parsed from RSS feed)
 */
export const EpisodeSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  descriptionHtml: z.string().optional(),
  audioUrl: z.string().url(),
  pubDate: z.string().min(1),
  artworkUrl: z.string().url().optional(),
  duration: z.number().nonnegative().optional(),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumber: z.number().int().nonnegative().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  explicit: z.boolean().optional(),
  link: z.string().url().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  transcriptUrl: z.string().url().optional(),
  chaptersUrl: z.string().url().optional(),
  providerEpisodeId: z.string().optional(),
  feedUrl: z.string().optional(),
  feedId: z.string().min(1).optional(),
  podcastGuid: z.string().min(1).optional(),
  podcastItunesId: z.string().optional(),
  episodeGuid: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  author: z.string().optional(),
  image: z.string().url().optional(),
  artwork: z.string().url().optional(),
})

/**
 * Parsed RSS Feed result
 */
export const ParsedFeedSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  artworkUrl: z.string().url().optional(),
  episodes: z.array(EpisodeSchema),
})

export type DiscoveryPodcast = z.infer<typeof DiscoveryPodcastSchema>
export type Podcast = z.infer<typeof PodcastSchema>
export type SearchEpisode = z.infer<typeof SearchEpisodeSchema>
export type Episode = z.infer<typeof EpisodeSchema>
export type ParsedFeed = z.infer<typeof ParsedFeedSchema>
