import type { NavigateFn } from '@tanstack/react-router'
import type { LocalSearchResult } from '../hooks/useGlobalSearch'
import type { EpisodeMetadata } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'
import type { ASRCue } from './asr/types'
import {
  type Favorite,
  isNavigableExplorePlaybackSession,
  type PlaybackSession,
  type Subscription,
} from './dexieDb'
import { buildEpisodeCompactKey } from './discovery/editorPicks'
import { restoreLocalHistoryPlayback } from './player/localHistoryPlayback'
import { playHistorySessionWithDeps } from './player/remotePlayback'
import { applySurfacePolicy, deriveSurfacePolicyFromHistorySession } from './player/surfacePolicy'
import { PlaybackRepository } from './repositories/PlaybackRepository'
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
      const showRoute = buildPodcastShowRoute({
        country: subscription.countryAtSave,
        podcastId: subscription.podcastItunesId,
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
      const episodeRoute = buildLibraryEpisodeRoute({
        countryAtSave: favorite.countryAtSave,
        podcastItunesId: favorite.podcastItunesId,
        episodeGuid: favorite.episodeGuid,
      })
      if (episodeRoute) {
        void deps.navigate(episodeRoute)
      }
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
        const startResult = await playHistorySessionWithDeps(
          {
            setAudioUrl: deps.setAudioUrl,
            play: deps.play,
            pause: deps.pause,
            setSessionId: deps.setSessionId,
            setPlaybackTrackId: deps.setPlaybackTrackId,
          },
          session
        )
        if (startResult.started) {
          const historyPolicy = deriveSurfacePolicyFromHistorySession(session)
          applySurfacePolicy({ setPlayableContext, toDocked, toMini }, historyPolicy)
        }
        return
      }

      if (session.source === 'local' && session.audioId) {
        const startResult = await restoreLocalHistoryPlayback(session, {
          scope: 'LocalSearch',
          getAudioBlob: async (audioId) => {
            const audioBlob = await PlaybackRepository.getAudioBlob(audioId)
            return audioBlob?.blob ?? null
          },
          loadAudioBlob: deps.loadAudioBlob,
          setSubtitles: deps.setSubtitles,
          setPlaybackTrackId: deps.setPlaybackTrackId,
          applyStartedSurface: () => {
            setPlayableContext(true)
            toDocked()
          },
          play: deps.play,
          resolveArtwork: () => result.artworkBlob || session.artworkUrl || null,
        })
        if (startResult.started) {
          return
        }
        if (startResult.reason === 'stale') {
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
