import type { QueryClient } from '@tanstack/react-query'
import { episodeIdentityToCompactKey } from '../routes/compactKey'
import type { EditorPickPodcast, Podcast } from './schema'
import { EditorPickPodcastSchema } from './schema'

export function parseEditorPickPodcast(data: unknown): EditorPickPodcast {
  return EditorPickPodcastSchema.parse(data)
}

export type EditorPickRouteState = {
  editorPickSnapshot?: EditorPickPodcast
} & Record<string, unknown>

export { getEditorPickPodcastItunesId }

function getEditorPickPodcastItunesId(snapshot: EditorPickPodcast): string {
  return snapshot.podcastItunesId
}

function normalizeRawString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

export function getEditorPickRouteState(state: unknown): EditorPickRouteState | null {
  if (!state || typeof state !== 'object') return null
  const inputState = state as {
    editorPickSnapshot?: unknown
    episodeSnapshot?: unknown
  }
  const snapshot = inputState.editorPickSnapshot

  let editorPickSnapshot: EditorPickPodcast | undefined
  if (snapshot && typeof snapshot === 'object') {
    const podcastItunesId = normalizeRawString((snapshot as { podcastItunesId?: unknown }).podcastItunesId)
    if (podcastItunesId) {
      try {
        editorPickSnapshot = EditorPickPodcastSchema.parse(snapshot)
      } catch {
        return null
      }
    }
  }

  if (!editorPickSnapshot) {
    return null
  }

  const { episodeSnapshot: _legacyEpisodeSnapshot, ...restState } = state as Record<string, unknown>
  return {
    ...restState,
    editorPickSnapshot,
  }
}

export function matchesEditorPickRouteID(snapshot: EditorPickPodcast, routeID: string): boolean {
  const normalizedRouteID = normalizeRawString(routeID)
  if (!normalizedRouteID) return false

  return snapshot.podcastItunesId === normalizedRouteID
}

export function mapEditorPickToPodcast(item: EditorPickPodcast): Podcast {
  return item
}

export function buildEditorPicksQueryKey(country: string) {
  return ['editorPicks', country] as const
}

export function getCanonicalEditorPickPodcastID(podcast: Podcast | EditorPickPodcast): string {
  return podcast.podcastItunesId
}

/**
 * Build a compact episode route key from a stable episode identity.
 */
export function buildEpisodeCompactKey(episodeGuid: string): string | null {
  return episodeIdentityToCompactKey(episodeGuid)
}

export function getCachedEditorPickByItunesID(
  queryClient: QueryClient,
  country: string,
  podcastItunesId: string
): EditorPickPodcast | undefined {
  const normalizedCountry = normalizeRawString(country)
  const normalizedItunesID = normalizeRawString(podcastItunesId)
  if (!normalizedCountry || !normalizedItunesID) return undefined
  const picks = queryClient.getQueryData<EditorPickPodcast[]>(
    buildEditorPicksQueryKey(normalizedCountry)
  )
  return picks?.find((item) => item.podcastItunesId === normalizedItunesID)
}

export function upsertEditorPickInCache(
  queryClient: QueryClient,
  country: string,
  item: EditorPickPodcast
) {
  const normalizedCountry = normalizeRawString(country)
  if (!normalizedCountry) {
    return
  }
  const queryKey = buildEditorPicksQueryKey(normalizedCountry)
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
