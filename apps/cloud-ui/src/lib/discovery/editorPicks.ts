import type { QueryClient } from '@tanstack/react-query'
import { episodeIdentityToCompactKey } from '../routes/compactKey'
import type { EditorPickPodcast, FeedEpisode, Podcast, SearchEpisode } from './schema'
import { EditorPickPodcastSchema } from './schema'

export function parseEditorPickPodcast(data: unknown): EditorPickPodcast {
  return EditorPickPodcastSchema.parse(data)
}

export type EpisodeSnapshot = {
  title: string
  audioUrl?: string
  description?: string
  pubDate?: string
}

export type EditorPickRouteState = {
  editorPickSnapshot?: EditorPickPodcast
  episodeSnapshot?: EpisodeSnapshot
} & Record<string, unknown>

type SearchEpisodeSnapshotSource = Pick<
  SearchEpisode,
  'title' | 'episodeUrl' | 'shortDescription' | 'releaseDate'
>

function normalizeOptionalString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function parseEpisodeSnapshot(value: unknown): EpisodeSnapshot | undefined {
  if (!value || typeof value !== 'object') return undefined

  const snapshot = value as {
    title?: unknown
    audioUrl?: unknown
    description?: unknown
    pubDate?: unknown
  }

  const title = typeof snapshot.title === 'string' ? snapshot.title.trim() : ''
  const audioUrl = normalizeOptionalString(
    typeof snapshot.audioUrl === 'string' ? snapshot.audioUrl : undefined
  )
  const description =
    typeof snapshot.description === 'string' ? snapshot.description : undefined
  const pubDate = typeof snapshot.pubDate === 'string' ? snapshot.pubDate : undefined

  if (!title && !audioUrl) return undefined

  return {
    title,
    ...(audioUrl ? { audioUrl } : {}),
    ...(description ? { description } : {}),
    ...(pubDate ? { pubDate } : {}),
  }
}

export function getEditorPickRouteState(state: unknown): EditorPickRouteState | null {
  if (!state || typeof state !== 'object') return null
  const inputState = state as {
    editorPickSnapshot?: unknown
    episodeSnapshot?: unknown
  }
  const snapshot = inputState.editorPickSnapshot
  const episodeSnapshot = parseEpisodeSnapshot(inputState.episodeSnapshot)

  let editorPickSnapshot: EditorPickPodcast | undefined
  if (snapshot && typeof snapshot === 'object') {
    const podcastItunesId = (snapshot as { podcastItunesId?: unknown }).podcastItunesId
    if (typeof podcastItunesId === 'string' && podcastItunesId.trim().length > 0) {
      editorPickSnapshot = snapshot as EditorPickPodcast
    }
  }

  if (!editorPickSnapshot && !episodeSnapshot) {
    return null
  }

  return {
    ...(state as Record<string, unknown>),
    ...(editorPickSnapshot ? { editorPickSnapshot } : {}),
    ...(episodeSnapshot ? { episodeSnapshot } : {}),
  }
}

export function buildSearchEpisodeRouteState(
  episode: SearchEpisodeSnapshotSource
): EditorPickRouteState {
  return {
    episodeSnapshot: {
      title: episode.title || '',
      audioUrl: episode.episodeUrl,
      description: episode.shortDescription,
      pubDate: episode.releaseDate,
    },
  }
}

export function matchesEditorPickRouteID(
  snapshot: EditorPickPodcast | null | undefined,
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

export function buildEditorPicksQueryKey(country: string | null | undefined) {
  return ['editorPicks', country ?? ''] as const
}

function parsePodcastItunesId(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed && trimmed !== '0' ? trimmed : undefined
}

export function mapEditorPickToPodcast(item: EditorPickPodcast): Podcast {
  return {
    ...item,
    podcastItunesId: parsePodcastItunesId(item.podcastItunesId) ?? item.podcastItunesId,
  }
}

export function getCanonicalEditorPickPodcastID(
  podcast: Podcast | EditorPickPodcast | null | undefined
): string | undefined {
  if (!podcast) return undefined

  if ('podcastItunesId' in podcast && podcast.podcastItunesId) {
    const providerId = normalizeOptionalString(String(podcast.podcastItunesId))
    if (providerId && providerId !== '0') return providerId
  }

  return undefined
}

/**
 * Build a compact episode route key from a stable episode identity.
 */
export function buildEpisodeCompactKey(episodeGuid: string): string | null {
  return episodeIdentityToCompactKey(episodeGuid)
}

export function getEpisodeGuid(
  episode: Pick<FeedEpisode, 'episodeGuid'> | null | undefined
): string | undefined {
  if (!episode) return undefined
  const guid = episode.episodeGuid?.trim()
  return guid || undefined
}

export function getCachedEditorPickByItunesID(
  queryClient: QueryClient,
  country: string | null | undefined,
  podcastItunesId: string | null | undefined
): EditorPickPodcast | undefined {
  const normalizedItunesID = normalizeOptionalString(podcastItunesId)
  if (!normalizedItunesID) return undefined
  const picks = queryClient.getQueryData<EditorPickPodcast[]>(buildEditorPicksQueryKey(country))
  return picks?.find((item) => normalizeOptionalString(item.podcastItunesId) === normalizedItunesID)
}

export function upsertEditorPickInCache(
  queryClient: QueryClient,
  country: string | null | undefined,
  item: EditorPickPodcast
) {
  const queryKey = buildEditorPicksQueryKey(country)
  const existing = queryClient.getQueryData<EditorPickPodcast[]>(queryKey) ?? []
  const index = existing.findIndex((entry) => entry.podcastItunesId === item.podcastItunesId)
  if (index === -1) {
    queryClient.setQueryData(queryKey, [...existing, item])
    return
  }

  const next = existing.slice()
  next[index] = item
  queryClient.setQueryData(queryKey, next)
}
