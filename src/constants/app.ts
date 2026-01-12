import { getAppConfig } from '../libs/runtimeConfig';

/**
 * Static constants that don't change between environments
 */

export function getAppVersion() {
    return getAppConfig().APP_VERSION;
}

export function getDefaultCountry() {
    return getAppConfig().DEFAULT_COUNTRY;
}

export const APP_VERSION = '1.0.0'; // Temporary backward compatibility if needed, but better to update callers.
export const DEFAULT_COUNTRY = 'us';

export const DISCOVERY_CATEGORIES = {
    // any static category mappings if needed
};

/**
 * Editor's Picks - Curated high-quality podcasts by region
 * 
 * These are featured podcasts shown in the "Editor's Picks" section of the Explore page.
 * Update quarterly or when featured podcasts change.
 * 
 * Format: Array of iTunes/Apple Podcasts collection IDs
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
        '1521578868', // SmartLess - Comedy interview show (Jason Bateman, Will Arnett, Sean Hayes)
        '278981407',  // Stuff You Should Know - Educational entertainment
        '1545953110', // Huberman Lab - Neuroscience and health
        '917918570', // Serial
        '1480270157', // Hunting Warhead
        '1423306695', // Bear Brook
        '1434243584', // Lex Fridman Podcast - AI, science, and philosophy
        '394775318',  // 99% Invisible - Design and architecture
        '1150510297', // How I Built This - Entrepreneurship stories
        '1450522638', // Darknet Diaries - Cybersecurity stories
        // '152249110',  // Radiolab - Science storytelling
        // '1430315931', // The Daily Stoic - Philosophy and wisdom
        // '1222114325', // Up First - NPR's morning news briefing
        // '290783428',  // Planet Money - Economics made entertaining
    ],

    /**
     * China - Popular Chinese podcasts
     * Focus: Business, technology, culture, and personal growth
     * Note: Some international podcasts may not be accessible in CN region
     */
    cn: [
        // TODO: Add verified Chinese podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],

    /**
     * Japan - Popular Japanese podcasts
     * Focus: Culture, technology, entertainment, and lifestyle
     */
    jp: [
        // TODO: Add verified Japanese podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],

    /**
     * South Korea - Popular Korean podcasts
     * Focus: Entertainment, culture, technology, and education
     */
    kr: [
        // TODO: Add verified Korean podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],

    /**
     * Germany - Popular German podcasts
     * Focus: News, culture, science, and entertainment
     */
    de: [
        // TODO: Add verified German podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],

    /**
     * Spain - Popular Spanish podcasts
     * Focus: News, culture, entertainment, and education
     */
    es: [
        // TODO: Add verified Spanish podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],

    /**
     * Singapore - English and regional content
     * Focus: International and Asian perspectives
     */
    sg: [
        // TODO: Add verified Singapore/SEA podcast IDs
        // When configured, this section will automatically appear on the Explore page
    ],
} as const;

/**
 * Supported country codes for Editor's Picks
 */
export type EditorPicksRegion = keyof typeof EDITOR_PICKS_BY_REGION;

/**
 * Get Editor's Picks for a specific region
 * @param region Country code
 * @returns Array of podcast IDs if region is configured, undefined otherwise
 */
export function getEditorPicksForRegion(region: string): readonly string[] | undefined {
    const normalizedRegion = region.toLowerCase() as EditorPicksRegion;
    return EDITOR_PICKS_BY_REGION[normalizedRegion];
}
