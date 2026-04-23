import { z } from 'zod'

/**
 * Shared podcast fields across PI detail and editor-pick snapshot contracts.
 * Identity: podcastItunesId
 */
const PIBasePodcastSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: z.url(),
  description: z.string().min(1),
  feedUrl: z.string().min(1),
  lastUpdateTime: z.number().int().nonnegative().optional(),
  podcastItunesId: z.string().min(1),
  episodeCount: z.number().int().nonnegative().optional(),
  language: z.string().min(1).optional(),
  genres: z.array(z.string()),
})

/**
 * Editor's Pick Podcast type (narrow DTO for Explore Editor's Picks surface)
 * Identity: podcastItunesId
 * Source: PI batch-byguid endpoint
 */
export const EditorPickPodcastSchema = PIBasePodcastSchema

/**
 * Top Podcast type (narrow DTO for Explore Top Shows surface)
 * Identity: podcastItunesId
 * Source: Apple RSS feed
 */
export const TopPodcastSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: z.url().min(1),
  genres: z.array(z.string()),
})

/**
 * Top Episode type (narrow DTO for Explore Top Episodes surface)
 * Identity: title + podcastItunesId
 * Source: Apple RSS feed
 */
export const TopEpisodeSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: z.url().min(1),
  genres: z.array(z.string()),
})

/**
 * Podcast type for PI podcast-byitunesid detail (canonical cover: artwork)
 * Identity: podcastItunesId
 */
export const PIPodcastSchema = PIBasePodcastSchema

/**
 * Search-specific podcast DTO (Apple search contract)
 * Identity: podcastItunesId (iTunes ID from Apple)
 * Source: Apple Search API
 */
export const SearchPodcastSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: z.url().min(1),
  releaseDate: z.string().optional(),
  episodeCount: z.number().int().nonnegative(),
  genres: z.array(z.string()),
})

/**
 * Search-specific episode DTO (Apple search contract)
 * Identity: episodeUrl
 */
export const SearchEpisodeSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  showTitle: z.string().min(1),
  artwork: z.url(),
  episodeUrl: z.url(),
  episodeGuid: z.string().min(1),
  releaseDate: z.string().min(1).optional(),
  trackTimeMillis: z.number().int().optional(),
  shortDescription: z.string().min(1).optional(),
})

/**
 * Canonical episode contract from RSS feed.
 */
export const FeedEpisodeSchema = z.object({
  episodeGuid: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  descriptionHtml: z.string().optional(),
  audioUrl: z.url(),
  pubDate: z.string().min(1),
  artworkUrl: z.url().optional(),
  duration: z.number().nonnegative().optional(),
  seasonNumber: z.number().int().nonnegative().optional(),
  episodeNumber: z.number().int().nonnegative().optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  explicit: z.boolean().optional(),
  link: z.url().optional(),
  fileSize: z.number().int().nonnegative().optional(),
  transcriptUrl: z.url().optional(),
})

/**
 * Canonical parsed feed payload returned by cloud discovery.
 */
export const ParsedFeedSchema = z.object({
  title: z.string().min(1),
  description: z.string(),
  artworkUrl: z.url().optional(),
  episodes: z.array(FeedEpisodeSchema),
})

export type TopPodcast = z.infer<typeof TopPodcastSchema>
export type EditorPickPodcast = z.infer<typeof EditorPickPodcastSchema>
export type TopEpisode = z.infer<typeof TopEpisodeSchema>
export type Podcast = z.infer<typeof PIPodcastSchema>
export type SearchPodcast = z.infer<typeof SearchPodcastSchema>
export type SearchEpisode = z.infer<typeof SearchEpisodeSchema>
export type FeedEpisode = z.infer<typeof FeedEpisodeSchema>
export type ParsedFeed = z.infer<typeof ParsedFeedSchema>

/**
 * Narrow adapter type for favorites/add operations.
 * Accepts any episode-like object with the minimum required fields.
 * This is a loose type for internal bridge code, not a strict schema.
 */
export interface FavoriteEpisodeInput {
  title?: string
  audioUrl?: string
  description?: string
  artworkUrl?: string
  duration?: number
  pubDate?: string
  episodeGuid?: string
  transcriptUrl?: string
}

/**
 * Narrow internal adapter type for non-canonical contexts
 * where we only have partial podcast metadata from downloads/history.
 */
export interface PlaybackPodcastStub {
  podcastItunesId: string
  title: string
  author: string
  artwork: string
  feedUrl: string
}

/**
 * Narrow internal adapter type for non-canonical episode contexts
 * from local track/session data.
 */
export interface PlaybackEpisodeStub {
  episodeGuid: string
  title: string
  audioUrl: string
  description?: string
  artworkUrl?: string
  duration: number
  pubDate: string
  transcriptUrl?: string
}
