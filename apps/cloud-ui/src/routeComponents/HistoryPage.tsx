import { Link } from '@tanstack/react-router'
import { Clock, Compass, MoreHorizontal, Play, Trash2 } from 'lucide-react'
import React, { useCallback, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { EpisodeListItem, EpisodeListSkeleton, fromPlaybackSession } from '../components/EpisodeRow'
import { PageHeader, PageShell } from '../components/layout'
import { Button } from '../components/ui/button'
import { DropdownMenuItem } from '../components/ui/dropdown-menu'
import { EmptyState } from '../components/ui/empty-state'
import { OverflowMenu } from '../components/ui/overflow-menu'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useSubscriptionMap } from '../hooks/useSubscriptionMap'
import { formatTimeSmart } from '../lib/dateUtils'
import type { PlaybackSession } from '../lib/db/types'
import { mapSessionToDiscovery } from '../lib/discovery/mappers'
import { formatDateShort } from '../lib/formatters'
import { logError } from '../lib/logger'
import { mapPlaybackSessionToEpisodeMetadata } from '../lib/player/episodeMetadata'
import { loadSessionSubtitleCues } from '../lib/player/localSessionRestore'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../lib/player/playbackMode'
import {
  bumpPlaybackEpoch,
  canPlayRemoteStreamWithoutTranscript,
  getPlaybackEpoch,
  playHistorySessionWithDeps,
} from '../lib/player/remotePlayback'
import {
  applySurfacePolicy,
  deriveSurfacePolicyFromHistorySession,
} from '../lib/player/surfacePolicy'
import { useExploreStore } from '../store/exploreStore'
import { useHistoryStore } from '../store/historyStore'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import { useTranscriptStore } from '../store/transcriptStore'

export default function HistoryPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const startPlayback = usePlayerStore((s) => s.play)
  const currentSessionId = usePlayerStore((s) => s.sessionId)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const suspendSessionPersistence = usePlayerStore((s) => s.suspendSessionPersistence)
  const setPlaybackTrackId = usePlayerStore((s) => s.setPlaybackTrackId)
  const setPlayableContext = usePlayerSurfaceStore((s) => s.setPlayableContext)
  const toDocked = usePlayerSurfaceStore((s) => s.toDocked)
  const toMini = usePlayerSurfaceStore((s) => s.toMini)
  const pausePlayback = usePlayerStore((s) => s.pause)
  const { isOnline } = useNetworkStatus()

  const subscriptionMap = useSubscriptionMap()

  // Favorites integration
  const favorites = useExploreStore((s) => s.favorites)
  const addFavorite = useExploreStore((s) => s.addFavorite)
  const removeFavorite = useExploreStore((s) => s.removeFavorite)

  // Optimize favorite lookups with a Set of composite keys
  const favoriteKeysSet = React.useMemo(() => {
    return new Set(favorites.map((f) => `${f.feedUrl}::${f.audioUrl}`))
  }, [favorites])

  // History store
  const sessions = useHistoryStore((s) => s.sessions)
  const artworkBlobs = useHistoryStore((s) => s.artworkBlobs)
  const isLoading = useHistoryStore((s) => s.isLoading)
  const loadSessions = useHistoryStore((s) => s.loadSessions)
  const resolveArtworkForSession = useHistoryStore((s) => s.resolveArtworkForSession)
  const deleteSessionFromStore = useHistoryStore((s) => s.deleteSession)
  const getAudioBlobForSession = useHistoryStore((s) => s.getAudioBlobForSession)

  // Load sessions on mount (favorites are loaded globally by useAppInitialization)
  useEffect(() => {
    void loadSessions()
  }, [loadSessions])

  // Artwork resolution for local files
  useEffect(() => {
    if (sessions.length === 0) return

    let cancelled = false

    const resolveArtworks = async () => {
      const localSessions = sessions.filter((s) => s.source === 'local' && s.localTrackId)
      if (localSessions.length === 0) return

      // Note: resolveArtworkForSession internally checks getState().artworkBlobs
      // so we don't need to depend on artworkBlobs in this effect, preventing loops.
      void Promise.all(
        localSessions.map(async (session) => {
          if (cancelled) return
          await resolveArtworkForSession(session)
        })
      )
    }

    void resolveArtworks()

    return () => {
      cancelled = true
    }
  }, [sessions, resolveArtworkForSession])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // NOTE: ObjectsURLs are now handled by hooks in subcomponents
    }
  }, [])

  const handlePlaySession = useCallback(
    async (session: PlaybackSession, mode: PlaybackRequestMode = PLAYBACK_REQUEST_MODE.DEFAULT) => {
      // For explore/podcast sessions with audioUrl
      if (session.audioUrl) {
        const policy = deriveSurfacePolicyFromHistorySession(session)
        applySurfacePolicy({ setPlayableContext, toDocked, toMini }, policy)

        void playHistorySessionWithDeps(
          {
            setAudioUrl,
            play: startPlayback,
            pause: pausePlayback,
            setSessionId,
            setPlaybackTrackId,
          },
          session,
          { mode }
        )
        return
      }

      // For local sessions, load from IDB via store action
      if (session.source === 'local' && session.audioId) {
        const currentEpoch = bumpPlaybackEpoch()
        const audioBlob = await getAudioBlobForSession(session.audioId)
        if (getPlaybackEpoch() !== currentEpoch) return

        if (audioBlob) {
          const loadAudioBlob = usePlayerStore.getState().loadAudioBlob
          const artworkUrl = artworkBlobs[session.id] ?? session.artworkUrl ?? ''
          await loadAudioBlob(
            audioBlob,
            session.title,
            artworkUrl,
            session.id,
            undefined,
            mapPlaybackSessionToEpisodeMetadata(session)
          )

          // Second epoch check after async blob loading/revocation
          if (getPlaybackEpoch() !== currentEpoch) return

          let subtitleCues: Awaited<ReturnType<typeof loadSessionSubtitleCues>> = null
          try {
            subtitleCues = await loadSessionSubtitleCues(session)
          } catch (error) {
            if (import.meta.env.DEV) {
              logError('[History] Failed to restore subtitles for local session', {
                sessionId: session.id,
                subtitleId: session.subtitleId,
                error,
              })
            }
          }
          if (getPlaybackEpoch() !== currentEpoch) return
          if (subtitleCues) {
            useTranscriptStore.getState().setSubtitles(subtitleCues)
          }

          setPlaybackTrackId(session.localTrackId ?? null)
          setPlayableContext(true)
          toDocked()
          startPlayback()
          return
        }
        if (import.meta.env.DEV) {
          logError('[History] Missing local audio blob for session playback', {
            sessionId: session.id,
            audioId: session.audioId,
          })
        }
      } else {
        // Log failure but don't force navigate, which can interrupt audio loading
        logError('[Session] Invalid session type for playback', session)
      }
    },
    [
      artworkBlobs,
      getAudioBlobForSession,
      setAudioUrl,
      setPlaybackTrackId,
      setPlayableContext,
      setSessionId,
      startPlayback,
      toDocked,
      toMini,
      pausePlayback,
    ]
  )

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSessionFromStore(id)
      if (currentSessionId === id) {
        suspendSessionPersistence()
      }
    },
    [currentSessionId, deleteSessionFromStore, suspendSessionPersistence]
  )

  const handleToggleFavorite = useCallback(
    async (session: PlaybackSession, favorited: boolean) => {
      if (!session.podcastFeedUrl || !session.audioUrl) return

      const key = `${session.podcastFeedUrl}::${session.audioUrl}`

      if (favorited) {
        await removeFavorite(key)
        return
      }

      const { podcast, episode } = mapSessionToDiscovery(session)

      await addFavorite(podcast, episode, undefined, session.countryAtSave)
    },
    [addFavorite, removeFavorite]
  )

  const formatProgress = useCallback((progress: number, duration: number) => {
    if (!duration) return '0%'
    return `${Math.round((progress / duration) * 100)}%`
  }, [])

  const historyRows = React.useMemo(() => {
    return sessions.map((session, index) => {
      const favorited = !!(
        session.podcastFeedUrl &&
        session.audioUrl &&
        favoriteKeysSet.has(`${session.podcastFeedUrl}::${session.audioUrl}`)
      )
      const canFavorite = !!(session.podcastFeedUrl && session.audioUrl)
      const localBlob = artworkBlobs[session.id] || null
      const model = fromPlaybackSession({
        session,
        subscriptionMap,
        artworkBlob: localBlob,
        language,
        t,
      })
      const finalModel =
        session.source === 'local'
          ? {
              ...model,
              description: session.description,
            }
          : model
      const d = new Date(session.lastPlayedAt)
      const isThisYear = d.getFullYear() === new Date().getFullYear()

      return {
        sessionId: session.id,
        model: finalModel,
        onPlay: () => handlePlaySession(session),
        onPlayWithoutTranscript: () =>
          void handlePlaySession(session, PLAYBACK_REQUEST_MODE.STREAM_WITHOUT_TRANSCRIPT),
        canPlayWithoutTranscript: canPlayRemoteStreamWithoutTranscript(
          { audioUrl: session.audioUrl },
          isOnline
        ),
        favorited,
        canFavorite,
        onToggleFavorite: async () => {
          await handleToggleFavorite(session, favorited)
        },
        onDelete: () => {
          void handleDeleteSession(session.id)
        },
        isLast: index === sessions.length - 1,
        bottomMeta: (
          <span className="text-xxs text-muted-foreground/60 font-medium leading-tight block">
            {formatDateShort(session.lastPlayedAt, language, !isThisYear)}
            {' · '}
            {formatTimeSmart(session.lastPlayedAt, language)}
            {' · '}
            {formatProgress(session.progress, session.durationSeconds)} {t('historyProgressSuffix')}
          </span>
        ),
      }
    })
  }, [
    sessions,
    favoriteKeysSet,
    artworkBlobs,
    subscriptionMap,
    language,
    t,
    handlePlaySession,
    handleToggleFavorite,
    handleDeleteSession,
    formatProgress,
    isOnline,
  ])

  return (
    <PageShell>
      <PageHeader title={t('historyTitle')} />

      {/* Loading state - only for initial empty boot */}
      {isLoading && sessions.length === 0 && <EpisodeListSkeleton label={t('loading')} />}

      {/* Empty state - only when truly empty and not loading */}
      {!isLoading && sessions.length === 0 && (
        <EmptyState
          icon={Clock}
          title={t('onboarding.history.title')}
          description={t('onboarding.history.desc')}
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

      {/* Sessions list - Keep visible during revalidation */}
      {sessions.length > 0 && (
        <div className={isLoading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Revalidation Indicator */}
          {isLoading && (
            <div className="flex items-center gap-2 p-4 text-xs text-muted-foreground animate-pulse">
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
              <span>{t('loading')}</span>
            </div>
          )}
          <div className="space-y-0">
            {historyRows.map((row) => {
              return (
                <EpisodeListItem
                  key={row.sessionId}
                  model={row.model}
                  onPlay={row.onPlay}
                  isLast={row.isLast}
                  descriptionLines={1}
                  bottomMeta={row.bottomMeta}
                  favorite={{
                    enabled: row.canFavorite,
                    favorited: row.favorited,
                    onToggle: row.onToggleFavorite,
                  }}
                  menu={
                    <OverflowMenu
                      triggerAriaLabel={t('ariaMoreActions')}
                      stopPropagation
                      triggerClassName="h-8 w-8 !rounded-full text-foreground/80 hover:bg-accent hover:text-foreground transition-all ms-4"
                      icon={<MoreHorizontal size={15} />}
                      contentClassName="w-max min-w-52 p-0 border border-border/50 bg-popover/95 backdrop-blur-xl"
                    >
                      {row.canPlayWithoutTranscript && (
                        <DropdownMenuItem
                          onSelect={row.onPlayWithoutTranscript}
                          className="cursor-pointer whitespace-nowrap justify-between"
                        >
                          <span>{t('playWithoutTranscript')}</span>
                          <Play size={14} />
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={row.onDelete}
                        className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer whitespace-nowrap justify-between"
                      >
                        <span>{t('commonDelete')}</span>
                        <Trash2 size={16} />
                      </DropdownMenuItem>
                    </OverflowMenu>
                  }
                />
              )
            })}
          </div>
        </div>
      )}
    </PageShell>
  )
}
