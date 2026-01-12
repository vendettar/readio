import { MoreHorizontal, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
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
import { formatDateStandard, formatDuration } from '../libs/dateUtils'
import type { Favorite } from '../libs/dexieDb'
import { stripHtml } from '../libs/htmlUtils'
import { getDiscoveryArtworkUrl } from '../libs/imageUtils'
import { useExploreStore } from '../store/exploreStore'

export default function FavoritesPage() {
  const { t } = useI18n()

  const {
    favorites,
    loadFavorites,
    favoritesLoaded,
    removeFavorite,
    loadSubscriptions,
    subscriptionsLoaded,
  } = useExploreStore()
  const { playFavorite } = useEpisodePlayback()
  const [isInitialLoading, setIsInitialLoading] = useState(!favoritesLoaded)

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

  // Load favorites and subscriptions
  useEffect(() => {
    if (!favoritesLoaded || !subscriptionsLoaded) {
      Promise.all([
        !favoritesLoaded ? loadFavorites() : Promise.resolve(),
        !subscriptionsLoaded ? loadSubscriptions() : Promise.resolve(),
      ]).finally(() => setIsInitialLoading(false))
    }
  }, [favoritesLoaded, loadFavorites, subscriptionsLoaded, loadSubscriptions])

  const subscriptionMap = useSubscriptionMap()

  const handleRemoveFavorite = async (key: string) => {
    await removeFavorite(key)
  }

  return (
    <div className="h-full overflow-y-auto">
      <div
        className="py-14 max-w-screen-2xl mx-auto min-h-full"
        style={{ paddingLeft: 'var(--page-margin-x)', paddingRight: 'var(--page-margin-x)' }}
      >
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
            {favorites.map((favorite: Favorite) => {
              const duration = favorite.duration ? formatDuration(favorite.duration, t) : null
              const cleanDescription = favorite.description ? stripHtml(favorite.description) : ''
              const hasEpisodeArtwork = !!favorite.episodeArtworkUrl
              const artworkUrl = hasEpisodeArtwork
                ? favorite.episodeArtworkUrl
                : favorite.artworkUrl

              return (
                <div key={favorite.key} className="group/episode relative smart-divider-group pr-4">
                  {/* Hover Background */}
                  <div className="absolute inset-y-0 -left-[var(--page-gutter-x)] right-0 rounded-lg bg-foreground/5 opacity-0 group-hover/episode:opacity-100 transition-opacity duration-300 pointer-events-none" />

                  <div className="relative flex items-center gap-4 py-3 z-10">
                    {/* Artwork with Navigation & Play */}
                    {(() => {
                      const collectionId = subscriptionMap.get(favorite.feedUrl)
                      const episodeId = favorite.episodeId // Only use actual GUID/ID for navigation
                      const Artwork = (
                        <InteractiveArtwork
                          src={getDiscoveryArtworkUrl(artworkUrl, 160)}
                          to={
                            collectionId && episodeId
                              ? '/podcast/$id/episode/$episodeId'
                              : undefined
                          }
                          params={
                            collectionId && episodeId
                              ? { id: collectionId, episodeId: encodeURIComponent(episodeId) }
                              : undefined
                          }
                          onPlay={() => playFavorite(favorite)}
                          playButtonSize="md"
                          playIconSize={20}
                          hoverGroup="episode"
                          size="lg"
                        />
                      )

                      return Artwork
                    })()}

                    <div className="flex-1 min-w-0 flex items-center justify-between">
                      <div className="flex-1 min-w-0 pr-12 py-1">
                        {/* Title */}
                        <div className="mb-0.5 z-20 relative">
                          {(() => {
                            const collectionId = subscriptionMap.get(favorite.feedUrl)
                            const episodeId = favorite.episodeId // Only GUID for navigation

                            return (
                              <InteractiveTitle
                                title={favorite.episodeTitle}
                                to={
                                  collectionId && episodeId
                                    ? '/podcast/$id/episode/$episodeId'
                                    : undefined
                                }
                                params={
                                  collectionId && episodeId
                                    ? { id: collectionId, episodeId: encodeURIComponent(episodeId) }
                                    : undefined
                                }
                                onClick={
                                  !(collectionId && episodeId)
                                    ? () => playFavorite(favorite)
                                    : undefined
                                }
                                className="text-sm leading-tight"
                              />
                            )
                          })()}
                        </div>

                        {/* Podcast Title & Release Date */}
                        {(favorite.podcastTitle || favorite.pubDate) && (
                          <div className="text-xs text-muted-foreground/80 mb-0.5 line-clamp-1">
                            {favorite.podcastTitle}
                            {favorite.podcastTitle && favorite.pubDate && ' • '}
                            {favorite.pubDate && (
                              <span>{formatDateStandard(favorite.pubDate)}</span>
                            )}
                          </div>
                        )}

                        {/* Description */}
                        {cleanDescription && (
                          <p className="text-xs text-muted-foreground/80 leading-snug line-clamp-2 font-normal">
                            {cleanDescription}
                          </p>
                        )}
                      </div>

                      {/* Right Side Actions */}
                      <div className="flex items-center flex-shrink-0 gap-12">
                        {duration && (
                          <span className="text-xs text-muted-foreground font-medium whitespace-nowrap w-20 text-left">
                            {duration}
                          </span>
                        )}

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveFavorite(favorite.key)}
                            className="w-8 h-8 text-primary hover:bg-transparent opacity-100"
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
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Separator */}
                  <div className="absolute bottom-0 left-0 right-4 h-px bg-border group-hover/episode:opacity-0 transition-opacity smart-divider" />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
