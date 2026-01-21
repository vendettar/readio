// src/lib/i18nUtils.ts
/**
 * Standalone i18n utilities for use outside React context (e.g., in stores)
 * Falls back to English if language or key is missing
 */

import i18n from './i18n'
import type { TranslationKey } from './translations'

/**
 * Get translation without React hook - for use in stores and utilities
 * @param key Translation key
 * @param options Interpolation options
 * @returns Translated string with interpolations applied (using i18next)
 */
export function translate(key: TranslationKey, options?: Record<string, string | number>): string {
  // Check if key exists and warn in dev
  if (import.meta.env.DEV && !i18n.exists(key)) {
    console.warn(`[i18n] Missing translation key: "${key}"`)
  }

  // Use i18next.t for consistency and power
  // @ts-expect-error - i18next type system is too rigid for generic wrappers
  return i18n.t(key, options)
}
