import { useCallback, useMemo } from 'react'
import type { Favorite } from '../lib/dexieDb'
import type { Episode, Podcast, SearchEpisode } from '../lib/discovery'
import { logError } from '../lib/logger'
import { PLAYBACK_REQUEST_MODE, type PlaybackRequestMode } from '../lib/player/playbackMode'
import {
  playEpisodeWithDeps,
  playFavoriteWithDeps,
  playSearchEpisodeWithDeps,
} from '../lib/player/remotePlayback'
import {
  applySurfacePolicy,
  deriveSurfacePolicyFromEpisode,
  deriveSurfacePolicyFromFavorite,
  deriveSurfacePolicyFromSearchEpisode,
} from '../lib/player/surfacePolicy'
import { normalizeCountryParam, type SupportedCountry } from '../lib/routes/podcastRoutes'
import { usePlayerStore } from '../store/playerStore'
import { usePlayerSurfaceStore } from '../store/playerSurfaceStore'

export function useEpisodePlayback() {
  const setAudioUrl = usePlayerStore((state) => state.setAudioUrl)
  const play = usePlayerStore((state) => state.play)

  const setPlayableContext = usePlayerSurfaceStore((state) => state.setPlayableContext)
  const toDocked = usePlayerSurfaceStore((state) => state.toDocked)
  const toMini = usePlayerSurfaceStore((state) => state.toMini)
  const pause = usePlayerStore((state) => state.pause)
  const setPlaybackTrackId = usePlayerStore((state) => state.setPlaybackTrackId)

  const resolveRequiredCountryAtSave = useCallback(
    (candidate?: string): SupportedCountry | null => {
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
   * Standard playback for canonical Episode + Podcast objects
   */
  const playEpisode = useCallback(
    (
      episode: Episode,
      podcast: Podcast,
      countryAtSave: string,
      options?: { mode?: PlaybackRequestMode }
    ) => {
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(countryAtSave)
      if (!resolvedCountryAtSave) return
      void (async () => {
        const startResult = await playEpisodeWithDeps(
          { setAudioUrl, play, pause, setPlaybackTrackId },
          episode,
          podcast,
          {
            countryAtSave: resolvedCountryAtSave,
            mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
          }
        )
        if (!startResult.started) return
        const episodePolicy = deriveSurfacePolicyFromEpisode(episode)
        applySurfacePolicy({ setPlayableContext, toDocked, toMini }, episodePolicy)
      })()
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
    (episode: SearchEpisode, countryAtSave: string, options?: { mode?: PlaybackRequestMode }) => {
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(countryAtSave)
      if (!resolvedCountryAtSave) return
      void (async () => {
        const startResult = await playSearchEpisodeWithDeps(
          { setAudioUrl, play, pause, setPlaybackTrackId },
          episode,
          {
            countryAtSave: resolvedCountryAtSave,
            mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
          }
        )
        if (!startResult.started) return
        const searchPolicy = deriveSurfacePolicyFromSearchEpisode(episode)
        applySurfacePolicy({ setPlayableContext, toDocked, toMini }, searchPolicy)
      })()
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
   * Playback for Favorite objects (from Favorites page)
   */
  const playFavorite = useCallback(
    (favorite: Favorite, countryAtSave: string, options?: { mode?: PlaybackRequestMode }) => {
      const resolvedCountryAtSave = resolveRequiredCountryAtSave(countryAtSave)
      if (!resolvedCountryAtSave) return
      void (async () => {
        const startResult = await playFavoriteWithDeps(
          { setAudioUrl, play, pause, setPlaybackTrackId },
          favorite,
          {
            countryAtSave: resolvedCountryAtSave,
            mode: options?.mode ?? PLAYBACK_REQUEST_MODE.DEFAULT,
          }
        )
        if (!startResult.started) return
        const favoritePolicy = deriveSurfacePolicyFromFavorite(favorite)
        applySurfacePolicy({ setPlayableContext, toDocked, toMini }, favoritePolicy)
      })()
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
