// src/routes/$country/podcast/$id/episode/$episodeId.tsx
// Single episode detail page - Maximum information extraction

import { useNavigate, useParams } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import { AlertTriangle, FileText, List, Play, SquareArrowUpRight, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { InteractiveArtwork } from '@/components/interactive/InteractiveArtwork'
import { InteractiveTitle } from '@/components/interactive/InteractiveTitle'
import { ActionToggle } from '@/components/ui/action-toggle'
import { Button } from '@/components/ui/button'
import { ExpandableDescription } from '@/components/ui/expandable-description'
import { useEpisodePlayback } from '@/hooks/useEpisodePlayback'
import { useEpisodeResolution } from '@/hooks/useEpisodeResolution'
import { formatDuration, formatRelativeTime } from '@/lib/dateUtils'
import { logError } from '@/lib/logger'
import { openExternal } from '@/lib/openExternal'
import {
  buildPodcastEpisodeRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
} from '@/lib/routes/podcastRoutes'
import { generateSlugWithId } from '@/lib/slugUtils'
import { cn } from '@/lib/utils'
import { useExploreStore } from '@/store/exploreStore'
import { EpisodeDetailDownloadButton } from './EpisodeDetailDownloadButton'

export default function PodcastEpisodeDetailPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const params = useParams({ strict: false })
  const routeCountry = (params as { country?: string }).country
  const id = String((params as { id?: string }).id ?? '')
  const episodeId = String((params as { episodeId?: string }).episodeId ?? '')
  const navigate = useNavigate()
  const globalCountry = normalizeCountryParam(useExploreStore((s) => s.country))
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false)

  // Resolve podcast and episode metadata using centralized logic
  const { podcast, episode, isLoading, podcastError, resolutionError } = useEpisodeResolution(
    id,
    episodeId,
    routeCountry ?? ''
  )

  // Canonical slug enforcement: redirect to canonical URL if slug doesn't match
  useEffect(() => {
    if (!episode || isLoading) return
    const canonicalSlug = generateSlugWithId(episode.title, episode.id)
    if (episodeId !== canonicalSlug) {
      const canonicalRoute = buildPodcastEpisodeRoute({
        country: routeCountry,
        podcastId: id,
        episodeSlug: canonicalSlug,
      })
      if (canonicalRoute) {
        void navigate({
          ...canonicalRoute,
          replace: true,
        })
      }
    }
  }, [episode, episodeId, routeCountry, id, isLoading, navigate])

  // Favorite state - use atomic selectors
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)
  const favorited = useExploreStore((s) =>
    podcast && episode ? s.isFavorited(podcast.feedUrl || '', episode.audioUrl || '') : false
  )

  const { playEpisode } = useEpisodePlayback()

  const handlePlayEpisode = () => {
    if (!podcast || !episode) return
    playEpisode(episode, podcast, normalizedRouteCountry ?? undefined)
  }

  const handleToggleFavorite = () => {
    if (!podcast || !episode) return
    if (favorited) {
      removeFavorite(`${podcast.feedUrl}::${episode.audioUrl}`)
    } else {
      addFavorite(podcast, episode, undefined, normalizedRouteCountry)
    }
  }

  // Loading state: Include recovery phase to prevent "Flash of Empty State"
  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          {/* Hero skeleton */}
          <div className="flex flex-col md:flex-row gap-8 mb-10">
            <div className="w-40 sm:w-48 md:w-64 aspect-square bg-muted rounded-2xl animate-pulse flex-shrink-0" />
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
  if (resolutionError || podcastError || !podcast) {
    if (import.meta.env.DEV) {
      logError('[PodcastEpisodeDetailPage] route_error_state', {
        reason: resolutionError || podcastError ? 'lookup_feed_or_provider_failed' : 'not_found',
        podcastId: id,
        routeCountry: normalizedRouteCountry,
      })
    }
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

  const recoveryRoute = buildPodcastEpisodeRoute({
    country: globalCountry,
    podcastId: id,
    episodeSlug: episodeId,
  })
  const isRegionUnavailable =
    !episode &&
    !resolutionError &&
    !podcastError &&
    Boolean(normalizedRouteCountry && globalCountry && normalizedRouteCountry !== globalCountry)

  if (isRegionUnavailable) {
    if (import.meta.env.DEV) {
      logError('[PodcastEpisodeDetailPage] route_region_unavailable', {
        reason: 'route_country_content_unavailable',
        podcastId: id,
        episodeId,
        routeCountry: normalizedRouteCountry,
        globalCountry,
      })
    }
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20 space-y-4">
            <p className="text-lg text-muted-foreground">{t('regionUnavailableMessage')}</p>
            {recoveryRoute && (
              <Button
                onClick={() => {
                  void navigate(recoveryRoute)
                }}
              >
                {t('regionUnavailableCta')}
              </Button>
            )}
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

  // Artwork selection (handled by InteractiveArtwork, but we prep URLs here)
  const primaryArtwork = episode.artworkUrl || podcast.artworkUrl600 || podcast.artworkUrl100
  const fallbackArtwork = podcast.artworkUrl600 || podcast.artworkUrl100

  // Description handling - rich HTML rendered via shared expandable component
  const contentSource = episode.descriptionHtml || episode.description || ''

  // Format metadata
  const relativeTime = formatRelativeTime(episode.pubDate, language)
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
  const showRoute = buildPodcastShowRoute({
    country: routeCountry,
    podcastId: id,
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar"
    >
      <div className="w-full max-w-content mx-auto px-page pt-page pb-32">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row gap-8 mb-10">
          {/* Artwork */}
          <div className="w-40 sm:w-48 md:w-64 flex-shrink-0">
            <InteractiveArtwork
              src={primaryArtwork}
              fallbackSrc={fallbackArtwork}
              size="original"
              className="w-full aspect-square rounded-2xl shadow-lg"
              layoutId={`artwork-episode-${episode.id}`}
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

                {episodeLabel && (
                  <>
                    {relativeTime && <span>·</span>}
                    <span>{episodeLabel.replace(' · ', ' ')}</span>
                  </>
                )}

                {duration && (
                  <>
                    {(relativeTime || episodeLabel) && <span>·</span>}
                    <span>{duration}</span>
                  </>
                )}

                {episode.episodeType && episode.episodeType !== 'full' && (
                  <>
                    {(relativeTime || episodeLabel || duration) && <span>·</span>}
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded tracking-wider',
                        episode.episodeType === 'trailer'
                          ? 'bg-amber-500/10 text-amber-600'
                          : episode.episodeType === 'bonus'
                            ? 'bg-purple-500/10 text-purple-600'
                            : 'bg-muted text-muted-foreground'
                      )}
                    >
                      {episode.episodeType === 'trailer'
                        ? t('episodeTypeTrailer')
                        : episode.episodeType === 'bonus'
                          ? t('episodeTypeBonus')
                          : (episode.episodeType as string).toUpperCase()}
                    </span>
                  </>
                )}

                {episode.explicit && (
                  <>
                    {(relativeTime ||
                      episodeLabel ||
                      duration ||
                      (episode.episodeType && episode.episodeType !== 'full')) && <span>·</span>}
                    <span className="text-red-500 flex items-center gap-0.5">
                      <AlertTriangle size={10} strokeWidth={3} />
                      {t('episodeExplicit')}
                    </span>
                  </>
                )}
              </div>

              {/* Line 2: Big Episode Title */}
              <h1 className="text-2xl sm:text-4xl font-medium tracking-tight mb-2 leading-tight line-clamp-2">
                {episode.title}
              </h1>

              {/* Line 3: Podcast Show Name */}
              <div className="flex items-center gap-2">
                <InteractiveTitle
                  title={podcast.collectionName}
                  to={showRoute?.to}
                  params={showRoute?.params}
                  className="text-base font-bold text-primary"
                  maxLines={1}
                />
              </div>
            </div>

            {/* 3. Bottom Actions - Anchored to bottom of image */}
            <div className="flex items-end gap-3 pt-6 pe-4 h-14">
              <Button
                onClick={handlePlayEpisode}
                className="rounded-full bg-primary hover:opacity-90 text-primary-foreground px-5 h-8 font-bold text-xs flex items-center gap-1.5 shadow-none transition-all active:scale-95"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {t('btnPlayOnly')}
              </Button>

              {episode.audioUrl ? (
                <EpisodeDetailDownloadButton
                  episodeTitle={episode.title}
                  episodeDescription={episode.description}
                  podcastTitle={podcast.collectionName}
                  feedUrl={podcast.feedUrl}
                  audioUrl={episode.audioUrl}
                  transcriptUrl={episode.transcriptUrl}
                  artworkUrl={primaryArtwork}
                  countryAtSave={normalizedRouteCountry || undefined}
                  providerPodcastId={
                    podcast.providerPodcastId ? String(podcast.providerPodcastId) : undefined
                  }
                  providerEpisodeId={episode.providerEpisodeId || String(episode.id)}
                  durationSeconds={episode.duration}
                  className="rounded-full flex-shrink-0"
                />
              ) : null}

              <ActionToggle
                active={favorited}
                onToggle={handleToggleFavorite}
                activeIcon={Star}
                inactiveIcon={Star}
                activeAriaLabel={t('ariaRemoveFavorite')}
                inactiveAriaLabel={t('ariaAddFavorite')}
                inactiveLabel={t('favoritesAdd')}
                className="ms-auto"
              />
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
        {contentSource && (
          <section className="w-full">
            <div className="h-px bg-border mb-6 me-4" />
            <div className="max-w-xl">
              <ExpandableDescription
                content={contentSource}
                mode="html"
                isExpandable={false}
                collapsedLines={4}
                expanded={isDescriptionExpanded}
                onExpandedChange={setIsDescriptionExpanded}
                showMoreLabel={t('showMore')}
                showLessLabel={t('showLess')}
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
    </motion.div>
  )
}
