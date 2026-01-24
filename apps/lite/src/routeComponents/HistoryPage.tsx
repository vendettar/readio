import { Link, useNavigate } from '@tanstack/react-router'
import { Clock, Compass, MoreHorizontal, Star, Trash2 } from 'lucide-react'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BaseEpisodeRow, GutterPlayButton } from '../components/EpisodeRow'
import { InteractiveArtwork } from '../components/interactive/InteractiveArtwork'
import { InteractiveTitle } from '../components/interactive/InteractiveTitle'
import { Button } from '../components/ui/button'
import { DropdownMenuItem } from '../components/ui/dropdown-menu'
import { EmptyState } from '../components/ui/empty-state'
import { LoadingPage } from '../components/ui/loading-spinner'
import { OverflowMenu } from '../components/ui/overflow-menu'

import { useSubscriptionMap } from '../hooks/useSubscriptionMap'
import { formatDateStandard, formatDuration, formatTimeSmart } from '../lib/dateUtils'
import { DB, type PlaybackSession } from '../lib/dexieDb'
import type { Episode, Podcast } from '../lib/discovery'
import { stripHtml } from '../lib/htmlUtils'
import { logError } from '../lib/logger'
import { cn } from '../lib/utils'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const navigate = useNavigate()
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const startPlayback = usePlayerStore((s) => s.play)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const setFileTrackId = usePlayerStore((s) => s.setFileTrackId)

  const subscriptionMap = useSubscriptionMap()

  // Favorites integration
  const favorites = useExploreStore((s) => s.favorites)
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)

  // Optimize favorite lookups with a Set of composite keys
  const favoriteKeysSet = React.useMemo(() => {
    return new Set(favorites.map((f) => `${f.feedUrl}::${f.audioUrl}`))
  }, [favorites])

  const [sessions, setSessions] = useState<PlaybackSession[]>([])
  const [artworkUrls, setArtworkUrls] = useState<Record<string, string>>({})
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load sessions on mount (favorites are loaded globally by useAppInitialization)
  useEffect(() => {
    DB.getAllPlaybackSessions()
      .then((s) => setSessions(s))
      .catch((err) => logError('[HistoryPage] Failed to load sessions:', err))
      .finally(() => setIsLoading(false))
  }, [])

  // Artwork resolution for local files
  useEffect(() => {
    if (sessions.length === 0) return

    let cancelled = false
    // Use a ref to track URLs created by THIS specific run of the effect
    // We don't want to revoke them immediately in cleanup if we are just re-running
    // BUT we must track them for component unmount

    // Actually, simpler strategy:
    // 1. We have a ref tracking ALL active URLs for this component lifetime
    // 2. We only add new ones
    // 3. We revoke ALL on unmount

    const resolveArtworks = async () => {
      const localSessions = sessions.filter((s) => s.source === 'local' && s.localTrackId)
      if (localSessions.length === 0) return

      const newUrls: Record<string, string> = {}
      let hasUpdates = false

      for (const session of localSessions) {
        // Skip if we already have a URL for this session
        if (activeUrlsRef.current[session.id]) continue

        if (!session.localTrackId) continue
        try {
          const track = await DB.getFileTrack(session.localTrackId)
          if (cancelled) return
          if (track?.artworkId) {
            const blob = await DB.getAudioBlob(track.artworkId)
            if (cancelled) return
            if (blob) {
              const url = URL.createObjectURL(blob.blob)
              activeUrlsRef.current[session.id] = url
              newUrls[session.id] = url
              hasUpdates = true
            }
          }
        } catch (err) {
          logError('[HistoryPage] Failed to resolve artwork for session:', session.id, err)
        }
      }

      if (!cancelled && hasUpdates) {
        setArtworkUrls((prev) => ({ ...prev, ...newUrls }))
      }
    }

    void resolveArtworks()

    return () => {
      cancelled = true
    }
  }, [sessions])

  // Cleanup on unmount
  const activeUrlsRef = React.useRef<Record<string, string>>({})
  useEffect(() => {
    return () => {
      Object.values(activeUrlsRef.current).forEach((url) => {
        URL.revokeObjectURL(url)
      })
    }
  }, [])

  const handlePlaySession = async (session: PlaybackSession) => {
    // For explore/podcast sessions with audioUrl
    if (session.audioUrl) {
      // 1. Set URL first to start loading (UI optimistic)
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

      // 2. Resume DB session - Store update is sync but we treat session as authoritative
      setSessionId(session.id)
      startPlayback()
      return
    }

    // For local sessions, load from IDB
    if (session.source === 'local' && session.audioId) {
      const audioBlob = await DB.getAudioBlob(session.audioId)
      if (audioBlob) {
        const url = URL.createObjectURL(audioBlob.blob)
        const artworkUrl = artworkUrls[session.id] || session.artworkUrl || ''
        setAudioUrl(url, session.title, artworkUrl)
        setFileTrackId(session.localTrackId ?? null)

        // Ensure session ID is set last
        setSessionId(session.id)
        startPlayback()
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
      <div className="w-full max-w-content mx-auto px-page pt-page pb-32">
        <header className="mb-12">
          <h1 className="text-4xl font-bold text-foreground tracking-tight">{t('historyTitle')}</h1>
        </header>

        {/* Loading */}
        {isLoading && <LoadingPage />}

        {/* Empty state */}
        {!isLoading && sessions.length === 0 && (
          <EmptyState
            icon={Clock}
            title={t('historyEmpty')}
            description={t('historyEmptyDesc')}
            action={
              <Button asChild onClick={() => navigate({ to: '/explore' })}>
                <Link to="/explore">
                  <Compass className="w-4 h-4 mr-2" />
                  {t('navExplore')}
                </Link>
              </Button>
            }
          />
        )}

        {/* Sessions list - EpisodeCard-like design */}
        {!isLoading && sessions.length > 0 && (
          <div className="space-y-0">
            {sessions.map((session, index) => {
              const favorited = isFavorited(session)
              const durationText = session.duration ? formatDuration(session.duration, t) : null
              const cleanDescription = session.description ? stripHtml(session.description) : ''
              const canFavorite = !!(session.podcastFeedUrl && session.audioUrl)

              // Extract navigation params to avoid IIFEs in JSX
              const providerPodcastId = subscriptionMap.get(session.podcastFeedUrl || '')
              const episodeId = session.episodeId
              const hasNavigation = !!(providerPodcastId && episodeId)
              const navigationTo = hasNavigation ? '/podcast/$id/episode/$episodeId' : undefined
              const navigationParams = hasNavigation
                ? { id: providerPodcastId, episodeId: encodeURIComponent(episodeId) }
                : undefined

              const isLocal = session.source === 'local'
              const displayArtworkUrl =
                artworkUrls[session.id] || (isLocal ? undefined : session.artworkUrl)

              return (
                <BaseEpisodeRow
                  key={session.id}
                  isLast={index === sessions.length - 1}
                  descriptionLines={1}
                  artwork={
                    displayArtworkUrl ? (
                      <div className="relative flex-shrink-0 z-20">
                        <InteractiveArtwork
                          src={displayArtworkUrl}
                          to={navigationTo}
                          params={navigationParams}
                          onPlay={() => handlePlaySession(session)}
                          playButtonSize="sm"
                          playIconSize={14}
                          hoverGroup="episode"
                          size="lg"
                        />
                      </div>
                    ) : undefined
                  }
                  title={
                    <div className="flex items-center">
                      {!displayArtworkUrl && (
                        <GutterPlayButton
                          onPlay={() => handlePlaySession(session)}
                          ariaLabel={t('btnPlayOnly')}
                        />
                      )}
                      <InteractiveTitle
                        title={session.title}
                        to={navigationTo}
                        params={navigationParams}
                        onClick={!hasNavigation ? () => handlePlaySession(session) : undefined}
                        className="text-sm leading-tight flex-1"
                      />
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
                  description={cleanDescription}
                  bottomMeta={
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
                          className="w-8 h-8 text-primary hover:bg-transparent transition-opacity duration-200"
                          aria-label={favorited ? t('ariaRemoveFavorite') : t('ariaAddFavorite')}
                        >
                          <Star size={15} className={cn('stroke-2', favorited && 'fill-current')} />
                        </Button>
                      )}

                      <OverflowMenu
                        open={openMenuId === session.id}
                        onOpenChange={(open) => setOpenMenuId(open ? session.id : null)}
                        triggerAriaLabel={t('ariaMoreActions')}
                        stopPropagation
                        triggerClassName="h-8 w-8 !rounded-full text-foreground/80 hover:bg-accent hover:text-foreground transition-all"
                        icon={<MoreHorizontal size={15} />}
                        contentClassName="p-0 border border-border/50 bg-popover/95 backdrop-blur-xl"
                      >
                        <DropdownMenuItem
                          onSelect={() => handleDeleteSession(session.id)}
                          className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer whitespace-nowrap"
                        >
                          <Trash2 size={16} className="mr-2" />
                          {t('commonDelete')}
                        </DropdownMenuItem>
                      </OverflowMenu>
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
