import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/dateUtils'
import {
  type Favorite,
  type FileTrack,
  type PlaybackSession,
  type PodcastDownload,
  type Subscription,
} from '../lib/dexieDb'
import { formatFileSize } from '../lib/formatters'
import { loadLocalSearchDbSnapshot } from '../lib/localSearchService'
import { logError } from '../lib/logger'
import { useExploreStore } from '../store/exploreStore'

// ========== Types ==========

export type LocalSearchType = 'subscription' | 'favorite' | 'history' | 'file' | 'download'
export type LocalSearchBadge = 'subscription' | 'favorite' | 'history' | 'file' | 'download'

export interface LocalSearchResult {
  type: LocalSearchType
  id: string
  title: string
  subtitle: string
  artworkUrl?: string
  artworkBlob?: Blob
  extraSubtitle?: string
  badges: LocalSearchBadge[]
  data: Subscription | Favorite | PlaybackSession | FileTrack | PodcastDownload
}

export interface GlobalSearchLimits {
  subscriptionLimit: number
  favoriteLimit: number
  historyLimit: number
  fileLimit: number
}

const DEFAULT_LIMITS: GlobalSearchLimits = {
  subscriptionLimit: 5,
  favoriteLimit: 5,
  historyLimit: 5,
  fileLimit: 5,
}

const HISTORY_SCAN_CHUNK = 200
const HISTORY_SCAN_MAX = 1000
const LOCAL_FILE_SCAN_CHUNK = 200
const LOCAL_FILE_SCAN_MAX = 1000

const withinLimit = (count: number, limit: number) => limit === Infinity || count < limit
const sliceWithLimit = <T>(items: T[], limit: number) =>
  limit === Infinity ? items : items.slice(0, limit)

function buildCanonicalEpisodeResultKey(
  podcastItunesId: string | null | undefined,
  episodeGuid: string | null | undefined
): string | null {
  const normalizedPodcastItunesId = podcastItunesId?.trim() ?? ''
  const normalizedEpisodeGuid = episodeGuid?.trim() ?? ''
  if (!normalizedPodcastItunesId || !normalizedEpisodeGuid) return null
  return `canonical:${normalizedPodcastItunesId}:${normalizedEpisodeGuid}`
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debouncedValue
}

export function useLocalSearch(
  query: string,
  enabled = true,
  limits?: Partial<GlobalSearchLimits>
) {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const mergedLimits = { ...DEFAULT_LIMITS, ...limits }
  const { subscriptionLimit, favoriteLimit, historyLimit, fileLimit } = mergedLimits

  // Reactive Store Access
  const subscriptions = useExploreStore((s) => s.subscriptions)
  const favorites = useExploreStore((s) => s.favorites)
  const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded)
  const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded)
  const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions)
  const loadFavorites = useExploreStore((s) => s.loadFavorites)

  const normalizedQuery = query.toLowerCase().trim()
  const shouldSearch = enabled && normalizedQuery.length >= 2
  const debouncedQuery = useDebouncedValue(normalizedQuery, 200)
  const shouldSearchDb = enabled && debouncedQuery.length >= 2

  useEffect(() => {
    // DB results are already cleared in a separate effect
  }, [])

  // 1. Auto-load data if missing
  useEffect(() => {
    if (enabled) {
      if (!subscriptionsLoaded) loadSubscriptions()
      if (!favoritesLoaded) loadFavorites()
    }
  }, [enabled, subscriptionsLoaded, favoritesLoaded, loadSubscriptions, loadFavorites])

  // 2. Instant Memory Search (Reactive Store)
  const storeResults = useMemo<LocalSearchResult[]>(() => {
    if (!shouldSearch) return []

    const results: LocalSearchResult[] = []
    let subscriptionCount = 0
    let favoriteCount = 0

    for (const sub of subscriptions) {
      if (
        sub.title.toLowerCase().includes(normalizedQuery) ||
        sub.author.toLowerCase().includes(normalizedQuery)
      ) {
        if (!withinLimit(subscriptionCount, subscriptionLimit)) break
        results.push({
          type: 'subscription',
          id: `sub-${sub.podcastItunesId}`,
          title: sub.title,
          subtitle: sub.author,
          artworkUrl: sub.artworkUrl,
          extraSubtitle: t('badgeSubscribed'),
          badges: ['subscription'],
          data: sub,
        })
        subscriptionCount++
      }
    }

    for (const fav of favorites) {
      if (
        fav.episodeTitle.toLowerCase().includes(normalizedQuery) ||
        fav.podcastTitle.toLowerCase().includes(normalizedQuery)
      ) {
        if (!withinLimit(favoriteCount, favoriteLimit)) break
        results.push({
          type: 'favorite',
          id: `fav-${fav.key}`,
          title: fav.episodeTitle,
          subtitle: fav.podcastTitle,
          artworkUrl: fav.episodeArtworkUrl,
          extraSubtitle: t('badgeFavorited'),
          badges: ['favorite'],
          data: fav,
        })
        favoriteCount++
      }
    }

    return results
  }, [shouldSearch, normalizedQuery, subscriptions, favorites, subscriptionLimit, favoriteLimit, t])

  // 3. Debounced DB Search (History & files)
  const [dbResults, setDbResults] = useState<LocalSearchResult[]>([])
  const [isLoadingDb, setIsLoadingDb] = useState(false)

  useEffect(() => {
    if (!enabled || normalizedQuery.length < 2) {
      setDbResults([])
      setIsLoadingDb(false)
    }
  }, [enabled, normalizedQuery])

  useEffect(() => {
    if (!shouldSearchDb) return

    let isCancelled = false
    const querySnapshot = debouncedQuery
    setIsLoadingDb(true)

    const runSearch = async () => {
      try {
        const historyFetchLimit =
          historyLimit === Infinity ? HISTORY_SCAN_MAX : Math.max(historyLimit, HISTORY_SCAN_CHUNK)
        const fileFetchLimit =
          fileLimit === Infinity ? LOCAL_FILE_SCAN_MAX : Math.max(fileLimit, LOCAL_FILE_SCAN_CHUNK)

        // 1. Collect canonical favorite identities to look up matching remote history explicitly.
        const favoriteCanonicalIdentities = storeResults
          .filter((r) => r.type === 'favorite')
          .map((r) => r.data as Favorite)
          .map((favorite) => ({
            podcastItunesId: favorite.podcastItunesId,
            episodeGuid: favorite.episodeGuid,
          }))

        const snapshot = await loadLocalSearchDbSnapshot({
          query: querySnapshot,
          historyFetchLimit,
          fileFetchLimit,
          favoriteCanonicalIdentities,
        })

        if (isCancelled) return

        const historyResults: LocalSearchResult[] = sliceWithLimit(snapshot.sessions, historyLimit).map(
          (session) => ({
            type: 'history',
            id: `history-${session.id}`,
            title: session.title || t('unknownTitle'),
            subtitle:
              session.showTitle ||
              (session.source === 'local' ? t('historySourceLocal') : t('historySourcePodcast')),
            artworkUrl: session.artworkUrl,
            extraSubtitle: t('historyTitle'),
            badges: ['history'] as LocalSearchBadge[],
            data: session,
          })
        )

        const fileResults: LocalSearchResult[] = await Promise.all(
          sliceWithLimit(snapshot.tracks, fileLimit).map(async ({ track, artworkBlob }) => {
            const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
            const durationLabel = track.durationSeconds
              ? formatDuration(track.durationSeconds, t)
              : ''
            const subtitle = [sizeLabel, durationLabel].filter(Boolean).join(' • ')

            return {
              type: 'file' as const,
              id: `file-${track.id}`,
              title: track.name || t('untitledFile'),
              subtitle,
              artworkBlob,
              extraSubtitle: t('filesTitle'),
              badges: ['file'] as LocalSearchBadge[],
              data: track,
            }
          })
        )

        const downloadResults: LocalSearchResult[] = await Promise.all(
          sliceWithLimit(snapshot.downloads, fileLimit).map(async ({ download, artworkBlob }) => {
            const sizeLabel = formatFileSize(download.sizeBytes ?? 0, language)
            const durationLabel = download.durationSeconds
              ? formatDuration(download.durationSeconds, t)
              : ''
            const subtitle = [download.sourcePodcastTitle, sizeLabel, durationLabel]
              .filter(Boolean)
              .join(' • ')

            return {
              type: 'download' as const,
              id: `download-${download.id}`,
              title: download.sourceEpisodeTitle || download.name || t('untitledFile'),
              subtitle,
              artworkBlob,
              artworkUrl: download.sourceArtworkUrl,
              extraSubtitle: t('downloadsTitle'),
              badges: ['download'] as LocalSearchBadge[],
              data: download,
            }
          })
        )

        // Merge badges: only true local-file history should be folded into file results.
        const localTrackIdsWithHistory = new Set<string>()
        for (const h of historyResults) {
          const session = h.data as PlaybackSession
          if (session.source === 'local' && session.localTrackId) {
            localTrackIdsWithHistory.add(session.localTrackId)
          }
        }

        const mergedFileResults = fileResults.map((f) => {
          const track = f.data as import('../lib/dexieDb').FileTrack
          if (localTrackIdsWithHistory.has(track.id)) {
            return {
              ...f,
              badges: ['file', 'history'] as LocalSearchBadge[],
            }
          }
          return f
        })

        const nonLocalHistoryResults = historyResults.filter((h) => {
          const session = h.data as PlaybackSession
          return !(session.source === 'local' && session.localTrackId)
        })

        setDbResults([...nonLocalHistoryResults, ...mergedFileResults, ...downloadResults])
      } catch (err) {
        logError('[useLocalSearch] DB search error:', err)
        if (!isCancelled) {
          setDbResults([])
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDb(false)
        }
      }
    }

    void runSearch()

    return () => {
      isCancelled = true
    }
  }, [shouldSearchDb, debouncedQuery, historyLimit, fileLimit, t, language, storeResults])

  // Combine and Deduplicate Final Results
  const finalLocalResults = useMemo(() => {
    if (!shouldSearch) return []

    const resultsMap = new Map<string, LocalSearchResult>()

    const getUniqueKey = (item: LocalSearchResult): string => {
      if (item.type === 'subscription') {
        return `sub:${(item.data as Subscription).podcastItunesId}`
      }
      if (item.type === 'favorite') {
        const fav = item.data as Favorite
        const canonicalKey = buildCanonicalEpisodeResultKey(fav.podcastItunesId, fav.episodeGuid)
        return canonicalKey ?? `fav:${fav.key}`
      }
      if (item.type === 'history') {
        const session = item.data as PlaybackSession
        if (session.source === 'explore') {
          const canonicalKey = buildCanonicalEpisodeResultKey(
            session.podcastItunesId,
            session.episodeGuid
          )
          return canonicalKey ?? `history:${session.id}`
        }
        return `history:${session.id}`
      }
      if (item.type === 'file') return `file:${(item.data as FileTrack).id}`
      const download = item.data as PodcastDownload
      const canonicalKey = buildCanonicalEpisodeResultKey(
        download.sourcePodcastItunesId,
        download.sourceEpisodeGuid
      )
      return canonicalKey ?? item.id
    }

    // Process in order of priority: Subscriptions > Favorites > History > Files
    for (const res of storeResults) {
      const key = getUniqueKey(res)
      const existing = resultsMap.get(key)
      if (!existing) {
        resultsMap.set(key, res)
      } else {
        const newBadges = [...new Set([...existing.badges, ...res.badges])]
        resultsMap.set(key, { ...existing, badges: newBadges })
      }
    }

    for (const res of dbResults) {
      const key = getUniqueKey(res)
      const existing = resultsMap.get(key)
      if (!existing) {
        resultsMap.set(key, res)
      } else {
        const newBadges = [...new Set([...existing.badges, ...res.badges])]
        resultsMap.set(key, { ...existing, badges: newBadges })
      }
    }

    return Array.from(resultsMap.values())
  }, [shouldSearch, storeResults, dbResults])

  return {
    localResults: finalLocalResults,
    isLoading: isLoadingDb,
  }
}
