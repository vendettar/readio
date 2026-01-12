// src/hooks/useGlobalSearch.ts
// Unified search hook combining iTunes API and local IndexedDB content

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    searchPodcasts,
    searchEpisodes,
    type Podcast,
    type SearchEpisode
} from '../libs/discoveryProvider';
import { DB, type Subscription, type Favorite, type PlaybackSession, type FileTrack } from '../libs/dexieDb';
import { useExploreStore } from '../store/exploreStore';
import { getAppConfig } from '../libs/runtimeConfig';
import { useI18n } from './useI18n';
import { formatFileSize } from '../libs/formatters';
import { formatDuration } from '../libs/dateUtils';

// ========== Types ==========

export interface LocalSearchResult {
    type: 'subscription' | 'favorite' | 'history' | 'file';
    id: string;
    title: string;
    subtitle: string;
    artworkUrl?: string;
    data: Subscription | Favorite | PlaybackSession | FileTrack;
}

export interface GlobalSearchResults {
    podcasts: Podcast[];
    episodes: SearchEpisode[];
    local: LocalSearchResult[];
    isLoading: boolean;
    isEmpty: boolean;
}

interface GlobalSearchLimits {
    subscriptionLimit: number;
    favoriteLimit: number;
    historyLimit: number;
    fileLimit: number;
}

const DEFAULT_LIMITS: GlobalSearchLimits = {
    subscriptionLimit: 5,
    favoriteLimit: 5,
    historyLimit: 5,
    fileLimit: 5,
};

const HISTORY_SCAN_CHUNK = 200;
const HISTORY_SCAN_MAX = 1000;
const LOCAL_FILE_SCAN_CHUNK = 200;
const LOCAL_FILE_SCAN_MAX = 1000;

const withinLimit = (count: number, limit: number) => limit === Infinity || count < limit;
const sliceWithLimit = <T>(items: T[], limit: number) => (limit === Infinity ? items : items.slice(0, limit));
const useDebouncedValue = <T,>(value: T, delayMs: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
        return () => clearTimeout(timer);
    }, [value, delayMs]);

    return debouncedValue;
};

// ========== Hook ==========

export function useGlobalSearch(query: string, enabled = true, limits?: Partial<GlobalSearchLimits>) {
    const { t, language } = useI18n();
    const country = useExploreStore((s) => s.country) || getAppConfig().DEFAULT_COUNTRY;
    const mergedLimits = { ...DEFAULT_LIMITS, ...limits };
    const { subscriptionLimit, favoriteLimit, historyLimit, fileLimit } = mergedLimits;

    // Reactive Store Access
    const subscriptions = useExploreStore((s) => s.subscriptions);
    const favorites = useExploreStore((s) => s.favorites);
    const subscriptionsLoaded = useExploreStore((s) => s.subscriptionsLoaded);
    const favoritesLoaded = useExploreStore((s) => s.favoritesLoaded);
    const loadSubscriptions = useExploreStore((s) => s.loadSubscriptions);
    const loadFavorites = useExploreStore((s) => s.loadFavorites);

    const normalizedQuery = query.toLowerCase().trim();
    const shouldSearch = enabled && normalizedQuery.length >= 2;
    const debouncedQuery = useDebouncedValue(normalizedQuery, 200);
    const shouldSearchDb = enabled && debouncedQuery.length >= 2;

    // 1. Auto-load data if missing
    useEffect(() => {
        if (enabled) {
            if (!subscriptionsLoaded) loadSubscriptions();
            if (!favoritesLoaded) loadFavorites();
        }
    }, [enabled, subscriptionsLoaded, favoritesLoaded, loadSubscriptions, loadFavorites]);

    // iTunes Podcast Search
    const {
        data: podcasts = [],
        isLoading: isLoadingPodcasts,
    } = useQuery({
        queryKey: ['globalSearch', 'podcasts', normalizedQuery, country],
        queryFn: ({ signal }) => searchPodcasts(normalizedQuery, country, 20, signal),
        enabled: shouldSearch,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });

    // iTunes Episode Search
    const {
        data: episodes = [],
        isLoading: isLoadingEpisodes,
    } = useQuery({
        queryKey: ['globalSearch', 'episodes', normalizedQuery, country],
        queryFn: ({ signal }) => searchEpisodes(normalizedQuery, country, 50, signal),
        enabled: shouldSearch,
        staleTime: 5 * 60 * 1000,
        placeholderData: (prev) => prev,
    });

    // 2. Instant Memory Search (Reactive Store)
    const storeResults = useMemo<LocalSearchResult[]>(() => {
        if (!shouldSearch) return [];

        const results: LocalSearchResult[] = [];
        let subscriptionCount = 0;
        let favoriteCount = 0;

        for (const sub of subscriptions) {
            if (
                (sub.title || '').toLowerCase().includes(normalizedQuery) ||
                (sub.author || '').toLowerCase().includes(normalizedQuery)
            ) {
                if (!withinLimit(subscriptionCount, subscriptionLimit)) break;
                results.push({
                    type: 'subscription',
                    id: `sub-${sub.feedUrl}`,
                    title: sub.title || t('unknownPodcast'),
                    subtitle: sub.author || t('unknownArtist'),
                    artworkUrl: sub.artworkUrl,
                    data: sub,
                });
                subscriptionCount++;
            }
        }

        for (const fav of favorites) {
            if (
                (fav.episodeTitle || '').toLowerCase().includes(normalizedQuery) ||
                (fav.podcastTitle || '').toLowerCase().includes(normalizedQuery)
            ) {
                if (!withinLimit(favoriteCount, favoriteLimit)) break;
                results.push({
                    type: 'favorite',
                    id: `fav-${fav.key}`,
                    title: fav.episodeTitle || t('unknownEpisode'),
                    subtitle: fav.podcastTitle || t('unknownPodcast'),
                    artworkUrl: fav.artworkUrl,
                    data: fav,
                });
                favoriteCount++;
            }
        }

        return results;
    }, [shouldSearch, normalizedQuery, subscriptions, favorites, subscriptionLimit, favoriteLimit, t]);

    // 3. Debounced DB Search (History & files)
    const [dbResults, setDbResults] = useState<LocalSearchResult[]>([]);
    const [isLoadingDb, setIsLoadingDb] = useState(false);

    useEffect(() => {
        if (!enabled || normalizedQuery.length < 2) {
            setDbResults([]);
            setIsLoadingDb(false);
        }
    }, [enabled, normalizedQuery]);

    useEffect(() => {
        if (!shouldSearchDb) return;

        let isCancelled = false;
        const querySnapshot = debouncedQuery;
        setIsLoadingDb(true);

        const runSearch = async () => {
            try {
                const historyFetchLimit = historyLimit === Infinity
                    ? HISTORY_SCAN_MAX
                    : Math.max(historyLimit, HISTORY_SCAN_CHUNK);
                const fileFetchLimit = fileLimit === Infinity
                    ? LOCAL_FILE_SCAN_MAX
                    : Math.max(fileLimit, LOCAL_FILE_SCAN_CHUNK);

                const [sessions, tracks] = await Promise.all([
                    DB.searchPlaybackSessionsByTitle(querySnapshot, historyFetchLimit),
                    DB.searchFileTracksByName(querySnapshot, fileFetchLimit),
                ]);

                if (isCancelled) return;

                const historyResults: LocalSearchResult[] = sliceWithLimit(sessions, historyLimit).map((session) => ({
                    type: 'history',
                    id: `history-${session.id}`,
                    title: session.title || t('unknownTitle'),
                    subtitle: session.source === 'local' ? t('historySourceLocal') : t('historySourcePodcast'),
                    data: session,
                }));

                const fileResults: LocalSearchResult[] = sliceWithLimit(tracks, fileLimit).map((track) => {
                    const sizeLabel = formatFileSize(track.sizeBytes ?? 0, language);
                    const durationLabel = track.durationSeconds ? formatDuration(track.durationSeconds, t) : '';
                    const subtitle = [sizeLabel, durationLabel].filter(Boolean).join(' • ');
                    return {
                        type: 'file',
                        id: `file-${track.id}`,
                        title: track.name || t('untitledFile'),
                        subtitle,
                        data: track,
                    };
                });

                setDbResults([...historyResults, ...fileResults]);
            } catch (err) {
                console.error('[useGlobalSearch] DB search error:', err);
                if (!isCancelled) {
                    setDbResults([]);
                }
            } finally {
                if (!isCancelled) {
                    setIsLoadingDb(false);
                }
            }
        };

        void runSearch();

        return () => {
            isCancelled = true;
        };
    }, [shouldSearchDb, debouncedQuery, historyLimit, fileLimit, t, language]);

    const isLoading = isLoadingPodcasts || isLoadingEpisodes || isLoadingDb;

    // Combine and Memoize Final Results
    const finalLocalResults = useMemo(() => {
        if (!shouldSearch) return [];
        return [...storeResults, ...dbResults];
    }, [shouldSearch, storeResults, dbResults]);

    const isEmpty = !isLoading &&
        podcasts.length === 0 &&
        episodes.length === 0 &&
        finalLocalResults.length === 0;

    return useMemo<GlobalSearchResults>(() => ({
        podcasts,
        episodes,
        local: finalLocalResults,
        isLoading,
        isEmpty,
    }), [podcasts, episodes, finalLocalResults, isLoading, isEmpty]);
}
