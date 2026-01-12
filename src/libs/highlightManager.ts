// src/libs/highlightManager.ts
// CSS Highlights API for looked-up word highlighting
// Avoids DOM manipulation and React re-renders

import { log, warn, error as logError } from './logger';

const HIGHLIGHT_NAME = 'lookup-highlight';

// Check if CSS Highlights API is supported
export function isHighlightSupported(): boolean {
    return typeof CSS !== 'undefined' &&
        'highlights' in CSS &&
        typeof Highlight === 'function';
}

// Create and register the highlight
let lookupHighlight: Highlight | null = null;

export function initLookupHighlight(): boolean {
    if (!isHighlightSupported()) {
        warn('[Highlight] CSS Highlights API not supported');
        return false;
    }

    if (lookupHighlight) return true;

    try {
        lookupHighlight = new Highlight();
        CSS.highlights.set(HIGHLIGHT_NAME, lookupHighlight);
        log('[Highlight] Initialized lookup highlight');
        return true;
    } catch (err) {
        logError('[Highlight] Failed to initialize:', err);
        return false;
    }
}

/**
 * Clear all highlights
 */
export function clearLookupHighlights(): void {
    if (lookupHighlight) {
        lookupHighlight.clear();
    }
}

/**
 * Find and highlight all occurrences of a word in subtitle elements
 * Uses word boundary matching for accurate highlighting
 */
export function highlightWordInSubtitles(word: string, containerSelector = '.subtitle-text'): number {
    if (!lookupHighlight || !word) return 0;

    const normalizedWord = word.toLowerCase().trim();
    if (!normalizedWord) return 0;

    // Create word boundary regex
    const wordRegex = new RegExp(`\\b${escapeRegExp(normalizedWord)}\\b`, 'gi');

    let count = 0;
    const elements = document.querySelectorAll(containerSelector);

    elements.forEach(element => {
        const textNode = element.firstChild;
        if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return;

        const text = textNode.textContent || '';
        let match: RegExpExecArray | null;

        while ((match = wordRegex.exec(text)) !== null) {
            try {
                const range = document.createRange();
                range.setStart(textNode, match.index);
                range.setEnd(textNode, match.index + match[0].length);
                lookupHighlight!.add(range);
                count++;
            } catch {
                // Range creation may fail for invalid positions
            }
        }
    });

    return count;
}

/**
 * Highlight multiple words from cache
 */
export function highlightCachedWords(words: string[], containerSelector = '.subtitle-text'): number {
    if (!lookupHighlight || words.length === 0) return 0;

    let totalCount = 0;
    for (const word of words) {
        totalCount += highlightWordInSubtitles(word, containerSelector);
    }
    return totalCount;
}

/**
 * Rebuild highlights for all cached words
 * Call this after subtitle content changes (e.g., scroll, new content loads)
 */
export function rebuildHighlights(words: string[], containerSelector = '.subtitle-text'): number {
    clearLookupHighlights();
    return highlightCachedWords(words, containerSelector);
}

// Utility: escape regex special characters
function escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Cleanup
export function destroyLookupHighlight(): void {
    if (lookupHighlight) {
        lookupHighlight.clear();
        CSS.highlights.delete(HIGHLIGHT_NAME);
        lookupHighlight = null;
    }
}
