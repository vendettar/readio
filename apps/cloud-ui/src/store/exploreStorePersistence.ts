import { buildFavoriteKey } from '../lib/db/favoriteIdentity'
import type { FavoriteEpisodeInput, FavoritePodcastInput } from '../lib/db/types'
import type { Favorite, Subscription } from '../lib/dexieDb'
import type { Podcast } from '../lib/discovery'
import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import { normalizeCountryParam } from '../lib/routes/podcastRoutes'
import { toast } from '../lib/toast'
import type { TranslationKey } from '../lib/translations'

function normalizeRequiredField(
  value: string | null | undefined,
  entityName: 'favorite' | 'subscription',
  fieldName: string
): string | null {
  if (typeof value !== 'string') {
    warn(`[ExploreStore] Rejecting ${entityName} persistence: missing ${fieldName}`)
    return null
  }
  const normalized = value.trim()
  if (!normalized) {
    warn(`[ExploreStore] Rejecting ${entityName} persistence: missing ${fieldName}`)
    return null
  }
  return normalized
}

function normalizeOptionalFavoriteField(value: string | null | undefined): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim()
  return normalized || ''
}

export function handleExploreDbWriteError(
  operation: string,
  toastKey: TranslationKey,
  error: unknown
): void {
  if (!isAbortLikeError(error)) {
    warn(`[ExploreStore] Failed to ${operation}:`, error)
  }
  toast.errorKey(toastKey)
}

export function normalizeCountryAtSaveForExplore(
  countryAtSave: string,
  operation: 'favorite persistence' | 'subscription persistence'
): string | null {
  const normalizedCountryAtSave = normalizeCountryParam(countryAtSave)
  if (!normalizedCountryAtSave) {
    warn(`[ExploreStore] Rejecting ${operation}: missing countryAtSave`)
    return null
  }
  return normalizedCountryAtSave
}

export function buildSubscriptionPersistenceInput(
  podcast: Podcast,
  countryAtSave: string
): Omit<Subscription, 'id'> | null {
  const podcastItunesId =
    typeof podcast.podcastItunesId === 'string' && podcast.podcastItunesId.trim() !== '0'
      ? podcast.podcastItunesId.trim()
      : ''
  const title = normalizeRequiredField(podcast.title, 'subscription', 'title')
  const author = normalizeRequiredField(podcast.author, 'subscription', 'author')
  const artworkUrl = normalizeRequiredField(podcast.artwork, 'subscription', 'artworkUrl')
  if (!podcastItunesId || !title || !author || !artworkUrl) {
    warn('[ExploreStore] Rejecting subscription persistence: missing canonical subscription data')
    return null
  }

  return {
    podcastItunesId,
    title,
    author,
    artworkUrl,
    addedAt: Date.now(),
    countryAtSave,
  }
}

export function buildFavoritePersistenceInput(
  podcast: FavoritePodcastInput,
  episode: FavoriteEpisodeInput,
  countryAtSave: string
): Omit<Favorite, 'id'> | null {
  const podcastItunesId = normalizeRequiredField(
    podcast.podcastItunesId === '0' ? '' : podcast.podcastItunesId,
    'favorite',
    'podcastItunesId'
  )
  const episodeGuid = normalizeRequiredField(episode.episodeGuid, 'favorite', 'episodeGuid')
  const podcastTitle = normalizeRequiredField(podcast.title, 'favorite', 'podcast title')
  const podcastArtwork = normalizeRequiredField(podcast.artwork, 'favorite', 'podcast artwork')
  const episodeTitle = normalizeRequiredField(episode.title, 'favorite', 'episode title')
  const audioUrl = normalizeRequiredField(episode.audioUrl, 'favorite', 'episode audioUrl')
  if (
    !podcastItunesId ||
    !episodeGuid ||
    !podcastTitle ||
    !podcastArtwork ||
    !episodeTitle ||
    !audioUrl
  ) {
    warn('[ExploreStore] Rejecting favorite persistence: missing canonical favorite identity')
    return null
  }

  const key = buildFavoriteKey(podcastItunesId, episodeGuid)
  if (!key) {
    warn('[ExploreStore] Rejecting favorite persistence: missing canonical favorite identity')
    return null
  }

  return {
    key,
    podcastTitle,
    episodeTitle,
    pubDate: episode.pubDate,
    audioUrl,
    durationSeconds: episode.duration,
    artworkUrl: podcastArtwork,
    addedAt: Date.now(),
    episodeArtworkUrl: normalizeOptionalFavoriteField(episode.artworkUrl) || podcastArtwork,
    description: episode.description,
    episodeGuid,
    podcastItunesId,
    transcriptUrl: episode.transcriptUrl,
    countryAtSave,
  }
}
