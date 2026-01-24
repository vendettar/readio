import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { formatDuration } from '../lib/dateUtils'
import {
  DB,
  type Favorite,
  type FileTrack,
  type PlaybackSession,
  type Subscription,
} from '../lib/dexieDb'
import { formatFileSize } from '../lib/formatters'
import { logError } from '../lib/logger'
import { useExploreStore } from '../store/exploreStore'

// ========== Types ==========

export type LocalSearchBadge = 'subscription' | 'favorite' | 'history' | 'file'

export interface LocalSearchResult {
  type: 'subscription' | 'favorite' | 'history' | 'file'
  id: string
  title: string
  subtitle: string
  artworkUrl?: string
  extraSubtitle?: string
  badges: LocalSearchBadge[]
  data: Subscription | Favorite | PlaybackSession | FileTrack
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

  // Cache for artwork blob URLs to prevent re-creation and flickering
  const artworkUrlCacheRef = useRef<Map<string, string>>(new Map())
  const lastQueryRef = useRef<string>('')

  const revokeArtworkCache = useCallback(() => {
    for (const url of artworkUrlCacheRef.current.values()) {
      URL.revokeObjectURL(url)
    }
    artworkUrlCacheRef.current.clear()
  }, [])

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
    if (!enabled || normalizedQuery.length < 2) {
      revokeArtworkCache()
    }
  }, [enabled, normalizedQuery, revokeArtworkCache])

  useEffect(() => {
    if (lastQueryRef.current && lastQueryRef.current !== debouncedQuery) {
      revokeArtworkCache()
    }
    lastQueryRef.current = debouncedQuery
  }, [debouncedQuery, revokeArtworkCache])

  useEffect(() => {
    return () => {
      revokeArtworkCache()
    }
  }, [revokeArtworkCache])

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
        (sub.title || '').toLowerCase().includes(normalizedQuery) ||
        (sub.author || '').toLowerCase().includes(normalizedQuery)
      ) {
        if (!withinLimit(subscriptionCount, subscriptionLimit)) break
        results.push({
          type: 'subscription',
          id: `sub-${sub.feedUrl}`,
          title: sub.title || t('unknownPodcast'),
          subtitle: sub.author || t('unknownArtist'),
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
        (fav.episodeTitle || '').toLowerCase().includes(normalizedQuery) ||
        (fav.podcastTitle || '').toLowerCase().includes(normalizedQuery)
      ) {
        if (!withinLimit(favoriteCount, favoriteLimit)) break
        results.push({
          type: 'favorite',
          id: `fav-${fav.key}`,
          title: fav.episodeTitle || t('unknownEpisode'),
          subtitle: fav.podcastTitle || t('unknownPodcast'),
          artworkUrl: fav.episodeArtworkUrl || fav.artworkUrl,
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

  // Cleanup artwork URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      artworkUrlCacheRef.current.forEach((url) => {
        URL.revokeObjectURL(url)
      })
      artworkUrlCacheRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!enabled || normalizedQuery.length < 2) {
      setDbResults([])
      setIsLoadingDb(false)
      // Clear cache when search is disabled or query cleared
      if (artworkUrlCacheRef.current.size > 0) {
        artworkUrlCacheRef.current.forEach((url) => {
          URL.revokeObjectURL(url)
        })
        artworkUrlCacheRef.current.clear()
      }
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

        // 1. Collect audioUrls from Favorites to look up their history explicitly
        const favoriteAudioUrls = storeResults
          .filter((r) => r.type === 'favorite')
          .map((r) => (r.data as Favorite).audioUrl)
          .filter((url) => typeof url === 'string' && url.length > 0)

        const [titleSessions, tracks, favSessions] = await Promise.all([
          DB.searchPlaybackSessionsByTitle(querySnapshot, historyFetchLimit),
          DB.searchFileTracksByName(querySnapshot, fileFetchLimit),
          favoriteAudioUrls.length > 0
            ? DB.searchSessionsByAudioUrls(favoriteAudioUrls)
            : Promise.resolve([] as PlaybackSession[]),
        ])

        // Merge title-matched sessions and favorite-matched sessions (deduplicated by ID)
        const sessionMap = new Map<string, PlaybackSession>()
        for (const s of titleSessions) sessionMap.set(s.id, s)
        for (const s of favSessions) sessionMap.set(s.id, s)
        const sessions = Array.from(sessionMap.values())

        if (isCancelled) return

        const historyResults: LocalSearchResult[] = sliceWithLimit(sessions, historyLimit).map(
          (session) => ({
            type: 'history',
            id: `history-${session.id}`,
            title: session.title || t('unknownTitle'),
            subtitle:
              session.podcastTitle ||
              (session.source === 'local' ? t('historySourceLocal') : t('historySourcePodcast')),
            artworkUrl: session.artworkUrl,
            extraSubtitle: t('historyTitle'),
            badges: ['history'] as LocalSearchBadge[],
            data: session,
          })
        )

        const fileResults: LocalSearchResult[] = await Promise.all(
          sliceWithLimit(tracks, fileLimit).map(async (item) => {
            const track = item as FileTrack
            const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language)
            const durationLabel = track.durationSeconds
              ? formatDuration(track.durationSeconds, t)
              : ''
            const subtitle = [sizeLabel, durationLabel].filter(Boolean).join(' • ')

            // Fetch artwork blob if available, using cache to prevent flickering
            let artworkUrl: string | undefined
            if (track.artworkId) {
              const cached = artworkUrlCacheRef.current.get(track.artworkId)
              if (cached) {
                artworkUrl = cached
              } else {
                try {
                  const artworkBlob = await DB.getAudioBlob(track.artworkId)
                  if (artworkBlob) {
                    artworkUrl = URL.createObjectURL(artworkBlob.blob)
                    artworkUrlCacheRef.current.set(track.artworkId, artworkUrl)
                  }
                } catch {
                  // Best-effort: silently continue without artwork
                }
              }
            }

            return {
              type: 'file' as const,
              id: `file-${track.id}`,
              title: track.name || t('untitledFile'),
              subtitle,
              artworkUrl,
              extraSubtitle: t('filesTitle'),
              badges: ['file'] as LocalSearchBadge[],
              data: track,
            }
          })
        )

        // Merge badges: if a local file has a corresponding history entry, add 'history' badge to the file result
        const localTrackIdsWithHistory = new Set<string>()
        for (const h of historyResults) {
          const session = h.data as PlaybackSession
          if (session.localTrackId) {
            localTrackIdsWithHistory.add(session.localTrackId)
          }
        }

        const mergedFileResults = fileResults.map((f) => {
          const track = f.data as FileTrack
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
          return !session.localTrackId
        })

        setDbResults([...nonLocalHistoryResults, ...mergedFileResults])
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
      if (item.type === 'subscription') return `sub:${(item.data as Subscription).feedUrl}`
      if (item.type === 'favorite') {
        const fav = item.data as Favorite
        return `audio:${fav.audioUrl}`
      }
      if (item.type === 'history') {
        const session = item.data as PlaybackSession
        if (session.audioUrl) return `audio:${session.audioUrl}`
        if (session.episodeId) return `episode:${session.episodeId}`
        return `history:${session.id}`
      }
      if (item.type === 'file') return `file:${(item.data as FileTrack).id}`
      return item.id
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
