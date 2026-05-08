import type { Favorite } from './types'

interface FavoriteIdentityInput {
  podcastItunesId: string
  episodeGuid: string
}

function normalizePodcastItunesId(value: string): string | null {
  const normalized = value.trim()
  if (!normalized || normalized === '0') return null
  return normalized
}

function normalizeEpisodeGuid(value: string): string | null {
  const normalized = value.trim()
  return normalized ? normalized : null
}

export function buildFavoriteKey(podcastItunesId: string, episodeGuid: string): string | null {
  const normalizedPodcastItunesId = normalizePodcastItunesId(podcastItunesId)
  const normalizedEpisodeGuid = normalizeEpisodeGuid(episodeGuid)
  if (!normalizedPodcastItunesId || !normalizedEpisodeGuid) return null
  return `${normalizedPodcastItunesId}::${normalizedEpisodeGuid}`
}

export function buildFavoriteKeyFromFavorite(
  favorite: Pick<Favorite, 'podcastItunesId' | 'episodeGuid'>
): string | null {
  return buildFavoriteKey(favorite.podcastItunesId, favorite.episodeGuid)
}

export function favoriteMatchesIdentity(
  favorite: Favorite,
  identity: FavoriteIdentityInput
): boolean {
  const favoriteKey = buildFavoriteKeyFromFavorite(favorite)
  const inputKey = buildFavoriteKey(identity.podcastItunesId, identity.episodeGuid)
  return favoriteKey === inputKey
}
