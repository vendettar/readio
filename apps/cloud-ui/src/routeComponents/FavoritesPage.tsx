import { Link } from '@tanstack/react-router'
import { Compass, MoreHorizontal, Play, Star } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { EpisodeListItem, EpisodeListSkeleton, fromFavorite } from '../components/EpisodeRow'
import { PageHeader, PageShell } from '../components/layout'
import { Button } from '../components/ui/button'
import { DropdownMenuItem } from '../components/ui/dropdown-menu'
import { EmptyState } from '../components/ui/empty-state'
import { OverflowMenu } from '../components/ui/overflow-menu'
import { useEpisodePlayback } from '../hooks/useEpisodePlayback'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useSubscriptionMap } from '../hooks/useSubscriptionMap'
import { formatRelativeTime } from '../lib/dateUtils'
import type { Favorite } from '../lib/db/types'
import { PLAYBACK_REQUEST_MODE } from '../lib/player/playbackMode'
import { canPlayRemoteStreamWithoutTranscript } from '../lib/player/remotePlayback'
import { useExploreStore } from '../store/exploreStore'

export default function FavoritesPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language

  // Use atomic selectors (not destructuring) to avoid subscribing to entire store
  const favorites = useExploreStore((s) => s.favorites)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)

  const { playFavorite } = useEpisodePlayback()
  const { isOnline } = useNetworkStatus()
  // favoritesLoaded is monotonic (false→true, never reverts) — no extra state needed
  const isInitialLoading = !favoritesLoaded

  const subscriptionMap = useSubscriptionMap()

  const handleRemoveFavorite = useCallback(
    async (key: string) => {
      await removeFavorite(key)
    },
    [removeFavorite]
  )

  const favoriteRows = useMemo(
    () =>
      favorites.map((favorite: Favorite, index: number) => {
        const model = fromFavorite({ favorite, subscriptionMap, language, t })
        const isLast = index === favorites.length - 1

        return {
          key: favorite.key,
          model,
          isLast,
          onPlay: () => playFavorite(favorite, favorite.countryAtSave),
          onToggleFavorite: async () => {
            await handleRemoveFavorite(favorite.key)
          },
          addedMeta: favorite.addedAt && (
            <span className="text-xxs text-muted-foreground/60 font-medium leading-tight block">
              {t('favoritesAddedLabel', {
                date: formatRelativeTime(new Date(favorite.addedAt).toISOString(), language),
              })}
            </span>
          ),
          menu: (
            <OverflowMenu
              triggerAriaLabel={t('ariaMoreActions')}
              triggerClassName="h-8 w-8 !rounded-full text-foreground/80 hover:bg-accent hover:text-foreground transition-all ms-4"
              icon={<MoreHorizontal size={15} />}
              stopPropagation
              contentClassName="rounded-xl shadow-2xl p-0 border border-border/50 bg-popover/95 backdrop-blur-xl w-max min-w-52"
            >
              {canPlayRemoteStreamWithoutTranscript({ audioUrl: favorite.audioUrl }, isOnline) && (
                <DropdownMenuItem
                  onSelect={() =>
                    playFavorite(favorite, favorite.countryAtSave, {
                      mode: PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT,
                    })
                  }
                  className="whitespace-nowrap cursor-pointer justify-between"
                >
                  <span>{t('playWithoutTranscript')}</span>
                  <Play size={14} />
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => handleRemoveFavorite(favorite.key)}
                className="text-destructive focus:text-destructive focus:bg-destructive/10 whitespace-nowrap cursor-pointer justify-between"
              >
                <span>{t('removeFavorite')}</span>
                <Star size={14} />
              </DropdownMenuItem>
            </OverflowMenu>
          ),
        }
      }),
    [favorites, handleRemoveFavorite, isOnline, language, playFavorite, subscriptionMap, t]
  )

  return (
    <PageShell>
      <PageHeader title={t('favoritesTitle')} subtitle={t('favoritesSubtitle')} />

      {/* Loading state - only for initial empty boot */}
      {isInitialLoading && favorites.length === 0 && <EpisodeListSkeleton label={t('loading')} />}

      {/* Empty state - only when truly empty and not loading */}
      {!isInitialLoading && favorites.length === 0 && (
        <EmptyState
          icon={Star}
          title={t('onboarding.favorites.title')}
          description={t('onboarding.favorites.desc')}
          action={
            <Button asChild>
              <Link to="/explore">
                <Compass className="w-4 h-4 me-2" />
                {t('onboarding.subscriptions.cta')}
              </Link>
            </Button>
          }
        />
      )}

      {/* Favorites list - Keep visible during revalidation */}
      {favorites.length > 0 && (
        <div className={isInitialLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Revalidation Indicator */}
          {isInitialLoading && (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground animate-pulse">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
              <span>{t('loading')}</span>
            </div>
          )}
          <div className="space-y-0">
            {favoriteRows.map((row) => {
              return (
                <EpisodeListItem
                  key={row.key}
                  model={row.model}
                  onPlay={row.onPlay}
                  isLast={row.isLast}
                  descriptionLines={1}
                  bottomMeta={row.addedMeta}
                  favorite={{
                    enabled: true,
                    favorited: true,
                    onToggle: row.onToggleFavorite,
                  }}
                  menu={row.menu}
                />
              )
            })}
          </div>
        </div>
      )}
    </PageShell>
  )
}
