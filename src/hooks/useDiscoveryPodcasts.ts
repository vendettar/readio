// src/hooks/useDiscoveryPodcasts.ts
// TanStack Query hooks for Explore page data fetching

import { useQuery } from '@tanstack/react-query';
import {
    fetchTopPodcasts,
    fetchTopEpisodes,
    lookupPodcastsByIds,
    fetchTopSubscriberPodcasts,
    lookupPodcastFull,
    type DiscoveryPodcast,
} from '../libs/discoveryProvider';
import { getAppConfig } from '../libs/runtimeConfig';
import { getEditorPicksForRegion } from '../constants/app';

// ========== CONFIGURATION ==========
const config = getAppConfig();
const USE_MOCK_DATA = config.USE_MOCK_DATA;

// Mock data generator
function generateMockPodcasts(count: number, prefix: string = 'Podcast'): DiscoveryPodcast[] {
    return Array.from({ length: count }, (_, i) => ({
        id: `mock-${prefix}-${i + 1}`,
        name: `${prefix} ${i + 1}`,
        artistName: `Artist ${i + 1}`,
        artworkUrl100: `https://picsum.photos/seed/${prefix}${i}/200/200`,
        url: '#',
        genres: [{ genreId: '1', name: 'Mock Genre', url: '' }],
    }));
}

const MOCK_TOP_PODCASTS = generateMockPodcasts(30, 'Top Show');
const MOCK_EDITOR_PICKS = generateMockPodcasts(30, 'Editor Pick');
const MOCK_TOP_EPISODES = generateMockPodcasts(30, 'Episode');
const MOCK_SUBSCRIBER_PODCASTS = generateMockPodcasts(30, 'Subscriber Show');

// Query keys
const QUERY_KEYS = {
    topPodcasts: (country: string) => ['topPodcasts', country] as const,
    editorPicks: (country: string) => ['editorPicks', country] as const,
};

/**
 * Hook for fetching Top Podcasts (overall chart)
 */
export function useTopPodcasts(country: string = 'us', limit: number = 25) {
    return useQuery({
        queryKey: QUERY_KEYS.topPodcasts(country),
        queryFn: ({ signal }) => {
            if (USE_MOCK_DATA) return Promise.resolve(MOCK_TOP_PODCASTS.slice(0, limit));
            return fetchTopPodcasts(country, limit, signal);
        },
        staleTime: 12 * 60 * 60 * 1000, // 12 hours
        gcTime: 72 * 60 * 60 * 1000, // 72 hours
        retry: USE_MOCK_DATA ? 0 : 2,
    });
}


/**
 * Hook for fetching Editor's Picks (curated list by region)
 * Returns empty array if region has no configured picks
 */
export function useEditorPicks(country: string = 'us') {
    return useQuery({
        queryKey: QUERY_KEYS.editorPicks(country),
        queryFn: async ({ signal }) => {
            if (USE_MOCK_DATA) return MOCK_EDITOR_PICKS;

            // Get region-specific Editor's Picks
            const picksIds = getEditorPicksForRegion(country);

            // If region has no configured picks, return empty array
            if (!picksIds || picksIds.length === 0) {
                return [];
            }

            return lookupPodcastsByIds([...picksIds], country, signal);
        },
        staleTime: 24 * 60 * 60 * 1000, // 24 hours (Editor's Picks change very slowly)
        gcTime: 72 * 60 * 60 * 1000,
        retry: USE_MOCK_DATA ? 0 : 2,
    });
}

/**
 * Hook for fetching Top Episodes
 */
export function useTopEpisodes(country: string = 'us', limit: number = 25) {
    return useQuery({
        queryKey: ['topEpisodes', country],
        queryFn: ({ signal }) => {
            if (USE_MOCK_DATA) return Promise.resolve(MOCK_TOP_EPISODES.slice(0, limit));
            return fetchTopEpisodes(country, limit, signal);
        },
        staleTime: 12 * 60 * 60 * 1000,
        gcTime: 72 * 60 * 60 * 1000,
        retry: USE_MOCK_DATA ? 0 : 2,
    });
}


/**
 * Hook for fetching Top Subscriber Podcasts
 */
export function useTopSubscriberPodcasts(country: string = 'us', limit: number = 25) {
    return useQuery({
        queryKey: ['topSubscriberPodcasts', country],
        queryFn: ({ signal }) => {
            if (USE_MOCK_DATA) return Promise.resolve(MOCK_SUBSCRIBER_PODCASTS.slice(0, limit));
            return fetchTopSubscriberPodcasts(country, limit, signal);
        },
        staleTime: 12 * 60 * 60 * 1000,
        gcTime: 72 * 60 * 60 * 1000,
        retry: USE_MOCK_DATA ? 0 : 2,
    });
}

// Re-export types and utils
export { lookupPodcastFull };
export type { DiscoveryPodcast };
