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
 * Format: Array of Apple provider collection IDs
 * How to find IDs: Search on https://podcasts.apple.com/ and extract ID from URL
 * Example: https://podcasts.apple.com/us/podcast/the-daily/id1200361736 → ID is '1200361736'
 */
export const EDITOR_PICKS_BY_REGION = {
  /**
   * United States - Premium English podcasts
   * Focus: News, tech, business, storytelling, and culture
   */
  us: [
    '1200361736', // The Daily - NYT's flagship daily news podcast
    '201671138', // This American Life
    '1065559535', // Modern Love
    '1521578868', // SmartLess - Comedy interview show (Jason Bateman, Will Arnett, Sean Hayes)
    '278981407', // Stuff You Should Know - Educational entertainment
    '1545953110', // Huberman Lab - Neuroscience and health
    '917918570', // Serial
    '1480270157', // Hunting Warhead
    '1423306695', // Bear Brook
    '1434243584', // Lex Fridman Podcast - AI, science, and philosophy
    '394775318', // 99% Invisible - Design and architecture
    '1150510297', // How I Built This - Entrepreneurship stories
    '1450522638', // Darknet Diaries - Cybersecurity stories
  ],

  /**
   * China - Popular Chinese podcasts
   * Focus: Business, technology, culture, and personal growth
   */
  cn: [
    '1473833023', // 忽左忽右 (JustPod)
    '1436160187', // 故事 FM
    '1450634191', // 迟早更新
    '1438701659', // 随机波动 StochasticVolatility
  ],

  /**
   * Japan - Popular Japanese podcasts
   * Focus: Culture, technology, entertainment, and lifestyle
   */
  jp: [
    '1501431175', // 飯田浩司のOK! Cozy up！
    '1505018370', // 聴く日経
    '1513251430', // 英語で雑談！Kevin's English Room Podcast
  ],

  /**
   * South Korea - Popular Korean podcasts
   * Ref: Backlog item 20260228-R8c-KR
   */
  kr: [],

  /**
   * Germany - Popular German podcasts
   * Focus: News, culture, science, and entertainment
   */
  de: [
    '1411513308', // Zeit Verbrechen
    '1264164020', // Gemischtes Hack
    '1474010151', // Hotel Matze
  ],

  /**
   * Spain - Popular Spanish podcasts
   * Ref: Backlog item 20260228-R8c-ES
   */
  es: [],

  /**
   * Singapore - English and regional content
   * Focus: International and Asian perspectives
   */
  sg: [
    '1521291060', // The Daily Ketchup Podcast
    '1469741545', // Yah Lah BUT...
  ],
} as const

/**
 * Supported country codes for Editor's Picks
 */
export type EditorPicksRegion = keyof typeof EDITOR_PICKS_BY_REGION

export const SUPPORTED_CONTENT_REGIONS = Object.keys(EDITOR_PICKS_BY_REGION) as EditorPicksRegion[]

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
 * @returns Array of podcast IDs if region is configured, undefined otherwise
 */
export function getEditorPicksForRegion(region: string): readonly string[] | undefined {
  const normalizedRegion = normalizeCountryCode(region) as EditorPicksRegion
  return EDITOR_PICKS_BY_REGION[normalizedRegion]
}
