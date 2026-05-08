import { useParams } from '@tanstack/react-router'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Virtuoso } from 'react-virtuoso'
import { EpisodeRow } from '../../components/EpisodeRow/EpisodeRow'
import {
  UNKNOWN_YEAR,
  usePodcastEpisodesContent,
} from '../../hooks/usePodcastEpisodesContent'
import { logError } from '../../lib/logger'
import { normalizeCountryParam } from '../../lib/routes/podcastRoutes'

export default function PodcastEpisodesPage() {
  const { t } = useTranslation()
  const params = useParams({ strict: false })
  const routeCountry = (params as { country?: string }).country
  const normalizedRouteCountry = normalizeCountryParam(routeCountry)
  const id = String((params as { id?: string }).id ?? '')
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(null)

  const { resolvedContent, isLoading, resolutionError, notFound, isEmpty } =
    usePodcastEpisodesContent(id, routeCountry)

  if (isLoading) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="mb-8">
            <div className="h-8 w-48 bg-muted rounded animate-shimmer" />
          </div>
          <div className="space-y-3">
            {[
              'episode-skeleton-1',
              'episode-skeleton-2',
              'episode-skeleton-3',
              'episode-skeleton-4',
              'episode-skeleton-5',
              'episode-skeleton-6',
              'episode-skeleton-7',
              'episode-skeleton-8',
              'episode-skeleton-9',
              'episode-skeleton-10',
            ].map((key) => (
              <div key={key} className="p-4 rounded-lg bg-muted/50 animate-shimmer">
                <div className="h-5 w-3/4 bg-muted rounded mb-2" />
                <div className="h-4 w-1/2 bg-muted rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (resolutionError || notFound === 'podcast') {
    if (import.meta.env.DEV) {
      logError('[PodcastEpisodesPage] route_error_state', {
        reason: resolutionError ? 'pi_episode_list_failed' : 'not_found',
        podcastId: id,
        country: normalizedRouteCountry,
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

  if (isEmpty) {
    return (
      <div className="h-full overflow-y-auto bg-background text-foreground">
        <div className="px-6 sm:px-12 py-10 sm:py-14 max-w-screen-2xl mx-auto">
          <div className="text-center py-20">
            <p className="text-lg text-muted-foreground">{t('noEpisodes')}</p>
          </div>
        </div>
      </div>
    )
  }

  if (!resolvedContent) {
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

  const { podcast, listRows } = resolvedContent

  return (
    <div
      ref={setScrollContainer}
      className="h-full overflow-y-auto bg-background text-foreground custom-scrollbar"
    >
      <div className="w-full max-w-content mx-auto px-page pt-page">
        <div className="flex flex-col">
          {scrollContainer && (
            <Virtuoso
              data={listRows}
              customScrollParent={scrollContainer}
              computeItemKey={(_, item) => item.key}
              itemContent={(_, row) => {
                if (row.type === 'year-header') {
                  return (
                    <div className="py-4">
                      <h2 className="text-lg font-bold text-foreground">
                        {row.year === UNKNOWN_YEAR ? t('unknownTitle') : row.year}
                      </h2>
                    </div>
                  )
                }

                return (
                  <EpisodeRow episode={row.episode} podcast={podcast} isLast={row.isLastInYear} />
                )
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
