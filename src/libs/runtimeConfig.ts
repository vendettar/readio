// src/libs/runtimeConfig.ts
/**
 * Unified access to runtime and build-time configuration
 */


declare global {
    interface Window {
        __READIO_ENV__?: {
            // Basic Info
            READIO_APP_NAME?: string;
            READIO_APP_VERSION?: string;

            // Overrides
            READIO_CORS_PROXY_URL?: string;
            READIO_CORS_PROXY_PRIMARY?: boolean | string;
            READIO_USE_MOCK?: boolean | string;

            // System Defaults
            READIO_DEFAULT_CORS_PROXY?: string;
            READIO_DEFAULT_TIMEOUT_MS?: number | string;
            READIO_MAX_CONCURRENT_REQUESTS?: number | string;
            READIO_DB_NAME?: string;

            // External APIs
            READIO_DICT_API_URL?: string;
            READIO_ITUNES_LOOKUP_URL?: string;
            READIO_ITUNES_SEARCH_URL?: string;
            READIO_RSS_FEED_BASE_URL?: string;

            // Limits
            READIO_MAX_AUDIO_SIZE_MB?: number | string;
            READIO_DICT_CACHE_MAX_ENTRIES?: number | string;
            READIO_DICT_CACHE_KEY?: string;
            READIO_SAVE_PROGRESS_INTERVAL_MS?: number | string;

            // UI
            READIO_MIN_ZOOM?: number | string;
            READIO_MAX_ZOOM?: number | string;
            READIO_ZOOM_STEP?: number | string;
            READIO_ZOOM_HIDE_DELAY_MS?: number | string;
            READIO_CLICK_DELAY_MS?: number | string;

            // Localization
            READIO_DEFAULT_LANG?: string;
            READIO_DEFAULT_COUNTRY?: string;

            // Assets
            READIO_FALLBACK_PODCAST_IMAGE?: string;

            // TTLs
            READIO_CACHE_TTL_EPISODES_MS?: number | string;
            READIO_RECOMMENDED_TTL_MS?: number | string;
        };
    }
}

/**
 * Gets the consolidated app configuration.
 */
export function getAppConfig() {
    const env = (typeof window !== 'undefined' && window.__READIO_ENV__) || {};

    const num = (val: unknown, fallback: number) => {
        const parsed = Number(val);
        return isNaN(parsed) ? fallback : parsed;
    };

    return {
        APP_NAME: env.READIO_APP_NAME || 'Readio',
        APP_VERSION: env.READIO_APP_VERSION || '1.0.0',

        // Proxy & Network
        READIO_CORS_PROXY_URL: env.READIO_CORS_PROXY_URL || '',
        READIO_CORS_PROXY_PRIMARY: String(env.READIO_CORS_PROXY_PRIMARY) === 'true',
        DEFAULT_CORS_PROXY: env.READIO_DEFAULT_CORS_PROXY || 'https://api.allorigins.win',
        DEFAULT_TIMEOUT_MS: num(env.READIO_DEFAULT_TIMEOUT_MS, 15000),
        MAX_CONCURRENT_REQUESTS: num(env.READIO_MAX_CONCURRENT_REQUESTS, 6),
        DB_NAME: env.READIO_DB_NAME || 'readio-v2',

        // External APIs
        DICT_API_URL: env.READIO_DICT_API_URL || 'https://api.dictionaryapi.dev/api/v2/entries/en/',
        ITUNES_LOOKUP_URL: env.READIO_ITUNES_LOOKUP_URL || 'https://itunes.apple.com/lookup',
        ITUNES_SEARCH_URL: env.READIO_ITUNES_SEARCH_URL || 'https://itunes.apple.com/search',
        RSS_FEED_BASE_URL: env.READIO_RSS_FEED_BASE_URL || 'https://rss.applemarketingtools.com/api/v2',

        // Limits
        MAX_AUDIO_SIZE_MB: num(env.READIO_MAX_AUDIO_SIZE_MB, 300),
        DICT_CACHE_MAX_ENTRIES: num(env.READIO_DICT_CACHE_MAX_ENTRIES, 500),
        DICT_CACHE_KEY: env.READIO_DICT_CACHE_KEY || 'readio_dict_cache_v2',
        SAVE_PROGRESS_INTERVAL_MS: num(env.READIO_SAVE_PROGRESS_INTERVAL_MS, 5000),

        // UI
        MIN_ZOOM: num(env.READIO_MIN_ZOOM, 0.5),
        MAX_ZOOM: num(env.READIO_MAX_ZOOM, 3.0),
        ZOOM_STEP: num(env.READIO_ZOOM_STEP, 0.1),
        ZOOM_HIDE_DELAY_MS: num(env.READIO_ZOOM_HIDE_DELAY_MS, 2000),
        CLICK_DELAY_MS: num(env.READIO_CLICK_DELAY_MS, 240),

        // Localization
        DEFAULT_LANG: env.READIO_DEFAULT_LANG || 'en',
        DEFAULT_COUNTRY: env.READIO_DEFAULT_COUNTRY || 'us',

        // Assets
        FALLBACK_PODCAST_IMAGE: env.READIO_FALLBACK_PODCAST_IMAGE || '/placeholder-podcast.svg',

        // TTLs
        CACHE_TTL_EPISODES_MS: num(env.READIO_CACHE_TTL_EPISODES_MS, 3600000),
        RECOMMENDED_TTL_MS: num(env.READIO_RECOMMENDED_TTL_MS, 86400000),

        // Legacy / Mock
        USE_MOCK_DATA: import.meta.env.VITE_USE_MOCK_DATA === 'true' || String(env.READIO_USE_MOCK) === 'true',
    };
}
