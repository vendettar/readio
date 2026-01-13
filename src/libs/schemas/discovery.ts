import { z } from 'zod'

/**
 * Common Podcast type used for Top Charts and internal references
 */
export const DiscoveryPodcastSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  artistName: z.string().optional(),
  artworkUrl100: z.string().url().optional(),
  url: z.string().min(1), // Can be a relative path or full URL
  genres: z.array(
    z.object({
      genreId: z.string().min(1),
      name: z.string().min(1),
      url: z.string().optional(),
    })
  ),
  description: z.string().optional(),
  releaseDate: z.string().optional(),
  duration: z.number().nonnegative().optional(),
  feedUrl: z.string().url().optional(),
})

/**
 * Extended Podcast type returned by iTunes Search API
 */
export const PodcastSchema = z.object({
  collectionId: z.number().int().positive(),
  collectionName: z.string().min(1),
  artistName: z.string().optional(),
  artworkUrl100: z.string().url().optional(),
  artworkUrl600: z.string().url().optional(),
  feedUrl: z.string().url().optional(),
  collectionViewUrl: z.string().url().optional(),
  genres: z.array(z.string().min(1)),
  artistId: z.number().int().positive().optional(),
  primaryGenreName: z.string().optional(),
  trackCount: z.number().int().nonnegative().optional(),
})

/**
 * Episode result from iTunes Search API (entity=podcastEpisode)
 */
export const SearchEpisodeSchema = z.object({
  trackId: z.number().int().positive(),
  trackName: z.string().min(1),
  collectionId: z.number().int().positive(),
  collectionName: z.string().min(1),
  artistName: z.string().optional(),
  artworkUrl100: z.string().url().optional(),
  artworkUrl600: z.string().url().optional(),
  episodeUrl: z.string().url(),
  episodeGuid: z.string().optional(),
  releaseDate: z.string().min(1),
  trackTimeMillis: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  shortDescription: z.string().optional(),
  feedUrl: z.string().url().optional(),
})

/**
 * Final Episode format for internal use (from RSS or mapping)
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
  seasonNumber: z.number().int().positive().optional(),
  episodeNumber: z.number().int().positive().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  explicit: z.boolean().optional(),
  link: z.string().url().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  transcriptUrl: z.string().url().optional(),
  chaptersUrl: z.string().url().optional(),
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
