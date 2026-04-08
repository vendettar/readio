import type { TFunction } from 'i18next'
import { formatDateStandard, formatDuration, formatRelativeTime } from '@/lib/dateUtils'
import type { Favorite, PlaybackSession } from '@/lib/db/types'
import type { Episode, Podcast, SearchEpisode } from '@/lib/discovery'
import { stripHtml } from '@/lib/htmlUtils'
import { buildPodcastEpisodeRoute } from '@/lib/routes/podcastRoutes'
import { generateSlugWithId } from '@/lib/slugUtils'

interface EpisodeRowModelRoute {
  to: '/$country/podcast/$id/episode/$episodeId'
  params: {
    country: string
    id: string
    episodeId: string
  }
  search?: { [x: string]: never }
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
    providerPodcastId?: string
    providerEpisodeId?: string
    durationSeconds?: number
  }
}

interface EpisodeModelArgs extends ModelContext {
  episode: Episode
  podcast: Podcast
  routeCountry: string | null | undefined
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
  title: string,
  episodeId: string | null | undefined
): EpisodeRowModelRoute | null {
  if (!podcastId || !episodeId) return null
  return buildPodcastEpisodeRoute({
    country,
    podcastId,
    episodeSlug: generateSlugWithId(title, episodeId),
  })
}

export function fromEpisode({
  episode,
  podcast,
  routeCountry,
  language,
  t,
}: EpisodeModelArgs): EpisodeRowModel {
  const route = buildEpisodeRoute(
    routeCountry,
    String(podcast.providerPodcastId || (podcast as { id?: string }).id || ''),
    episode.title,
    String(episode.id)
  )

  return {
    title: episode.title,
    subtitle: formatRelativeTime(episode.pubDate, language),
    description: stripHtml(episode.description || ''),
    meta: formatDuration(episode.duration, t),
    artworkSrc: episode.artworkUrl,
    artworkFallbackSrc: podcast.artworkUrl600 || podcast.artworkUrl100,
    artworkSize: 'xl',
    playIconSize: 16,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs: {
      episodeTitle: episode.title,
      podcastTitle: podcast.collectionName,
      feedUrl: podcast.feedUrl,
      audioUrl: episode.audioUrl,
      transcriptUrl: episode.transcriptUrl,
      artworkUrl: episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100,
      countryAtSave: routeCountry || undefined,
      providerPodcastId: podcast.providerPodcastId?.toString(),
      providerEpisodeId: episode.providerEpisodeId?.toString() || episode.id.toString(),
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
  const rawEpisodeId =
    episode.episodeGuid || episode.providerEpisodeId?.toString() || episode.episodeUrl
  const route = buildEpisodeRoute(
    routeCountry,
    episode.providerPodcastId?.toString() ?? '',
    episode.trackName,
    rawEpisodeId
  )
  const artwork = episode.artworkUrl600 || episode.artworkUrl100

  return {
    title: episode.trackName,
    subtitle: joinSubtitle(
      formatRelativeTime(episode.releaseDate || '', language),
      episode.collectionName || ''
    ),
    description: stripHtml(episode.description || ''),
    meta: formatDuration((episode.trackTimeMillis || 0) / 1000, t),
    artworkSrc: artwork,
    artworkFallbackSrc: artwork,
    artworkSize: 'xl',
    playIconSize: 20,
    route,
    playAriaLabel: t('ariaPlayEpisode'),
    downloadArgs: episode.episodeUrl
      ? {
          episodeTitle: episode.trackName,
          podcastTitle: episode.collectionName || '',
          feedUrl: episode.feedUrl,
          audioUrl: episode.episodeUrl,
          artworkUrl: artwork,
          countryAtSave: routeCountry || undefined,
          providerPodcastId: episode.providerPodcastId?.toString(),
          providerEpisodeId: rawEpisodeId,
          durationSeconds: (episode.trackTimeMillis || 0) / 1000, // Populated duration
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
  const podcastId = favorite.providerPodcastId || subscriptionMap.get(favorite.feedUrl)
  const route = buildEpisodeRoute(
    favorite.countryAtSave,
    podcastId,
    favorite.episodeTitle,
    favorite.episodeId
  )
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
          providerPodcastId: favorite.providerPodcastId,
          providerEpisodeId: favorite.providerEpisodeId || favorite.episodeId,
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
  const podcastId = session.providerPodcastId || subscriptionMap.get(session.podcastFeedUrl || '')
  const route = buildEpisodeRoute(
    session.countryAtSave,
    podcastId,
    session.title,
    session.episodeId
  )

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
          providerPodcastId: session.providerPodcastId,
          providerEpisodeId: session.providerEpisodeId || session.episodeId,
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
    download.sourceProviderPodcastId,
    download.sourceEpisodeTitle || download.name,
    download.sourceProviderEpisodeId
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
