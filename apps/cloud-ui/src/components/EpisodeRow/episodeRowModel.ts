import type { TFunction } from 'i18next'
import { formatDateStandard, formatDuration, formatRelativeTime } from '@/lib/dateUtils'
import {
  type Favorite,
  isNavigableExplorePlaybackSession,
  type PlaybackSession,
} from '@/lib/db/types'
import type { EditorPickPodcast, Episode, Podcast, SearchEpisode } from '@/lib/discovery'
import {
  buildEpisodeCompactKey,
  type EditorPickRouteState,
  getCanonicalEditorPickPodcastID,
} from '@/lib/discovery/editorPicks'
import {
  getCanonicalSearchEpisodeIdentity,
  toCanonicalSearchEpisodeRecord,
} from '@/lib/discovery/searchEpisodeContract'
import { stripHtml } from '@/lib/htmlUtils'
import { buildSearchEpisodeRoute } from '@/lib/routes/episodeResolver'
import {
  buildPodcastEpisodeRoute,
  type PodcastContentRouteWithState,
} from '@/lib/routes/podcastRoutes'

type EpisodeRowModelRoute = PodcastContentRouteWithState<EditorPickRouteState>

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
    episodeDescription?: string
    showTitle: string
    audioUrl: string
    transcriptUrl?: string
    artworkUrl: string
    countryAtSave: string
    podcastItunesId: string
    episodeGuid: string
    durationSeconds?: number
  }
}

interface EpisodeModelArgs extends ModelContext {
  episode: Episode
  podcast: Podcast
  editorPickSnapshot?: EditorPickPodcast
  routeCountry?: string
  podcastId?: string
}

interface SearchEpisodeModelArgs extends ModelContext {
  episode: SearchEpisode
  routeCountry?: string
}

interface FavoriteModelArgs extends ModelContext {
  favorite: Favorite
}

interface PlaybackSessionModelArgs extends ModelContext {
  session: PlaybackSession
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
  country: string | undefined,
  podcastId: string,
  episodeGuid: string,
  state?: EditorPickRouteState
): EpisodeRowModelRoute | null {
  const normalizedPodcastId = podcastId.trim()
  const normalizedEpisodeGuid = episodeGuid.trim()
  if (!normalizedPodcastId || !normalizedEpisodeGuid) return null
  const episodeKey = buildEpisodeCompactKey(normalizedEpisodeGuid)
  if (!episodeKey) return null

  const route = buildPodcastEpisodeRoute({
    country,
    podcastId: normalizedPodcastId,
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
  // Rule: content routes require podcast iTunes ID - fail closed if unavailable, never fallback to GUID
  // Determine podcast ID for route: prefer explicit podcastId, fall back to canonical
  const routePodcastId = podcastId ?? getCanonicalEditorPickPodcastID(podcast)

  // Fail closed: only build route if we have both episode ID and podcast ID
  // When editorPickSnapshot exists, pass it in route state
  const route =
    episode.guid && routePodcastId
      ? buildEpisodeRoute(
          routeCountry,
          routePodcastId,
          episode.guid,
          editorPickSnapshot ? { editorPickSnapshot } : undefined
        )
      : null

  const artworkUrl = episode.artworkUrl
  const transcriptUrl = episode.transcriptUrl

  return {
    title: episode.title,
    subtitle: formatRelativeTime(episode.pubDate, language),
    description: stripHtml(episode.description),
    meta: formatDuration(episode.duration, t),
    artworkSrc: artworkUrl,
    artworkFallbackSrc: podcast.artwork,
    artworkSize: 'xl',
    playIconSize: 16,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs: routeCountry
      ? {
          episodeTitle: episode.title,
          showTitle: podcast.title,
          audioUrl: episode.audioUrl,
          transcriptUrl,
          artworkUrl,
          countryAtSave: routeCountry,
          podcastItunesId: podcast.podcastItunesId,
          episodeGuid: episode.guid,
          durationSeconds: episode.duration,
        }
      : undefined,
  }
}

export function fromSearchEpisode({
  episode,
  routeCountry,
  language,
  t,
}: SearchEpisodeModelArgs): EpisodeRowModel {
  const canonicalEpisode = toCanonicalSearchEpisodeRecord(episode)
  const identity = getCanonicalSearchEpisodeIdentity(episode)
  const routeObject = buildSearchEpisodeRoute(episode, routeCountry)
  const route: EpisodeRowModelRoute | null = routeObject ? { ...routeObject } : null
  const artwork = canonicalEpisode.artworkUrl
  const subtitle = joinSubtitle(
    formatRelativeTime(canonicalEpisode.pubDate, language),
    canonicalEpisode.showTitle
  )
  const durationSeconds = canonicalEpisode.durationSeconds

  return {
    title: canonicalEpisode.title,
    subtitle,
    description: stripHtml(canonicalEpisode.description),
    meta: durationSeconds !== undefined ? formatDuration(durationSeconds, t) : undefined,
    artworkSrc: artwork,
    artworkFallbackSrc: artwork,
    artworkSize: 'xl',
    playIconSize: 20,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs:
      routeCountry
        ? {
            episodeTitle: canonicalEpisode.title,
            showTitle: canonicalEpisode.showTitle,
            audioUrl: canonicalEpisode.audioUrl,
            artworkUrl: artwork,
            countryAtSave: routeCountry,
            podcastItunesId: identity.podcastItunesId,
            episodeGuid: identity.episodeGuid,
            durationSeconds,
          }
        : undefined,
  }
}

export function fromFavorite({ favorite, language, t }: FavoriteModelArgs): EpisodeRowModel {
  const route = buildEpisodeRoute(
    favorite.countryAtSave,
    favorite.podcastItunesId,
    favorite.episodeGuid
  )
  const artworkSrc = favorite.episodeArtworkUrl

  return {
    title: favorite.episodeTitle,
    subtitle: joinSubtitle(
      favorite.podcastTitle,
      favorite.pubDate ? formatDateStandard(favorite.pubDate, language) : ''
    ),
    description: stripHtml(favorite.description),
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
          showTitle: favorite.podcastTitle,
          audioUrl: favorite.audioUrl,
          transcriptUrl: favorite.transcriptUrl,
          artworkUrl: artworkSrc,
          countryAtSave: favorite.countryAtSave,
          podcastItunesId: favorite.podcastItunesId,
          episodeGuid: favorite.episodeGuid,
          durationSeconds: favorite.durationSeconds, // Populated duration
        }
      : undefined,
  }
}

export function fromPlaybackSession({
  session,
  artworkBlob,
  language,
  t,
}: PlaybackSessionModelArgs): EpisodeRowModel {
  const isCanonicalExploreSession = isNavigableExplorePlaybackSession(session)
  const route = isCanonicalExploreSession
    ? buildEpisodeRoute(session.countryAtSave, session.podcastItunesId, session.episodeGuid)
    : null

  return {
    title: session.title,
    subtitle: joinSubtitle(
      session.showTitle,
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
    downloadArgs:
      !session.audioUrl || !isCanonicalExploreSession
        ? undefined
        : {
            episodeTitle: session.title,
            showTitle: session.showTitle,
            audioUrl: session.audioUrl,
            transcriptUrl: session.transcriptUrl,
            artworkUrl: session.artworkUrl,
            countryAtSave: session.countryAtSave,
            podcastItunesId: session.podcastItunesId,
            episodeGuid: session.episodeGuid,
            durationSeconds: session.durationSeconds, // Populated duration
          },
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
  const route =
    download.sourcePodcastItunesId && download.sourceEpisodeGuid
      ? buildEpisodeRoute(
          download.countryAtSave,
          download.sourcePodcastItunesId,
          download.sourceEpisodeGuid
        )
      : null

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
