// src/routes/podcast/$id/episode/$episodeId.tsx
// Single episode detail page - Maximum information extraction

import { useParams } from '@tanstack/react-router'
import { AlertTriangle, FileText, List, Play, SquareArrowUpRight, Star } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractiveTitle } from '@/components/interactive/InteractiveTitle'
import { Button } from '@/components/ui/button'
import { useEpisodeResolution } from '@/hooks/useEpisodeResolution'
import { formatDuration, formatRelativeTime } from '@/lib/dateUtils'
import { sanitizeHtml } from '@/lib/htmlUtils'
import { getDiscoveryArtworkUrl } from '@/lib/imageUtils'
import { openExternal } from '@/lib/openExternal'
import { cn } from '@/lib/utils'
import { useExploreStore } from '@/store/exploreStore'
import { usePlayerStore } from '@/store/playerStore'

export default function PodcastEpisodeDetailPage() {
  const { t } = useTranslation()
  const { id, episodeId } = useParams({ from: '/podcast/$id/episode/$episodeId' })
  const [imageError, setImageError] = useState(false)

  // Resolve podcast and episode metadata using centralized logic
  const { podcast, episode, isLoading, podcastError } = useEpisodeResolution(id, episodeId)

  // Favorite state
  const { addFavorite, removeFavorite, isFavorited } = useExploreStore()
  const favorited =
    podcast && episode ? isFavorited(podcast.feedUrl || '', episode.audioUrl || '') : false

  // Player actions
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  const handlePlayEpisode = () => {
    if (!podcast || !episode) return
    const coverArt = getDiscoveryArtworkUrl(
      episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100,
      600
    )
    // Pass metadata for History/Favorites consistency with Show Page
    setAudioUrl(episode.audioUrl, episode.title, coverArt, {
      description: episode.description,
      podcastTitle: podcast.collectionName,
      podcastFeedUrl: podcast.feedUrl,
      artworkUrl: coverArt,
      publishedAt: episode.pubDate ? new Date(episode.pubDate).getTime() : undefined,
      duration: episode.duration,
    })
    play()
  }

  const handleToggleFavorite = () => {
    if (!podcast || !episode) return
    if (favorited) {
      removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`)
    } else {
      addFavorite(podcast, episode)
    }
  }

  // Loading state: Include recovery phase to prevent "Flash of Empty State"
  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          {/* Hero skeleton */}
          <div className="flex flex-col md:flex-row gap-8 mb-10">
            <div className="w-full md:w-64 aspect-square bg-muted rounded-2xl animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-4">
              <div className="h-8 w-3/4 bg-muted rounded animate-pulse" />
              <div className="h-5 w-1/2 bg-muted rounded animate-pulse" />
              <div className="h-4 w-1/3 bg-muted rounded animate-pulse" />
              <div className="flex gap-3 pt-4">
                <div className="h-10 w-32 bg-muted rounded animate-pulse" />
                <div className="h-10 w-10 bg-muted rounded animate-pulse" />
              </div>
            </div>
          </div>
          {/* Description skeleton */}
          <div className="space-y-2">
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-full bg-muted rounded animate-pulse" />
            <div className="h-4 w-2/3 bg-muted rounded animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // Error state - podcast not found
  if (podcastError || !podcast) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('errorPodcastUnavailable')}</p>
          </div>
        </div>
      </div>
    )
  }

  // Error state - episode not found
  if (!episode) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('episodeNotFound')}</p>
          </div>
        </div>
      </div>
    )
  }

  // Get artwork URL (episode-specific or podcast fallback)
  const primaryArtwork = episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100
  const fallbackArtwork = podcast.artworkUrl600 || podcast.artworkUrl100

  const artworkUrl = getDiscoveryArtworkUrl(!imageError ? primaryArtwork : fallbackArtwork, 600)

  // Description handling - prioritize rich content then strip for safety
  const contentSource = episode.descriptionHtml || episode.description || ''
  const sanitizedDescription = sanitizeHtml(contentSource)

  // Format metadata
  const relativeTime = formatRelativeTime(episode.pubDate, t)
  const duration = formatDuration(episode.duration, t)

  // Build season/episode label
  let episodeLabel = ''
  if (episode.seasonNumber && episode.episodeNumber) {
    episodeLabel = `S${episode.seasonNumber} · E${episode.episodeNumber}`
  } else if (episode.episodeNumber) {
    episodeLabel = `E${episode.episodeNumber}`
  } else if (episode.seasonNumber) {
    episodeLabel = `S${episode.seasonNumber}`
  }

  return (
    <div className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar">
      <div className="w-full max-w-content mx-auto px-page pt-page pb-32">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Artwork */}
          <div className="w-full md:w-64 flex-shrink-0">
            <img
              src={artworkUrl}
              alt=""
              className="w-full aspect-square rounded-2xl object-cover shadow-lg bg-muted"
              referrerPolicy="no-referrer"
              onError={() => setImageError(true)}
            />
          </div>

          {/* Metadata Container */}
          <div className="flex-1 flex flex-col justify-between min-h-64 py-1">
            {/* 1. Top Balance Spacer - Matches height of buttons at bottom (pt-6 + h-8 ≈ 56px) */}
            <div className="hidden md:block h-14" aria-hidden="true" />

            {/* 2. Center Group: Perfectly centered relative to image on desktop */}
            <div className="flex flex-col justify-center text-start">
              {/* Line 1: Small Caps Metadata */}
              <div className="flex flex-wrap items-center gap-1.5 text-xxs font-bold tracking-widest text-muted-foreground uppercase mb-1.5">
                {relativeTime && <span>{relativeTime}</span>}
                {relativeTime && (episodeLabel || duration) && <span>·</span>}
                {episodeLabel && <span>{episodeLabel.replace(' · ', ' ')}</span>}
                {episodeLabel && duration && <span>·</span>}
                {duration && <span>{duration}</span>}
                {episode.explicit && (
                  <>
                    <span>·</span>
                    <span className="text-red-500 flex items-center gap-0.5">
                      <AlertTriangle size={10} strokeWidth={3} />
                      {t('episodeExplicit')}
                    </span>
                  </>
                )}
              </div>

              {/* Line 2: Big Episode Title */}
              <h1 className="text-2xl sm:text-4xl font-medium tracking-tight mb-2 leading-tight">
                {episode.title}
              </h1>

              {/* Line 3: Podcast Show Name */}
              <div className="flex items-center gap-2">
                <InteractiveTitle
                  title={podcast.collectionName}
                  to="/podcast/$id"
                  params={{ id }}
                  className="text-base font-bold text-primary"
                  maxLines={1}
                />
                {(episode.episodeType === 'trailer' || episode.episodeType === 'bonus') && (
                  <span
                    className={cn(
                      'text-xxs px-1.5 py-0.5 rounded font-bold uppercase tracking-wider',
                      episode.episodeType === 'trailer'
                        ? 'bg-amber-500/10 text-amber-600'
                        : 'bg-purple-500/10 text-purple-600'
                    )}
                  >
                    {episode.episodeType === 'trailer'
                      ? t('episodeTypeTrailer')
                      : t('episodeTypeBonus')}
                  </span>
                )}
              </div>
            </div>

            {/* 3. Bottom Actions - Anchored to bottom of image */}
            <div className="flex items-end gap-3 pt-6 pe-4 h-14">
              <Button
                onClick={handlePlayEpisode}
                className="rounded-md bg-primary hover:opacity-90 text-primary-foreground px-5 h-8 font-bold text-xs flex items-center gap-1.5 shadow-none transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {t('btnPlayOnly')}
              </Button>

              <Button
                variant="ghost"
                onClick={handleToggleFavorite}
                className={cn(
                  'h-8 rounded-full text-primary font-bold text-xs active:scale-95 bg-muted/70 hover:bg-muted transition-all duration-300 ease-out overflow-hidden ms-auto',
                  favorited ? 'w-8 p-0' : 'px-3'
                )}
                aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
              >
                <div
                  className={cn(
                    'flex items-center justify-center',
                    favorited ? 'w-full h-full' : 'gap-1.5'
                  )}
                >
                  <div
                    className={cn(
                      'relative flex items-center justify-center flex-shrink-0',
                      favorited ? 'w-5 h-5' : 'w-4 h-4'
                    )}
                  >
                    <Star
                      className={cn(
                        'w-4 h-4 stroke-2 absolute inset-0 m-auto transition-all duration-300',
                        favorited ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
                      )}
                    />
                    <Star
                      className={cn(
                        'w-5 h-5 stroke-2 fill-current absolute inset-0 m-auto transition-all duration-300',
                        favorited
                          ? 'opacity-100 rotate-0 scale-100'
                          : 'opacity-0 -rotate-90 scale-0'
                      )}
                    />
                  </div>
                  {!favorited && <span className="whitespace-nowrap">{t('favoritesAdd')}</span>}
                </div>
              </Button>
            </div>
          </div>
        </div>

        {/* Podcasting 2.0 Features: Transcript & Chapters */}
        {(episode.transcriptUrl || episode.chaptersUrl) && (
          <div className="flex flex-wrap gap-3 mb-8">
            {episode.transcriptUrl && (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-md h-9 px-4 text-sm"
                onClick={() => {
                  if (episode.transcriptUrl) openExternal(episode.transcriptUrl)
                }}
              >
                <FileText size={14} className="me-1.5" />
                {t('viewTranscript')}
              </Button>
            )}
            {episode.chaptersUrl && (
              <Button
                variant="secondary"
                size="sm"
                className="rounded-md h-9 px-4 text-sm"
                onClick={() => {
                  if (episode.chaptersUrl) openExternal(episode.chaptersUrl)
                }}
              >
                <List size={14} className="me-1.5" />
                {t('viewChapters')}
              </Button>
            )}
          </div>
        )}

        {/* Description Section */}
        {sanitizedDescription && (
          <section className="w-full">
            <div className="h-px bg-border mb-6 me-4" />
            <div className="relative max-w-xl">
              <div
                className="prose dark:prose-invert max-w-none whitespace-pre-line"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: Sanitized HTML is required for formatting and safe links
                dangerouslySetInnerHTML={{ __html: sanitizedDescription }}
              />
            </div>
          </section>
        )}

        {/* Episode Webpage Link Section */}
        {episode.link && (
          <section className="w-full mt-8">
            <div className="h-px bg-border mb-6 me-4" />
            <div className="max-w-xl group/link">
              <Button
                variant="link"
                className="text-primary p-0 h-auto font-bold flex items-center gap-2 hover:no-underline"
                onClick={() => episode.link && openExternal(episode.link)}
              >
                <span className="text-sm group-hover/link:underline">{t('episodeWebpage')}</span>
                <SquareArrowUpRight size={18} className="text-primary" />
              </Button>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
