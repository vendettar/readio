// src/routes/history.tsx
import { useNavigate } from '@tanstack/react-router'
import { Clock, MoreHorizontal, Play, Star, Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { BaseEpisodeRow } from '../components/EpisodeRow/BaseEpisodeRow'
import { InteractiveArtwork } from '../components/interactive/InteractiveArtwork'
import { InteractiveTitle } from '../components/interactive/InteractiveTitle'
import { Button } from '../components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover'
import { useI18n } from '../hooks/useI18n'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useSubscriptionMap } from '../hooks/useSubscriptionMap'
import { cn } from '../lib/utils'
import { formatDateStandard, formatDuration, formatTimeSmart } from '../libs/dateUtils'
import { DB, type PlaybackSession } from '../libs/dexieDb'
import type { Episode, Podcast } from '../libs/discoveryProvider'
import { stripHtml } from '../libs/htmlUtils'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

export default function HistoryPage() {
  const { t, language } = useI18n()
  const navigate = useNavigate()
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const play = usePlayerStore((s) => s.play)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const setFileTrackId = usePlayerStore((s) => s.setFileTrackId)
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)

  const subscriptionMap = useSubscriptionMap()

  // Favorites integration
  const favorites = useExploreStore((s) => s.favorites)
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)

  // Optimize favorite lookups with a Set of composite keys
  const favoriteKeysSet = React.useMemo(() => {
    return new Set(favorites.map((f) => `${f.feedUrl}::${f.audioUrl}`))
  }, [favorites])

  const [sessions, setSessions] = useState<PlaybackSession[]>([])
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Keyboard shortcuts
  useKeyboardShortcuts({ isModalOpen: false })

  // Load data: sessions, favorites, and subscriptions
  useEffect(() => {
    const loadData = async () => {
      try {
        await Promise.all([
          !favoritesLoaded ? loadFavorites() : Promise.resolve(),
          !subscriptionsLoaded ? loadSubscriptions() : Promise.resolve(),
          DB.getAllPlaybackSessions().then((s) => setSessions(s)),
        ])
      } catch (err) {
        console.error('[HistoryPage] Failed to load data:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [favoritesLoaded, loadFavorites, subscriptionsLoaded, loadSubscriptions])

  const handlePlaySession = async (session: PlaybackSession) => {
    // For gallery/podcast sessions with audioUrl
    if (session.audioUrl) {
      setAudioUrl(session.audioUrl, session.title, session.artworkUrl || '', {
        description: session.description,
        podcastTitle: session.podcastTitle,
        podcastFeedUrl: session.podcastFeedUrl,
        artworkUrl: session.artworkUrl,
        publishedAt: session.publishedAt,
        duration: session.duration,
        episodeId: session.episodeId,
      })

      setFileTrackId(session.localTrackId ?? null)
      setSessionId(session.id)
      play()
      return
    }

    // For local sessions, load from IDB
    if (session.source === 'local' && session.audioId) {
      const audioBlob = await DB.getAudioBlob(session.audioId)
      if (audioBlob) {
        const url = URL.createObjectURL(audioBlob.blob)
        setAudioUrl(url, session.title, session.artworkUrl || '')
        setFileTrackId(session.localTrackId ?? null)
        setSessionId(session.id)
        play()
      }
    } else {
      // Navigate to continue or show info
      navigate({ to: '/' })
    }
  }

  const handleDeleteSession = async (id: string) => {
    await DB.deletePlaybackSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  const isFavorited = (session: PlaybackSession) => {
    if (!session.podcastFeedUrl || !session.audioUrl) return false
    return favoriteKeysSet.has(`${session.podcastFeedUrl}::${session.audioUrl}`)
  }

  const handleToggleFavorite = async (session: PlaybackSession) => {
    if (!session.podcastFeedUrl || !session.audioUrl) return

    const key = `${session.podcastFeedUrl}::${session.audioUrl}`
    const favorited = isFavorited(session)

    if (favorited) {
      await removeFavorite(key)
    } else {
      // Create minimal podcast/episode objects for addFavorite
      // Ensure we include required fields like collectionName and pubDate (ISO)
      const podcast = {
        feedUrl: session.podcastFeedUrl,
        collectionName: session.podcastTitle || '',
        artworkUrl100: session.artworkUrl || '',
        artworkUrl600: session.artworkUrl || '',
      }
      const episode = {
        id: session.episodeId || undefined, // Avoid empty string pollution
        title: session.title,
        audioUrl: session.audioUrl,
        description: session.description || '',
        artworkUrl: session.artworkUrl,
        duration: session.duration,
        pubDate: session.publishedAt ? new Date(session.publishedAt).toISOString() : '',
      }
      await addFavorite(podcast as unknown as Podcast, episode as unknown as Episode)
    }
  }

  const formatProgress = (progress: number, duration: number) => {
    if (!duration) return '0%'
    return `${Math.round((progress / duration) * 100)}%`
  }

  return (
    <div className="h-full overflow-y-auto custom-scrollbar">
      <div className="w-full max-w-5xl mx-auto px-[var(--page-gutter-x)] pt-4 pb-32">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">{t('historyTitle')}</h1>
        </header>

        {/* Loading */}
        {isLoading && (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-muted border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <div className="mt-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-6">
              <Clock className="w-6 h-6 text-muted-foreground opacity-50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-2">{t('historyEmpty')}</h3>
            <p className="text-muted-foreground max-w-sm mx-auto">{t('historyEmptyDesc')}</p>
          </div>
        )}

        {/* Sessions list - EpisodeCard-like design */}
        {!isLoading && sessions.length > 0 && (
          <div className="space-y-0">
            {sessions.map((session, index) => {
              const favorited = isFavorited(session)
              const durationText = session.duration ? formatDuration(session.duration, t) : null
              const cleanDescription = session.description ? stripHtml(session.description) : ''
              const hasArtwork = !!session.artworkUrl
              const canFavorite = !!(session.podcastFeedUrl && session.audioUrl)

              return (
                <BaseEpisodeRow
                  key={session.id}
                  isLast={index === sessions.length - 1}
                  descriptionLines={1}
                  artwork={
                    hasArtwork ? (
                      <div className="relative flex-shrink-0 z-20">
                        {(() => {
                          const collectionId = subscriptionMap.get(session.podcastFeedUrl || '')
                          const episodeId = session.episodeId // Only GUID for navigation

                          return (
                            <InteractiveArtwork
                              src={session.artworkUrl ?? ''}
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
                              onPlay={() => handlePlaySession(session)}
                              playButtonSize="sm"
                              playIconSize={14}
                              hoverGroup="episode"
                              size="lg"
                            />
                          )
                        })()}
                      </div>
                    ) : undefined
                  }
                  title={
                    <div className="relative">
                      {/* Play button if no artwork */}
                      {!hasArtwork && (
                        <div className="absolute left-0 top-0 bottom-0 -translate-x-full w-[var(--page-gutter-x)] flex items-center justify-center opacity-0 group-hover/episode:opacity-100 transition-opacity duration-200 z-20 pointer-events-none">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handlePlaySession(session)}
                            aria-label={t('btnPlayOnly')}
                            className="w-6 h-6 pointer-events-auto hover:bg-transparent"
                          >
                            <Play size={12} className="text-primary fill-current ml-0.5" />
                          </Button>
                        </div>
                      )}
                      {(() => {
                        const collectionId = subscriptionMap.get(session.podcastFeedUrl || '')
                        const episodeId = session.episodeId // Only GUID for navigation

                        return (
                          <InteractiveTitle
                            title={session.title}
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
                                ? () => handlePlaySession(session)
                                : undefined
                            }
                            className="text-sm leading-tight"
                          />
                        )
                      })()}
                    </div>
                  }
                  subtitle={
                    (session.podcastTitle || session.publishedAt) && (
                      <div className="line-clamp-1">
                        {session.podcastTitle}
                        {session.podcastTitle && session.publishedAt && ' • '}
                        {session.publishedAt && (
                          <span>{formatDateStandard(session.publishedAt)}</span>
                        )}
                      </div>
                    )
                  }
                  description={
                    <>
                      {cleanDescription && <span className="mb-1 block">{cleanDescription}</span>}
                      {/* Played At and Progress - moved to bottom with smaller font */}
                      <span className="text-xxs text-muted-foreground/60 font-medium leading-tight block">
                        {(() => {
                          const d = new Date(session.lastPlayedAt)
                          const isThisYear = d.getFullYear() === new Date().getFullYear()
                          return d.toLocaleDateString(language, {
                            month: 'short',
                            day: 'numeric',
                            year: isThisYear ? undefined : 'numeric',
                          })
                        })()}
                        {' · '}
                        {formatTimeSmart(session.lastPlayedAt, language)}
                        {' · '}
                        {formatProgress(session.progress, session.duration)}{' '}
                        {t('historyProgressSuffix')}
                      </span>
                    </>
                  }
                  meta={durationText}
                  actions={
                    <>
                      {/* Favorite Button */}
                      {canFavorite && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleFavorite(session)}
                          className={cn(
                            'w-8 h-8 text-primary hover:bg-transparent transition-opacity duration-200',
                            favorited || openMenuId === session.id ? 'opacity-100' : 'opacity-100' // Always visible in internal wrapper, but controlled by BaseEpisodeRow
                          )}
                          aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
                        >
                          <Star size={15} className={cn('stroke-2', favorited && 'fill-current')} />
                        </Button>
                      )}

                      <Popover
                        open={openMenuId === session.id}
                        onOpenChange={(open) => setOpenMenuId(open ? session.id : null)}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              'w-8 h-8 text-primary hover:bg-transparent hover:opacity-80 transition-all duration-200',
                              openMenuId === session.id && 'opacity-100'
                            )}
                            aria-label={t('ariaMoreActions')}
                          >
                            <MoreHorizontal size={15} />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="end"
                          sideOffset={8}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          className="w-48 p-0 overflow-hidden border border-border/50 bg-popover/95 backdrop-blur-xl"
                        >
                          <Button
                            variant="ghost"
                            className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10 rounded-none h-10 px-3"
                            onClick={() => handleDeleteSession(session.id)}
                          >
                            <Trash2 size={16} className="mr-2" />
                            {t('commonDelete')}
                          </Button>
                        </PopoverContent>
                      </Popover>
                    </>
                  }
                  // History items are clickable via title/artwork hooks
                />
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
