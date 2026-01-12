/**
 * Readio Runtime Configuration (Defaults)
 *
 * This file contains safe defaults and is committed to Git.
 *
 * LOCAL CUSTOMIZATION:
 * Create a file named `env.local.js` (NOT committed to Git) to override:
 *
 *   window.__READIO_ENV__ = {
 *     ...window.__READIO_ENV__,
 *     READIO_CORS_PROXY_URL: 'https://your-proxy.com',
 *     READIO_CORS_PROXY_PRIMARY: true,
 *   };
 *
 * See env.local.js.example for a template.
 */

window.__READIO_ENV__ = window.__READIO_ENV__ || {
  // --- Basic Info ---
  READIO_APP_NAME: 'Readio',
  READIO_APP_VERSION: '1.0.0',

  // --- Proxy & Network ---
  READIO_CORS_PROXY_URL: '',
  READIO_CORS_PROXY_PRIMARY: false,
  READIO_DEFAULT_CORS_PROXY: 'https://api.allorigins.win',
  READIO_DEFAULT_TIMEOUT_MS: 15000,
  READIO_MAX_CONCURRENT_REQUESTS: 6,
  READIO_DB_NAME: 'readio-v2',

  // --- External APIs ---
  READIO_DICT_API_URL: 'https://api.dictionaryapi.dev/api/v2/entries/en/',
  READIO_ITUNES_LOOKUP_URL: 'https://itunes.apple.com/lookup',
  READIO_ITUNES_SEARCH_URL: 'https://itunes.apple.com/search',
  READIO_RSS_FEED_BASE_URL: 'https://rss.applemarketingtools.com/api/v2',

  // --- Limits & Quotas ---
  READIO_MAX_AUDIO_SIZE_MB: 300,
  READIO_DICT_CACHE_MAX_ENTRIES: 500,
  READIO_SAVE_PROGRESS_INTERVAL_MS: 5000,

  // --- UI & Interaction ---
  READIO_MIN_ZOOM: 0.5,
  READIO_MAX_ZOOM: 3.0,
  READIO_ZOOM_STEP: 0.1,
  READIO_ZOOM_HIDE_DELAY_MS: 2000,
  READIO_CLICK_DELAY_MS: 240,

  // --- Localization ---
  READIO_DEFAULT_LANG: 'en',
  READIO_DEFAULT_COUNTRY: 'us',

  // --- Assets ---
  READIO_FALLBACK_PODCAST_IMAGE: '/placeholder-podcast.svg',

  // --- Cache TTLs (ms) ---
  READIO_CACHE_TTL_EPISODES_MS: 3600000, // 1 hour
  READIO_RECOMMENDED_TTL_MS: 86400000, // 24 hours
}
