// src/libs/i18nUtils.ts
/**
 * Standalone i18n utilities for use outside React context (e.g., in stores)
 * Falls back to English if language or key is missing
 */

import { getJson } from './storage'
import { type Language, translations } from './translations'

/**
 * Get translation without React hook - for use in stores and utilities
 * @param key Translation key
 * @param options Interpolation options
 * @returns Translated string with interpolations applied
 */
export function translate(key: string, options?: Record<string, string | number>): string {
  // Get stored language
  const storedLang = getJson<string>('language') || 'zh-CN'

  // Map language code to translation key with fallback
  const langKey: Language = storedLang.startsWith('zh')
    ? 'zh'
    : storedLang.startsWith('en')
      ? 'en'
      : storedLang.startsWith('ja')
        ? 'ja'
        : storedLang.startsWith('ko')
          ? 'ko'
          : storedLang.startsWith('de')
            ? 'de'
            : storedLang.startsWith('es')
              ? 'es'
              : 'en'

  const t = translations[langKey]

  // Get translation string
  let text = (t as Record<string, string>)[key]

  // Fallback to English if key not found
  if (!text && langKey !== 'en') {
    text = (translations.en as Record<string, string>)[key]
  }

  // Final fallback to key itself
  if (!text) {
    if (import.meta.env.DEV) {
      console.warn(`[i18n] Missing translation key: ${key}`)
    }
    return key
  }

  // Apply interpolations
  if (options) {
    Object.entries(options).forEach(([k, v]) => {
      text = text.replace(`{${k}}`, String(v))
    })
  }

  return text
}
