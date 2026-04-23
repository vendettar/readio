import type { NavigateFn } from '@tanstack/react-router'
import type { LocalSearchResult } from '../hooks/useGlobalSearch'
import type { EpisodeMetadata } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import type { ASRCue } from './asr/types'
import {
  DB,
  isNavigableExplorePlaybackSession,
  type Favorite,
  type PlaybackSession,
  type Subscription,
} from './dexieDb'
import { buildEpisodeCompactKey } from './discovery/editorPicks'
import { logError } from './logger'
import { mapPlaybackSessionToEpisodeMetadata } from './player/episodeMetadata'
import { loadSessionSubtitleCues } from './player/localSessionRestore'
import {
  bumpPlaybackEpoch,
  getPlaybackEpoch,
  playFavoriteWithDeps,
  playHistorySessionWithDeps,
} from './player/remotePlayback'
import {
  applySurfacePolicy,
  deriveSurfacePolicyFromFavorite,
  deriveSurfacePolicyFromHistorySession,
} from './player/surfacePolicy'
import {
  buildPodcastEpisodeRoute,
  buildPodcastShowRoute,
  normalizeCountryParam,
} from './routes/podcastRoutes'

export interface LocalSearchActionDeps {
  navigate: NavigateFn
  setAudioUrl: (
    url: string | null,
    title?: string,
    coverArt?: string | Blob | null,
    metadata?: EpisodeMetadata | null
  ) => void
  play: () => void
  pause: () => void
  loadAudioBlob: (
    blob: Blob,
    title: string,
    artwork?: string | Blob | null,
    sessionId?: string | null,
    signal?: AbortSignal,
    metadata?: EpisodeMetadata | null
  ) => Promise<void>
  setSubtitles: (subtitles: ASRCue[]) => void
  setSessionId?: (id: string | null) => void
  setPlaybackTrackId?: (id: string | null) => void
}

function buildLibraryEpisodeRoute(params: {
  countryAtSave: string
  podcastItunesId: string
  episodeGuid: string
}) {
  const country = normalizeCountryParam(params.countryAtSave)
  const podcastId = params.podcastItunesId.trim()
  const guid = params.episodeGuid.trim()

  if (!country || !podcastId || !guid) return null

  const episodeKey = buildEpisodeCompactKey(guid)
  if (!episodeKey) return null

  return buildPodcastEpisodeRoute({
    country,
    podcastId,
    episodeKey,
  })
}

export async function executeLocalSearchAction(
  result: LocalSearchResult,
  deps: LocalSearchActionDeps
): Promise<void> {
  const { setPlayableContext, toDocked, toMini } = usePlayerSurfaceStore.getState()

  switch (result.type) {
    case 'subscription': {
      const subscription = result.data as Subscription
      const persistedCountry = normalizeCountryParam(subscription.countryAtSave)
      if (!persistedCountry) {
        if (import.meta.env.DEV) {
          logError('[LocalSearch] Missing subscription.countryAtSave; skip deep-link', {
            feedUrl: subscription.feedUrl,
            id: subscription.id,
          })
        }
        void deps.navigate({ to: '/subscriptions' })
        return
      }
      const showRoute = buildPodcastShowRoute({
        country: persistedCountry,
        podcastId: subscription.podcastItunesId ?? '',
      })

      if (showRoute) {
        void deps.navigate(showRoute)
      } else if (subscription.title) {
        void deps.navigate({ to: '/search', search: { q: subscription.title } })
      } else {
        void deps.navigate({ to: '/subscriptions' })
      }
      return
    }
    case 'favorite': {
      const favorite = result.data as Favorite
      const episodeRoute =
        favorite.podcastItunesId && favorite.episodeGuid
          ? buildLibraryEpisodeRoute({
              countryAtSave: favorite.countryAtSave,
              podcastItunesId: favorite.podcastItunesId,
              episodeGuid: favorite.episodeGuid,
            })
          : null
      if (episodeRoute) {
        void deps.navigate(episodeRoute)
        return
      }

      const favoritePolicy = deriveSurfacePolicyFromFavorite(favorite)
      applySurfacePolicy({ setPlayableContext, toDocked, toMini }, favoritePolicy)

      void playFavoriteWithDeps(
        {
          setAudioUrl: deps.setAudioUrl,
          play: deps.play,
          pause: deps.pause,
          setPlaybackTrackId: deps.setPlaybackTrackId,
        },
        favorite,
        {
          countryAtSave: favorite.countryAtSave,
        }
      )
      return
    }
    case 'history': {
      const session = result.data as PlaybackSession
      const episodeRoute = isNavigableExplorePlaybackSession(session)
        ? buildLibraryEpisodeRoute({
            countryAtSave: session.countryAtSave,
            podcastItunesId: session.podcastItunesId,
            episodeGuid: session.episodeGuid,
          })
        : null
      if (episodeRoute) {
        void deps.navigate(episodeRoute)
        return
      }

      if (session.audioUrl) {
        const historyPolicy = deriveSurfacePolicyFromHistorySession(session)
        applySurfacePolicy({ setPlayableContext, toDocked, toMini }, historyPolicy)

        void playHistorySessionWithDeps(
          {
            setAudioUrl: deps.setAudioUrl,
            play: deps.play,
            pause: deps.pause,
            setSessionId: deps.setSessionId,
            setPlaybackTrackId: deps.setPlaybackTrackId,
          },
          session
        )
        return
      }

      if (session.source === 'local' && session.audioId) {
        const currentEpoch = bumpPlaybackEpoch()
        let audioBlob: Awaited<ReturnType<typeof DB.getAudioBlob>> | null = null

        try {
          audioBlob = await DB.getAudioBlob(session.audioId)
          if (getPlaybackEpoch() !== currentEpoch) return
        } catch (error) {
          if (getPlaybackEpoch() !== currentEpoch) return
          if (import.meta.env.DEV) {
            logError('[LocalSearch] Failed to restore local history session', {
              sessionId: session.id,
              audioId: session.audioId,
              error,
            })
          }
          void deps.navigate({ to: '/' })
          return
        }

        if (audioBlob) {
          try {
            await deps.loadAudioBlob(
              audioBlob.blob,
              session.title,
              result.artworkBlob || session.artworkUrl || null,
              session.id,
              undefined,
              mapPlaybackSessionToEpisodeMetadata(session)
            )
          } catch (error) {
            if (getPlaybackEpoch() !== currentEpoch) return
            if (import.meta.env.DEV) {
              logError('[LocalSearch] Failed to load local audio blob', {
                sessionId: session.id,
                audioId: session.audioId,
                error,
              })
            }
            void deps.navigate({ to: '/' })
            return
          }
          if (getPlaybackEpoch() !== currentEpoch) return

          let subtitleCues: ASRCue[] | null = null
          try {
            subtitleCues = await loadSessionSubtitleCues(session)
          } catch (error) {
            if (import.meta.env.DEV) {
              logError('[LocalSearch] Failed to restore local subtitles', {
                sessionId: session.id,
                subtitleId: session.subtitleId,
                error,
              })
            }
          }
          if (getPlaybackEpoch() !== currentEpoch) return
          if (subtitleCues) {
            deps.setSubtitles(subtitleCues)
          }
          // Local history restore still opens docked; transcript placeholder handles missing text.
          deps.setPlaybackTrackId?.(session.localTrackId ?? null)
          setPlayableContext(true)
          toDocked()

          deps.play()
          return
        }
      }

      void deps.navigate({ to: '/' })
      return
    }
    case 'file': {
      void deps.navigate({ to: '/files' })
      return
    }
    case 'download': {
      void deps.navigate({ to: '/downloads' })
      return
    }
  }
}
