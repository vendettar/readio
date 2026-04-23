import type { TFunction } from 'i18next'
import { formatDateStandard, formatDuration, formatRelativeTime } from '@/lib/dateUtils'
import type { Favorite, PlaybackSession } from '@/lib/db/types'
import type { EditorPickPodcast, FeedEpisode, Podcast, SearchEpisode } from '@/lib/discovery'
import {
  buildEpisodeCompactKey,
  type EditorPickRouteState,
  getCanonicalEditorPickPodcastID,
  getEpisodeGuid,
} from '@/lib/discovery/editorPicks'
import { stripHtml } from '@/lib/htmlUtils'
import { buildPodcastEpisodeRoute } from '@/lib/routes/podcastRoutes'

interface EpisodeRowModelRoute {
  to: '/podcast/$country/$id/$episodeKey'
  params: {
    country: string
    id: string
    episodeKey: string
  }
  search?: { [x: string]: never }
  state?: EditorPickRouteState
}

interface ModelContext {
  language: string
  t: TFunction
}

export interface EpisodeRowModel {
  title: string
  subtitle?: string
  description?: string
  meta?: string
  artworkSrc?: string
  artworkFallbackSrc?: string
  artworkBlob?: Blob | null
  artworkSize?: 'sm' | 'md' | 'lg' | 'xl' | 'original'
  playIconSize?: number
  route: EpisodeRowModelRoute | null
  playAriaLabel: string
  downloadArgs?: {
    episodeTitle: string
    podcastTitle: string
    feedUrl?: string
    audioUrl: string
    transcriptUrl?: string
    artworkUrl?: string
    countryAtSave?: string
    podcastItunesId?: string
    providerEpisodeId?: string
    episodeGuid?: string
    durationSeconds?: number
  }
}

interface EpisodeModelArgs extends ModelContext {
  episode: FeedEpisode
  podcast: Podcast
  editorPickSnapshot?: EditorPickPodcast
  routeCountry: string | null | undefined
  podcastId?: string
}

interface SearchEpisodeModelArgs extends ModelContext {
  episode: SearchEpisode
  routeCountry: string | null | undefined
}

interface FavoriteModelArgs extends ModelContext {
  favorite: Favorite
  subscriptionMap: Map<string, string>
}

interface PlaybackSessionModelArgs extends ModelContext {
  session: PlaybackSession
  subscriptionMap: Map<string, string>
  artworkBlob?: Blob | null
}

interface FileTrackModelArgs extends ModelContext {
  track: import('@/lib/db/types').FileTrack
}

interface PodcastDownloadModelArgs extends ModelContext {
  download: import('@/lib/db/types').PodcastDownload
  artworkBlob?: Blob | null
}

function joinSubtitle(primary?: string, secondary?: string): string | undefined {
  const lhs = primary?.trim() ?? ''
  const rhs = secondary?.trim() ?? ''
  if (lhs && rhs) return `${lhs} • ${rhs}`
  return lhs || rhs || undefined
}

function buildEpisodeRoute(
  country: string | null | undefined,
  podcastId: string | null | undefined,
  episodeGuid: string | null | undefined,
  state?: EditorPickRouteState
): EpisodeRowModelRoute | null {
  if (!podcastId || !episodeGuid) return null
  const episodeKey = buildEpisodeCompactKey(episodeGuid)
  if (!episodeKey) return null

  const route = buildPodcastEpisodeRoute({
    country: country ?? undefined,
    podcastId,
    episodeKey,
  })
  if (!route) return null

  return {
    ...route,
    ...(state ? { state } : {}),
  }
}

export function fromEpisode({
  episode,
  podcast,
  editorPickSnapshot,
  routeCountry,
  language,
  t,
  podcastId,
}: EpisodeModelArgs): EpisodeRowModel {
  const episodeGuid = getEpisodeGuid(episode)
  // Rule: content routes require podcast iTunes ID - fail closed if unavailable, never fallback to GUID
  const canonicalEditorPickPodcastId = getCanonicalEditorPickPodcastID(podcast)

  // Determine podcast ID for route: prefer explicit podcastId, fall back to canonical
  const routePodcastId =
    podcastId || (canonicalEditorPickPodcastId ? canonicalEditorPickPodcastId : undefined)

  // Fail closed: only build route if we have both episode ID and podcast ID
  // When editorPickSnapshot exists, pass it in route state
  const route =
    episodeGuid && routePodcastId
      ? buildEpisodeRoute(
          routeCountry,
          routePodcastId,
          episodeGuid,
          editorPickSnapshot ? { editorPickSnapshot } : undefined
        )
      : null

  const artworkUrl = episode.artworkUrl
  const transcriptUrl = episode.transcriptUrl

  return {
    title: episode.title,
    subtitle: formatRelativeTime(episode.pubDate, language),
    description: stripHtml(episode.description || ''),
    meta: formatDuration(episode.duration, t),
    artworkSrc: artworkUrl,
    artworkFallbackSrc: podcast.artwork,
    artworkSize: 'xl',
    playIconSize: 16,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs: {
      episodeTitle: episode.title,
      podcastTitle: podcast.title || '',
      feedUrl: podcast.feedUrl,
      audioUrl: episode.audioUrl,
      transcriptUrl,
      artworkUrl: artworkUrl || podcast.artwork,
      countryAtSave: routeCountry || undefined,
      podcastItunesId: podcast.podcastItunesId?.toString(),
      episodeGuid: getEpisodeGuid(episode),
      durationSeconds: episode.duration,
    },
  }
}

export function fromSearchEpisode({
  episode,
  routeCountry,
  language,
  t,
}: SearchEpisodeModelArgs): EpisodeRowModel {
  const podcastId = episode.podcastItunesId?.toString()
  const route = null
  const artwork = episode.artwork

  return {
    title: episode.title || '',
    subtitle: joinSubtitle(
      formatRelativeTime(episode.releaseDate || '', language),
      episode.showTitle || ''
    ),
    description: stripHtml(episode.shortDescription || ''),
    meta: formatDuration((episode.trackTimeMillis || 0) / 1000, t),
    artworkSrc: artwork,
    artworkFallbackSrc: artwork,
    artworkSize: 'xl',
    playIconSize: 20,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs: episode.episodeUrl
      ? {
          episodeTitle: episode.title || '',
          podcastTitle: episode.showTitle || '',
          audioUrl: episode.episodeUrl,
          artworkUrl: artwork,
          countryAtSave: routeCountry || undefined,
          podcastItunesId: podcastId,
          episodeGuid: episode.episodeGuid,
          durationSeconds: (episode.trackTimeMillis || 0) / 1000,
        }
      : undefined,
  }
}

export function fromFavorite({
  favorite,
  subscriptionMap,
  language,
  t,
}: FavoriteModelArgs): EpisodeRowModel {
  const podcastId = favorite.podcastItunesId || subscriptionMap.get(favorite.feedUrl)
  const route = buildEpisodeRoute(favorite.countryAtSave, podcastId, favorite.episodeGuid)
  const artworkSrc = favorite.episodeArtworkUrl || favorite.artworkUrl

  return {
    title: favorite.episodeTitle,
    subtitle: joinSubtitle(
      favorite.podcastTitle,
      favorite.pubDate ? formatDateStandard(favorite.pubDate, language) : ''
    ),
    description: stripHtml(favorite.description || ''),
    meta: favorite.durationSeconds ? formatDuration(favorite.durationSeconds, t) : undefined,
    artworkSrc,
    artworkFallbackSrc: favorite.artworkUrl,
    artworkSize: 'lg',
    playIconSize: 14,
    route,
    playAriaLabel: t('btnPlayOnly'),
    downloadArgs: favorite.audioUrl
      ? {
          episodeTitle: favorite.episodeTitle,
          podcastTitle: favorite.podcastTitle || '',
          feedUrl: favorite.feedUrl,
          audioUrl: favorite.audioUrl,
          transcriptUrl: favorite.transcriptUrl,
          artworkUrl: artworkSrc || favorite.artworkUrl,
          countryAtSave: favorite.countryAtSave || undefined,
          podcastItunesId: favorite.podcastItunesId,
          providerEpisodeId: favorite.providerEpisodeId,
          episodeGuid: favorite.episodeGuid,
          durationSeconds: favorite.durationSeconds, // Populated duration
        }
      : undefined,
  }
}

export function fromPlaybackSession({
  session,
  subscriptionMap,
  artworkBlob,
  language,
  t,
}: PlaybackSessionModelArgs): EpisodeRowModel {
  const podcastId = session.podcastItunesId || subscriptionMap.get(session.podcastFeedUrl || '')
  const route = buildEpisodeRoute(session.countryAtSave, podcastId, session.episodeGuid)

  return {
    title: session.title,
    subtitle: joinSubtitle(
      session.podcastTitle,
      session.publishedAt ? formatDateStandard(session.publishedAt, language) : ''
    ),
    description: stripHtml(session.description || ''),
    meta: session.durationSeconds ? formatDuration(session.durationSeconds, t) : undefined,
    artworkSrc: session.artworkUrl,
    artworkFallbackSrc: session.artworkUrl,
    artworkBlob: artworkBlob || null,
    artworkSize: 'lg',
    playIconSize: 14,
    route,
    playAriaLabel: t('btnPlayOnly'),
    downloadArgs: session.audioUrl
      ? {
          episodeTitle: session.title,
          podcastTitle: session.podcastTitle || '',
          feedUrl: session.podcastFeedUrl,
          audioUrl: session.audioUrl,
          transcriptUrl: session.transcriptUrl,
          artworkUrl: session.artworkUrl,
          countryAtSave: session.countryAtSave || undefined,
          podcastItunesId: session.podcastItunesId,
          providerEpisodeId: session.providerEpisodeId,
          episodeGuid: session.episodeGuid,
          durationSeconds: session.durationSeconds, // Populated duration
        }
      : undefined,
  }
}

export function fromFileTrack({ track, t }: FileTrackModelArgs): EpisodeRowModel {
  return {
    title: track.name,
    subtitle: track.artist,
    description: track.album || '',
    meta: track.durationSeconds ? formatDuration(track.durationSeconds, t) : undefined,
    artworkSize: 'md',
    playIconSize: 14,
    route: null,
    playAriaLabel: t('btnPlayOnly'),
    downloadArgs: undefined,
  }
}

export function fromPodcastDownload({
  download,
  artworkBlob, // Add this
  language,
  t,
}: PodcastDownloadModelArgs): EpisodeRowModel {
  const route = buildEpisodeRoute(
    download.countryAtSave,
    download.sourcePodcastItunesId,
    download.sourceEpisodeGuid
  )

  return {
    title: download.sourceEpisodeTitle || download.name,
    subtitle: joinSubtitle(
      download.sourcePodcastTitle,
      download.downloadedAt ? formatDateStandard(download.downloadedAt, language) : ''
    ),
    description: stripHtml(download.sourceDescription || ''),
    meta: download.durationSeconds ? formatDuration(download.durationSeconds, t) : undefined,
    artworkSrc: download.sourceArtworkUrl,
    artworkFallbackSrc: download.sourceArtworkUrl,
    artworkBlob, // Add this
    artworkSize: 'md',
    playIconSize: 14,
    route,
    playAriaLabel: t('btnPlayOnly'),
    downloadArgs: undefined,
  }
}
