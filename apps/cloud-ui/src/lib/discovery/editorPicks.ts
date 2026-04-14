import type { QueryClient } from '@tanstack/react-query'
import { compactKeyToUUID, uuidToCompactKey } from '../routes/compactKey'
import type { DiscoveryPodcast, Episode, Podcast } from './providers/types'

export type EditorPickRouteState = {
  editorPickSnapshot: DiscoveryPodcast
} & Record<string, unknown>

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

export function getEditorPickRouteState(state: unknown): EditorPickRouteState | null {
  if (!state || typeof state !== 'object') return null
  const snapshot = (state as { editorPickSnapshot?: unknown }).editorPickSnapshot
  if (!snapshot || typeof snapshot !== 'object') return null
  const id = (snapshot as { id?: unknown }).id
  if (typeof id !== 'string' || id.trim().length === 0) return null
  return state as EditorPickRouteState
}

export function matchesEditorPickRouteID(
  snapshot: DiscoveryPodcast | null | undefined,
  routeID: string | null | undefined
): boolean {
  const normalizedRouteID = normalizeOptionalString(routeID)
  if (!snapshot || !normalizedRouteID) return false

  return (
    normalizeOptionalString(
      snapshot.podcastItunesId ? String(snapshot.podcastItunesId) : undefined
    ) === normalizedRouteID
  )
}

export type PodcastWithEditorPickSnapshot = Podcast & {
  id?: string
  editorPickSnapshot?: DiscoveryPodcast
}

export function buildEditorPicksQueryKey(country: string | null | undefined) {
  return ['editorPicks', country ?? ''] as const
}

export function buildEditorPickSnapshotQueryKey(
  country: string | null | undefined,
  guid: string | null | undefined
) {
  return ['editorPickSnapshot', country ?? '', guid ?? ''] as const
}

function parsePodcastItunesId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed && trimmed !== '0' ? trimmed : undefined
}


export function mapEditorPickToPodcast(item: DiscoveryPodcast): Podcast {
  return {
    ...item,
    podcastItunesId: parsePodcastItunesId(item.podcastItunesId),
    editorPickSnapshot: item,
  } as Podcast
}

export function buildEditorPickSnapshotFromPodcast(
  podcast: Podcast | null | undefined
): DiscoveryPodcast | undefined {
  if (!podcast) return undefined

  const podcastGuid = normalizeOptionalString(podcast.podcastGuid)
  if (!podcastGuid) return undefined

  return {
    id: podcastGuid,
    title: podcast.title || '',
    author: podcast.author,
    image: podcast.image || podcast.artwork,
    url: podcast.collectionViewUrl || podcast.feedUrl || '',
    genres: (podcast.genres ?? []).map((genre) => ({
      genreId: genre.genreId || '',
      name: genre.name,
    })),
    description: '',
    feedUrl: podcast.feedUrl,
    podcastItunesId: normalizeOptionalString(podcast.podcastItunesId),
    feedId: normalizeOptionalString(podcast.feedId),
    podcastGuid,
  }
}

export function getEditorPickSnapshotFromPodcast(
  podcast: Podcast | null | undefined
): DiscoveryPodcast | undefined {
  return (podcast as PodcastWithEditorPickSnapshot | null | undefined)?.editorPickSnapshot
}

export function getEditorPickGuidFromPodcast(
  podcast: Podcast | null | undefined
): string | undefined {
  const snapshotPodcast = podcast as PodcastWithEditorPickSnapshot | null | undefined
  const candidate = snapshotPodcast?.editorPickSnapshot?.podcastGuid || snapshotPodcast?.id
  return typeof candidate === 'string' ? normalizeOptionalString(candidate) : undefined
}

export function getEditorPickFeedIDFromPodcast(
  podcast: Podcast | null | undefined
): string | undefined {
  const snapshot = getEditorPickSnapshotFromPodcast(podcast)
  const candidate = podcast?.feedId || snapshot?.feedId
  return typeof candidate === 'string' ? normalizeOptionalString(candidate) : undefined
}

export function getEditorPickItunesIDFromPodcast(
  podcast: Podcast | null | undefined
): string | undefined {
  const snapshot = getEditorPickSnapshotFromPodcast(podcast)
  const candidate = podcast?.podcastItunesId || snapshot?.podcastItunesId
  return typeof candidate === 'string' ? normalizeOptionalString(candidate) : undefined
}

export function getCanonicalEditorPickPodcastID(
  podcast: Podcast | DiscoveryPodcast | null | undefined
): string | undefined {
  if (!podcast) return undefined

  if ('podcastItunesId' in podcast && podcast.podcastItunesId) {
    const providerId = normalizeOptionalString(String(podcast.podcastItunesId))
    if (providerId && providerId !== '0') return providerId
  }

  if ('editorPickSnapshot' in podcast) {
    const fromPodcast = getEditorPickItunesIDFromPodcast(podcast as Podcast)
    if (fromPodcast) return fromPodcast
  }

  return undefined
}

export function getEditorPickPodcastGUIDFromPodcast(
  podcast: Podcast | null | undefined
): string | undefined {
  const snapshot = getEditorPickSnapshotFromPodcast(podcast)
  const candidate = podcast?.podcastGuid || snapshot?.podcastGuid
  return typeof candidate === 'string' ? normalizeOptionalString(candidate) : undefined
}

/**
 * Build a compact episode route key from an episode GUID.
 * Returns null if the GUID does not match the canonical 8-4-4-4-12 UUID shape.
 */
export function buildEpisodeCompactKey(episodeGuid: string): string | null {
  return uuidToCompactKey(episodeGuid)
}

export function getStableEditorPickEpisodeID(
  episode: Pick<Episode, 'id' | 'episodeGuid'> | null | undefined
): string | undefined {
  if (!episode) return undefined
  const guid = episode.episodeGuid?.trim()
  if (guid && guid.length >= 32) return guid
  const idValue = episode.id?.trim()
  if (idValue && idValue.length >= 32) return idValue
  return undefined
}

export const getStableEpisodeIdentifier = getStableEditorPickEpisodeID

/**
 * Parse a compact episode key back to a UUID.
 * Returns null if the key is not a valid 22-char base64url token.
 */
export function parseEpisodeCompactKey(value: string): string | null {
  return compactKeyToUUID(value)
}

export function getCachedEditorPickByItunesID(
  queryClient: QueryClient,
  country: string | null | undefined,
  podcastItunesId: string | null | undefined
): DiscoveryPodcast | undefined {
  const normalizedItunesID = normalizeOptionalString(podcastItunesId)
  if (!normalizedItunesID) return undefined
  const picks = queryClient.getQueryData<DiscoveryPodcast[]>(buildEditorPicksQueryKey(country))
  return picks?.find((item) => normalizeOptionalString(item.podcastItunesId) === normalizedItunesID)
}

export function upsertEditorPickInCache(
  queryClient: QueryClient,
  country: string | null | undefined,
  item: DiscoveryPodcast
) {
  queryClient.setQueryData(buildEditorPickSnapshotQueryKey(country, item.id), item)

  const queryKey = buildEditorPicksQueryKey(country)
  const existing = queryClient.getQueryData<DiscoveryPodcast[]>(queryKey) ?? []
  const index = existing.findIndex((entry) => entry.id === item.id)
  if (index === -1) {
    queryClient.setQueryData(queryKey, [...existing, item])
    return
  }

  const next = existing.slice()
  next[index] = item
  queryClient.setQueryData(queryKey, next)
}
