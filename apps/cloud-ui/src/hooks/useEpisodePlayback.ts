import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { Favorite } from '../lib/dexieDb'
import { type FeedEpisode, type Podcast, type SearchEpisode } from '../lib/discovery'
import { ensurePodcastDetail } from '../lib/discovery/queryCache'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../lib/player/playbackMode'
import {
  playFavoriteWithDeps,
  playFeedEpisodeWithDeps,
  playSearchEpisodeWithDeps,
} from '../lib/player/remotePlayback'
import { logError } from '../lib/logger'
import {
  applySurfacePolicy,
  deriveSurfacePolicyFromEpisode,
  deriveSurfacePolicyFromFavorite,
  deriveSurfacePolicyFromSearchEpisode,
} from '../lib/player/surfacePolicy'
import { normalizeCountryParam } from '../lib/routes/podcastRoutes'
import { useExploreStore } from '../store/exploreStore'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'

export function useEpisodePlayback() {
  const queryClient = useQueryClient()
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  const setPlayableContext = usePlayerSurfaceStore((state) => state.setPlayableContext)
  const toDocked = usePlayerSurfaceStore((state) => state.toDocked)
  const toMini = usePlayerSurfaceStore((state) => state.toMini)
  const pause = usePlayerStore((state) => state.pause)
  const setPlaybackTrackId = usePlayerStore((state) => state.setPlaybackTrackId)

  const resolveRequiredCountryAtSave = useCallback(
    (candidate?: string): string | null => {
      const normalized = normalizeCountryParam(candidate)
      if (normalized) return normalized
      if (import.meta.env.DEV) {
        logError('[useEpisodePlayback] Missing required countryAtSave for remote playback')
      }
      return null
    },
    []
  )

  /**
   * Standard playback for FeedEpisode + Podcast objects
   */
  const playEpisode = useCallback(
    (
      episode: FeedEpisode,
      podcast: Podcast,
      countryAtSave?: string,
      options?: { mode?: PlaybackRequestMode }
    ) => {
      const globalCountry = useExploreStore.getState().country
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(countryAtSave ?? globalCountry)
      if (!resolvedCountryAtSave) return
      const episodePolicy = deriveSurfacePolicyFromEpisode(episode)
      applySurfacePolicy({ setPlayableContext, toDocked, toMini }, episodePolicy)

      void playFeedEpisodeWithDeps(
        { setAudioUrl, play, pause, setPlaybackTrackId },
        episode,
        podcast,
        {
          countryAtSave: resolvedCountryAtSave,
          mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
        }
      )
    },
    [
      resolveRequiredCountryAtSave,
      setAudioUrl,
      play,
      pause,
      setPlaybackTrackId,
      setPlayableContext,
      toDocked,
      toMini,
    ]
  )

  /**
   * Playback for SearchEpisode objects (from Global Search)
   */
  const playSearchEpisode = useCallback(
    (
      episode: SearchEpisode,
      countryAtSave?: string,
      options?: { mode?: PlaybackRequestMode }
    ) => {
      const globalCountry = useExploreStore.getState().country
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(countryAtSave ?? globalCountry)
      if (!resolvedCountryAtSave) return
      const searchPolicy = deriveSurfacePolicyFromSearchEpisode(episode)
      applySurfacePolicy({ setPlayableContext, toDocked, toMini }, searchPolicy)
      void (async () => {
        let podcastFeedUrl: string | undefined
        const podcastItunesId = String(episode.podcastItunesId || '').trim()

        if (podcastItunesId) {
          try {
            const podcast = await ensurePodcastDetail(queryClient, podcastItunesId, globalCountry)
            podcastFeedUrl = podcast?.feedUrl
          } catch {
            podcastFeedUrl = undefined
          }
        }

        await playSearchEpisodeWithDeps(
          { setAudioUrl, play, pause, setPlaybackTrackId },
          episode,
          {
            podcastFeedUrl,
            countryAtSave: resolvedCountryAtSave,
            mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
          }
        )
      })()
    },
    [
      queryClient,
      resolveRequiredCountryAtSave,
      setAudioUrl,
      play,
      pause,
      setPlaybackTrackId,
      setPlayableContext,
      toDocked,
      toMini,
    ]
  )

  /**
   * Playback for Favorite objects (from Favorites page)
   */
  const playFavorite = useCallback(
    (favorite: Favorite, countryAtSave?: string, options?: { mode?: PlaybackRequestMode }) => {
      const globalCountry = useExploreStore.getState().country
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(
        countryAtSave ?? favorite.countryAtSave ?? globalCountry
      )
      if (!resolvedCountryAtSave) return
      const favoritePolicy = deriveSurfacePolicyFromFavorite(favorite)
      applySurfacePolicy({ setPlayableContext, toDocked, toMini }, favoritePolicy)

      void playFavoriteWithDeps({ setAudioUrl, play, pause, setPlaybackTrackId }, favorite, {
        countryAtSave: resolvedCountryAtSave,
        mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
      })
    },
    [
      resolveRequiredCountryAtSave,
      setAudioUrl,
      play,
      pause,
      setPlaybackTrackId,
      setPlayableContext,
      toDocked,
      toMini,
    ]
  )

  return useMemo(
    () => ({ playEpisode, playSearchEpisode, playFavorite }),
    [playEpisode, playSearchEpisode, playFavorite]
  )
}
