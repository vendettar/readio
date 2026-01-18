import { MoreHorizontal, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { BaseEpisodeRow, GutterPlayButton } from '../components/EpisodeRow'
import { InteractiveArtwork } from '../components/interactive/InteractiveArtwork'
import { InteractiveTitle } from '../components/interactive/InteractiveTitle'
import { Button } from '../components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu'
import { useEpisodePlayback } from '../hooks/useEpisodePlayback'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSubscriptionMap } from '../hooks/useSubscriptionMap'
import { formatDateStandard, formatDuration, formatRelativeTime } from '../lib/dateUtils'
import type { Favorite } from '../lib/dexieDb'
import { stripHtml } from '../lib/htmlUtils'
import { getDiscoveryArtworkUrl } from '../lib/imageUtils'
import { useExploreStore } from '../store/exploreStore'

export default function FavoritesPage() {
  const { t } = useI18n()

  const { favorites, favoritesLoaded, removeFavorite } = useExploreStore()
  const { playFavorite } = useEpisodePlayback()
  const [isInitialLoading, setIsInitialLoading] = useState(!favoritesLoaded)

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

  // Loading state (favorites are loaded globally by useAppInitialization)
  useEffect(() => {
    if (favoritesLoaded) {
      setIsInitialLoading(false)
    }
  }, [favoritesLoaded])

  const subscriptionMap = useSubscriptionMap()

  const handleRemoveFavorite = async (key: string) => {
    await removeFavorite(key)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="w-full max-w-content mx-auto px-[var(--page-margin-x)] pt-[var(--page-margin-x)] pb-32">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight mb-3">
            {t('favoritesTitle')}
          </h1>
          <p className="text-xl text-muted-foreground font-medium">{t('favoritesSubtitle')}</p>
        </header>

        {/* Loading */}
        {isInitialLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isInitialLoading && favorites.length === 0 && (
          <div className="mt-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
              <Star className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('favoritesEmpty')}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">{t('favoritesEmptyDesc')}</p>
          </div>
        )}

        {/* Favorites list */}
        {!isInitialLoading && favorites.length > 0 && (
          <div className="space-y-0">
            {favorites.map((favorite: Favorite, index: number) => {
              const duration = favorite.duration ? formatDuration(favorite.duration, t) : null
              const cleanDescription = favorite.description ? stripHtml(favorite.description) : ''
              const hasEpisodeArtwork = !!favorite.episodeArtworkUrl
              const artworkUrl = hasEpisodeArtwork
                ? favorite.episodeArtworkUrl
                : favorite.artworkUrl

              // Extract navigation params to avoid IIFEs in JSX
              const providerPodcastId = subscriptionMap.get(favorite.feedUrl)
              const episodeId = favorite.episodeId
              const hasNavigation = !!(providerPodcastId && episodeId)
              const navigationTo = hasNavigation ? '/podcast/$id/episode/$episodeId' : undefined
              const navigationParams = hasNavigation
                ? { id: providerPodcastId, episodeId: encodeURIComponent(episodeId) }
                : undefined

              return (
                <BaseEpisodeRow
                  key={favorite.key}
                  isLast={index === favorites.length - 1}
                  artwork={
                    artworkUrl ? (
                      <InteractiveArtwork
                        src={getDiscoveryArtworkUrl(artworkUrl, 160)}
                        to={navigationTo}
                        params={navigationParams}
                        onPlay={() => playFavorite(favorite)}
                        playButtonSize="md"
                        playIconSize={20}
                        hoverGroup="episode"
                        size="lg"
                      />
                    ) : undefined
                  }
                  title={
                    <div className="flex items-center">
                      {!artworkUrl && (
                        <GutterPlayButton
                          onPlay={() => playFavorite(favorite)}
                          ariaLabel={t('btnPlayOnly')}
                        />
                      )}
                      <InteractiveTitle
                        title={favorite.episodeTitle}
                        to={navigationTo}
                        params={navigationParams}
                        onClick={!hasNavigation ? () => playFavorite(favorite) : undefined}
                        className="text-sm leading-tight"
                      />
                    </div>
                  }
                  subtitle={
                    (favorite.podcastTitle || favorite.pubDate) && (
                      <>
                        {favorite.podcastTitle}
                        {favorite.podcastTitle && favorite.pubDate && ' • '}
                        {favorite.pubDate && <span>{formatDateStandard(favorite.pubDate)}</span>}
                      </>
                    )
                  }
                  description={cleanDescription}
                  bottomMeta={
                    favorite.addedAt && (
                      <span className="text-xxs text-muted-foreground/60 font-medium leading-tight block">
                        {t('favoritesAddedLabel', {
                          date: formatRelativeTime(new Date(favorite.addedAt).toISOString(), t),
                        })}
                      </span>
                    )
                  }
                  meta={duration}
                  actions={
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveFavorite(favorite.key)}
                        className="w-8 h-8 text-primary hover:bg-transparent"
                        aria-label={t('removeFavorite')}
                      >
                        <Star size={15} className="text-primary fill-current stroke-2" />
                      </Button>

                      {/* More Actions Menu */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-8 h-8 text-primary hover:bg-transparent hover:opacity-80 transition-all duration-200"
                            aria-label={t('ariaMoreActions')}
                          >
                            <MoreHorizontal size={15} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          sideOffset={8}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded-xl shadow-2xl overflow-hidden p-0 border border-border/50 bg-popover/95 backdrop-blur-xl min-w-44"
                        >
                          <DropdownMenuItem
                            onSelect={() => handleRemoveFavorite(favorite.key)}
                            className="text-destructive focus:text-destructive focus:bg-destructive/10"
                          >
                            <Star size={14} className="mr-2" />
                            {t('removeFavorite')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </>
                  }
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
