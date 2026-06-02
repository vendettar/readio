import { z } from 'zod'

const HttpUrlSchema = z.string().refine(
  (value) => {
    try {
      const parsed = new URL(value)
      return parsed.protocol === 'http:' || parsed.protocol === 'https:'
    } catch {
      return false
    }
  },
  { message: 'Invalid HTTP/HTTPS URL' }
)

const OptionalHttpUrlSchema = HttpUrlSchema.optional()

const NonNegativeIntegerSchema = z.number().int().nonnegative()
const PositiveIntegerSchema = z.number().int().positive()

/**
 * Shared podcast fields across PI detail and editor-pick snapshot contracts.
 * Identity: podcastItunesId
 */
const PIBasePodcastSchema = z.object({
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: HttpUrlSchema,
  description: z.string().min(1),
  lastUpdateTime: z.number().int().nonnegative(),
  podcastItunesId: z.string().min(1),
  episodeCount: z.number().int().nonnegative(),
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
 * Source: Apple charts feed API
 */
export const TopPodcastSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: HttpUrlSchema,
  genres: z.array(z.string()),
})

/**
 * Top Episode type (narrow DTO for Explore Top Episodes surface)
 * Identity: title + podcastItunesId
 * Source: Apple charts feed API
 */
export const TopEpisodeSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  author: z.string().min(1),
  artwork: HttpUrlSchema,
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
  artwork: HttpUrlSchema,
  releaseDate: z.string().min(1),
  episodeCount: z.number().int().nonnegative(),
  genres: z.array(z.string()),
})

/**
 * Search-specific episode DTO (Apple search contract)
 * Identity: podcastItunesId + guid
 */
export const SearchEpisodeSchema = z.object({
  podcastItunesId: z.string().min(1),
  title: z.string().min(1),
  showTitle: z.string().min(1),
  artwork: HttpUrlSchema,
  audioUrl: HttpUrlSchema,
  guid: z.string().min(1),
  releaseDate: z.string().min(1),
  trackTimeMillis: z.number().int().optional(),
  shortDescription: z.string().min(1),
})

/**
 * Canonical page-rendering episode contract owned by PodcastIndex episodes/byitunesid.
 */
export const PIEpisodeSchema = z.object({
  guid: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  audioUrl: HttpUrlSchema,
  pubDate: NonNegativeIntegerSchema,
  artworkUrl: HttpUrlSchema.or(z.literal('')),
  fileSize: NonNegativeIntegerSchema,
  duration: NonNegativeIntegerSchema,
  seasonNumber: NonNegativeIntegerSchema.optional(),
  episodeNumber: NonNegativeIntegerSchema.optional(),
  episodeType: z.enum(['full', 'trailer', 'bonus']).optional(),
  explicit: z.boolean(),
  link: OptionalHttpUrlSchema,
  transcriptUrl: OptionalHttpUrlSchema,
})

export const PodcastEpisodesSchema = z.object({
  episodes: z.array(PIEpisodeSchema),
  limit: PositiveIntegerSchema,
  offset: NonNegativeIntegerSchema,
  nextOffset: NonNegativeIntegerSchema,
  hasMore: z.boolean(),
  storedTotal: NonNegativeIntegerSchema,
  isTruncated: z.boolean(),
  lastSuccessfulFetchAt: NonNegativeIntegerSchema.optional(),
  nextRefreshAfter: NonNegativeIntegerSchema.optional(),
})

export type TopPodcast = z.infer<typeof TopPodcastSchema>
export type EditorPickPodcast = z.infer<typeof EditorPickPodcastSchema>
export type TopEpisode = z.infer<typeof TopEpisodeSchema>
export type Podcast = z.infer<typeof PIPodcastSchema>
export type SearchPodcast = z.infer<typeof SearchPodcastSchema>
export type SearchEpisode = z.infer<typeof SearchEpisodeSchema>
export type Episode = z.infer<typeof PIEpisodeSchema>
export type PodcastEpisodes = z.infer<typeof PodcastEpisodesSchema>

/**
 * Narrow adapter type for favorites/add operations.
 * Accepts any episode-like object with the minimum required fields.
 * This is a loose type for internal bridge code, not a strict schema.
 */
