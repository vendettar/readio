import { getAppConfig } from '../lib/runtimeConfig'

/**
 * Static constants that don't change between environments
 */

export function getAppVersion() {
  return getAppConfig().APP_VERSION
}

export function getDefaultCountry() {
  return getAppConfig().DEFAULT_COUNTRY
}

export const APP_VERSION = '1.0.0' // Temporary backward compatibility if needed, but better to update callers.
export const DEFAULT_COUNTRY = 'us'
export const UI_FEEDBACK_DURATION = 2000

export const SEARCH_ENGINES = {
  google: 'https://www.google.com/search?q=',
  bing: 'https://www.bing.com/search?q=',
  duckduckgo: 'https://duckduckgo.com/?q=',
} as const

export const DEFAULT_SEARCH_ENGINE = SEARCH_ENGINES.google

export const SELECTION_THRESHOLD = 10

export const DISCOVERY_CATEGORIES = {
  // any static category mappings if needed
}

/**
 * Editor's Picks - Curated high-quality podcasts by region
 *
 * These are featured podcasts shown in the "Editor's Picks" section of the Explore page.
 * Update quarterly or when featured podcasts change.
 *
 * Format: Array of podcast GUIDs from the `podcast:guid` feed tag.
 */
export const EDITOR_PICKS_BY_REGION = {
  /**
   * United States - Premium English podcasts
   * Focus: News, tech, business, storytelling, and culture
   */
  us: [
    '304b84f0-07b0-5265-b6b7-da5cf5aeb56e', // The Daily - NYT's flagship daily news podcast
    'f1ebeaa1-bc5a-534f-8528-0738ae374d55', // This American Life
    '48a44c72-88a9-50f7-8ede-ad62b5330e88', // Modern Love
    '455dcddb-ce94-5de7-bad9-f4cdb266574c', // SmartLess - Comedy interview show (Jason Bateman, Will Arnett, Sean Hayes)
    '9486d50c-eb78-591c-a1b2-3beb07bb0b4e', // Stuff You Should Know - Educational entertainment
    '1f68b982-7504-5f55-a617-d69ac934ba2e', // Huberman Lab - Neuroscience and health
    '2d7400e3-bacb-52fd-aabc-0da55e39f98b', // Serial
    'dd067b0b-dd27-5afe-99e1-8bde4df13707', // Hunting Warhead
    '66c31c24-2dd0-595d-9bf6-b19fc91be6c9', // Bear Brook
    '7eeae9d1-141e-5133-9e8f-6c1da695e40c', // Lex Fridman Podcast - AI, science, and philosophy
    '79c2bf9a-f5d4-5dcf-a084-9277d62dd8da', // 99% Invisible - Design and architecture
    'b002674c-0862-55ac-a8a6-03b5cf9669ab', // How I Built This - Entrepreneurship stories
    // '1450522638', // Darknet Diaries - Cybersecurity stories
  ],

  /**
   * China - Popular Chinese podcasts
   * Focus: Business, technology, culture, and personal growth
   */
  cn: [
    '36a55ce0-b8a5-51f4-bd7a-02b205348f8a', // 忽左忽右 (JustPod)
    '14dd33bf-7196-5add-8f80-b130809ecab9', // 不在场
    'de8a104b-d535-5fe4-a810-0e7049f6d418', // 故事FM
    '81b5134f-98ca-5ef5-905f-719b03e6a35a', // 随机波动 StochasticVolatility
  ],

  /**
   * Japan - Popular Japanese podcasts
   * Focus: Culture, technology, entertainment, and lifestyle
   */
  jp: [],

  /**
   * South Korea - Popular Korean podcasts
   * Ref: Backlog item 20260228-R8c-KR
   */
  kr: [],

  /**
   * Germany - Popular German podcasts
   * Focus: News, culture, science, and entertainment
   */
  de: [],

  /**
   * Spain - Popular Spanish podcasts
   * Ref: Backlog item 20260228-R8c-ES
   */
  es: [],

  /**
   * Singapore - English and regional content
   * Focus: International and Asian perspectives
   */
  sg: [],
} as const

/**
 * Supported country codes for Editor's Picks
 */
export type EditorPicksRegion = keyof typeof EDITOR_PICKS_BY_REGION

export const SUPPORTED_CONTENT_REGIONS = Object.keys(EDITOR_PICKS_BY_REGION) as EditorPicksRegion[]

export const CONTENT_REGION_TO_LANGUAGE: Record<EditorPicksRegion, string> = {
  us: 'en',
  cn: 'zh',
  jp: 'ja',
  kr: 'ko',
  de: 'de',
  es: 'es',
  sg: 'en',
} as const

export function normalizeCountryCode(country: string | null | undefined): string {
  if (!country || typeof country !== 'string') {
    return getDefaultCountry().toLowerCase()
  }
  const normalized = country.trim().toLowerCase()
  return normalized || getDefaultCountry().toLowerCase()
}

/**
 * Get Editor's Picks for a specific region
 * @param region Country code
 * @returns Array of curated podcast keys if region is configured, undefined otherwise
 */
export function getEditorPicksForRegion(region: string): readonly string[] | undefined {
  const normalizedRegion = normalizeCountryCode(region) as EditorPicksRegion
  return EDITOR_PICKS_BY_REGION[normalizedRegion]
}

const PODCAST_GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isPodcastGuid(value: string | null | undefined): boolean {
  return typeof value === 'string' && PODCAST_GUID_PATTERN.test(value.trim())
}
