// src/libs/recommended/sources.ts
import { fetchTextWithFallback, fetchJsonWithFallback } from '../fetchUtils';
import { deduplicatedFetch, getRequestKey } from '../requestManager';
import { type RecommendedPodcast } from './types';
import { readChartCacheWithStatus, writeChartCache, readLookupCache, writeLookupCache } from './cache';
import { getAppConfig } from '../runtimeConfig';

export async function fetchDiscoveryChartIds(country: string, limit: number = 50, signal?: AbortSignal): Promise<string[]> {
    const config = getAppConfig();
    const url = `${config.RSS_FEED_BASE_URL}/${country}/podcasts/top/${limit}/podcasts.json`;
    const cached = readChartCacheWithStatus(country);
    if (cached && cached.ids.length > 0 && cached.status === 'fresh') {
        return cached.ids;
    }

    const requestKey = getRequestKey(url);
    try {
        return await deduplicatedFetch<string[]>(requestKey, async (fetchSignal) => {
            const controller = new AbortController();
            if (signal) signal.addEventListener('abort', () => controller.abort());
            fetchSignal.addEventListener('abort', () => controller.abort());

            const contents = await fetchTextWithFallback(url, { signal: controller.signal });
            const data = JSON.parse(contents);
            const results = data?.feed?.results;
            if (!Array.isArray(results)) throw new Error('Invalid data format');

            const chartIds = results.map((item: { id?: string }) => String(item.id || '')).filter(Boolean);
            writeChartCache(country, chartIds);
            return chartIds;
        });
    } catch (error) {
        if (cached && cached.ids.length > 0) return cached.ids;
        throw error;
    }
}

export async function lookupPodcastsByIds(ids: string[], country: string, signal?: AbortSignal): Promise<RecommendedPodcast[]> {
    if (ids.length === 0) return [];
    const cached = readLookupCache(country);
    if (cached) {
        const found = ids.map(id => cached[id]).filter(Boolean);
        if (found.length === ids.length) return found;
    }

    const batchIds = ids.slice(0, 200);
    const config = getAppConfig();
    const url = `${config.ITUNES_LOOKUP_URL}?id=${batchIds.join(',')}&entity=podcast&country=${country}`;
    const requestKey = getRequestKey(url);

    return deduplicatedFetch<RecommendedPodcast[]>(requestKey, async (fetchSignal) => {
        const controller = new AbortController();
        if (signal) signal.addEventListener('abort', () => controller.abort());
        fetchSignal.addEventListener('abort', () => controller.abort());

        interface LookupResponse { results?: Record<string, unknown>[]; }
        const data = await fetchJsonWithFallback<LookupResponse>(url, { signal: controller.signal });
        const results = Array.isArray(data?.results) ? data.results : [];

        const podcasts: RecommendedPodcast[] = [];
        const entries: Record<string, RecommendedPodcast> = cached || {};

        results.forEach((item: Record<string, unknown>) => {
            const id = String(item.collectionId || item.trackId || '');
            if (!id) return;
            const podcast: RecommendedPodcast = {
                id,
                title: String(item.collectionName || item.trackName || ''),
                author: String(item.artistName || ''),
                artworkUrl: String(item.artworkUrl600 || item.artworkUrl100 || ''),
                feedUrl: String(item.feedUrl || ''),
                genreNames: Array.isArray(item.genres) ? item.genres as string[] : [],
            };
            if (podcast.feedUrl && podcast.title) {
                podcasts.push(podcast);
                entries[id] = podcast;
            }
        });

        writeLookupCache(country, entries);
        return podcasts;
    });
}

export async function fetchTopPodcastsFromSource(country: string, limit: number = 50, signal?: AbortSignal): Promise<RecommendedPodcast[]> {
    const ids = await fetchDiscoveryChartIds(country, limit, signal);
    return lookupPodcastsByIds(ids, country, signal);
}
