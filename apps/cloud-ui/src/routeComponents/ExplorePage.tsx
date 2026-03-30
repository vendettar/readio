import { Link } from '@tanstack/react-router'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ExploreHeroSkeleton } from '../components/Explore/ExploreHeroSkeleton'
import { PodcastEpisodesGrid } from '../components/Explore/PodcastEpisodesGrid'
import { PodcastShowsCarousel } from '../components/Explore/PodcastShowsCarousel'
import { PageHeader, PageShell } from '../components/layout'
import { Button } from '../components/ui/button'
import { EmptyState } from '../components/ui/empty-state'
import { Skeleton } from '../components/ui/skeleton'
import { useEditorPicks, useTopEpisodes, useTopPodcasts } from '../hooks/useDiscoveryPodcasts'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useExploreStore } from '../store/exploreStore'

export default function ExplorePage() {
  const { t } = useTranslation()
  const country = useExploreStore((s) => s.country)

  // Network status
  const { isOnline } = useNetworkStatus()

  // Data fetching
  const { data: editorPicks, isLoading: isLoadingPicks } = useEditorPicks(country)
  const { data: topShows, isLoading: isLoadingShows } = useTopPodcasts(country, 30)
  const { data: topEpisodes, isLoading: isLoadingEpisodes } = useTopEpisodes(country, 30)

  // Data availability flags to avoid complex type intersection during state resolution
  const hasPicks = (editorPicks?.length ?? 0) > 0
  const hasShows = (topShows?.length ?? 0) > 0
  const hasEpisodes = (topEpisodes?.length ?? 0) > 0
  const isAnyLoading = isLoadingPicks || isLoadingShows || isLoadingEpisodes
  const isAllLoading = isLoadingPicks && isLoadingShows && isLoadingEpisodes
  const isEverythingEmpty = !hasPicks && !hasShows && !hasEpisodes

  return (
    <PageShell>
      {/* Header */}
      <PageHeader title={t('exploreTitle')} subtitle={t('exploreSubtitle')} />

      {!isOnline && (
        <div className="bg-muted/50 border border-border rounded-2xl p-6 mb-12 animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex items-center gap-4 mb-4">
            <div className="h-10 w-10 rounded-full bg-background flex items-center justify-center">
              <Compass className="w-5 h-5 text-muted-foreground opacity-50" />
            </div>
            <div>
              <p className="font-semibold text-foreground">{t('offline.badge')}</p>
              <p className="text-sm text-muted-foreground">{t('offline.explanation')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link
              to="/subscriptions"
              className="text-sm font-medium text-primary hover:underline transition-colors"
            >
              {t('sidebarSubscriptions')}
            </Link>
            <Link
              to="/favorites"
              className="text-sm font-medium text-primary hover:underline transition-colors"
            >
              {t('sidebarFavorites')}
            </Link>
            <Link
              to="/history"
              className="text-sm font-medium text-primary hover:underline transition-colors"
            >
              {t('sidebarHistory')}
            </Link>
            <Link
              to="/files"
              className="text-sm font-medium text-primary hover:underline transition-colors"
            >
              {t('navFiles')}
            </Link>
          </div>
        </div>
      )}

      {/* Global State Resolution */}
      {isAllLoading && isEverythingEmpty ? (
        <div className="space-y-12">
          <ExploreHeroSkeleton />
          <section>
            <Skeleton className="h-6 w-48 mb-4 rounded-md" />
            <PodcastShowsCarousel podcasts={[]} isLoading sectionId="topShows-loading" />
          </section>
          <section>
            <Skeleton className="h-6 w-48 mb-4 rounded-md" />
            <PodcastEpisodesGrid episodes={[]} isLoading />
          </section>
        </div>
      ) : isEverythingEmpty && !isAnyLoading ? (
        <EmptyState
          icon={Compass}
          title={t('noResults')}
          description={t('errorNetwork')}
          action={
            <Button onClick={() => window.location.reload()}>{t('modalCrashedRetry')}</Button>
          }
        />
      ) : (
        /* Content Sections (Partial Data / Populated) */
        <div className="space-y-12">
          {/* Module D: Editor's Picks */}
          {(hasPicks || isLoadingPicks) && (
            <section>
              <h2 className="text-xl font-bold mb-4">{t('editorPicksTitle')}</h2>
              <PodcastShowsCarousel
                podcasts={editorPicks || []}
                isLoading={isLoadingPicks}
                sectionId="editorsPicks"
              />
            </section>
          )}

          {/* Top Shows */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('topShowsTitle')}</h2>
            </div>
            <PodcastShowsCarousel
              podcasts={topShows || []}
              isLoading={isLoadingShows}
              sectionId="topShows"
            />
          </section>

          {/* Top Episodes */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">{t('topEpisodesTitle')}</h2>
            </div>
            <PodcastEpisodesGrid episodes={topEpisodes || []} isLoading={isLoadingEpisodes} />
          </section>
        </div>
      )}
    </PageShell>
  )
}
