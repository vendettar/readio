/**
 * useEpisodeStatus (Instruction 124)
 *
 * Unified hook for determining episode playability and download status.
 * All pages (Explore, Search, Downloads) must use this hook.
 */

import { useCallback, useEffect, useMemo, useReducer, useState } from 'react'
import type { PodcastDownload } from '../lib/db/types'

import {
  DOWNLOAD_STATUS,
  type DownloadStatus,
  findDownloadedTrack,
  getStoredDownloadStatus,
  subscribeToDownloads,
  useDownloadProgressStore,
} from '../lib/downloadService'
import { normalizePodcastAudioUrl } from '../lib/networking/urlUtils'
import { useNetworkStatus } from './useNetworkStatus'

export interface EpisodeStatus {
  /** Whether the episode can be played right now */
  playable: boolean
  /** Current download status */
  downloadStatus: DownloadStatus
  /** Download progress percentage (0-100) */
  progress: number | null
  /** Download speed in bytes per second */
  speedBytesPerSecond: number | undefined
  /** If downloaded, the local track ID */
  localTrackId: string | null
  /** If not playable, reason for being disabled */
  disabledReason: 'offline_remote_only' | null
  /** The normalized URL for this episode */
  normalizedUrl: string
  /** Whether playing from local source */
  isLocal: boolean
  /** Whether the status is currently loading from DB */
  loading: boolean
  /** Refresh the status */
  refresh: () => void
}

/**
 * Determine the playability and download status of an episode.
 */
export function useEpisodeStatus(audioUrl: string | undefined | null): EpisodeStatus {
  const { isOnline } = useNetworkStatus()
  const [track, setTrack] = useState<PodcastDownload | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  // useReducer instead of useState for refresh trigger to avoid biome exhaustive-deps
  const [refreshToken, forceRefresh] = useReducer((c: number) => c + 1, 0)
  const progressMap = useDownloadProgressStore((state) => state.progressMap)

  const normalizedUrl = useMemo(
    () => (audioUrl ? normalizePodcastAudioUrl(audioUrl) : ''),
    [audioUrl]
  )

  const refresh = useCallback(() => {
    forceRefresh()
  }, [])

  useEffect(() => {
    // refreshToken is read to re-trigger query on refresh()
    void refreshToken

    if (!normalizedUrl) {
      setTrack(undefined)
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    findDownloadedTrack(normalizedUrl)
      .then((result) => {
        if (!cancelled) {
          setTrack(result)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrack(undefined)
          setLoading(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [normalizedUrl, refreshToken])

  useEffect(() => {
    const unsubscribe = subscribeToDownloads(() => {
      forceRefresh()
    })

    return unsubscribe
  }, [])

  const isLocal = !!track

  let downloadStatus: DownloadStatus = DOWNLOAD_STATUS.IDLE
  if (isLocal) {
    downloadStatus = DOWNLOAD_STATUS.DOWNLOADED
  } else if (normalizedUrl) {
    downloadStatus = getStoredDownloadStatus(normalizedUrl)
  }

  // When online, we can always attempt playback (optimistic/remote fallback).
  // When offline, we must wait for loading to finish to confirm if it's local.
  const playable = isOnline || (loading ? false : isLocal)

  const disabledReason: 'offline_remote_only' | null =
    !playable && !isOnline && !isLocal ? 'offline_remote_only' : null

  const currentProgress = normalizedUrl ? progressMap[normalizedUrl] : undefined

  return {
    playable,
    downloadStatus,
    progress: currentProgress?.percent ?? null,
    speedBytesPerSecond: currentProgress?.speedBytesPerSecond,
    localTrackId: track?.id ?? null,
    disabledReason,
    normalizedUrl,
    isLocal,
    loading,
    refresh,
  }
}
