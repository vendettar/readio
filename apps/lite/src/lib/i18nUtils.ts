// src/lib/i18nUtils.ts
/**
 * Standalone i18n utilities for use outside React context (e.g., in stores)
 * Falls back to English if language or key is missing
 */

import { STORAGE_KEY_LANGUAGE, STORAGE_KEY_LEGACY_LANGUAGE } from '../constants/storage'
import { warn as logWarn } from './logger'
import { getAppConfig } from './runtimeConfig'
import { getJson } from './storage'
import { type Language, translations } from './translations'

/**
 * Get translation without React hook - for use in stores and utilities
 * @param key Translation key
 * @param options Interpolation options
 * @returns Translated string with interpolations applied
 */
export function translate(key: string, options?: Record<string, string | number>): string {
  const config = getAppConfig()
  // Get stored language with namespacing and legacy fallback
  const rawLang =
    getJson<unknown>(STORAGE_KEY_LANGUAGE) ||
    getJson<unknown>(STORAGE_KEY_LEGACY_LANGUAGE) ||
    config.DEFAULT_LANG ||
    'en'
  const storedLang = typeof rawLang === 'string' ? rawLang : 'en'

  const normalizedLang = storedLang.trim().toLowerCase()
  const langPrefix = normalizedLang.split('-')[0]
  const langMap: Record<string, Language> = {
    zh: 'zh',
    en: 'en',
    ja: 'ja',
    ko: 'ko',
    de: 'de',
    es: 'es',
  }
  const langKey: Language = langMap[langPrefix] ?? 'en'

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
      logWarn(`[i18n] Missing translation key: ${key}`)
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
