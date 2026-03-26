import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { STORAGE_KEY_LANGUAGE } from '../constants/storage'
import { error as logError } from './logger'
import { getAppConfig } from './runtimeConfig'
import {
  baseEnglishTranslations,
  type Language,
  languageNativeNames,
  localeLoaders,
  type TranslationSchema,
} from './translations'

// Module augmentation for type safety
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: TranslationSchema
    }
  }
}

const supportedLanguages = Object.keys(languageNativeNames) as Language[]

import { abortRequestsWithPrefix, deduplicatedFetch } from './requestManager'

const loadedLocales = new Set<Language>(['en'])
let changeLanguageRequestVersion = 0

function getDefaultLanguage(): Language {
  return normalizeLanguage(getAppConfig().DEFAULT_LANGUAGE) ?? 'en'
}

function normalizeLanguage(value: string | undefined | null): Language | undefined {
  if (!value) return undefined
  const normalized = value.split('-')[0]
  return supportedLanguages.find((lang) => lang === normalized)
}

function syncDocumentLang(lng: string | undefined) {
  if (!lng || typeof document === 'undefined') return
  document.documentElement.lang = lng.split('-')[0]
}

export async function ensureLocaleLoaded(lang: Language): Promise<void> {
  if (loadedLocales.has(lang)) return

  await deduplicatedFetch(`i18n:${lang}`, async () => {
    const translations = await localeLoaders[lang]()
    if (!i18n.hasResourceBundle(lang, 'translation')) {
      i18n.addResourceBundle(lang, 'translation', translations, true, true)
    }
    loadedLocales.add(lang)
  })
}

export async function changeLanguageSafely(lang: Language): Promise<void> {
  const requestVersion = ++changeLanguageRequestVersion
  const currentLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)
  if (currentLanguage === lang && loadedLocales.has(lang)) {
    // No-op language switches still advance request version to invalidate older in-flight requests.
    return
  }

  await ensureLocaleLoaded(lang)

  if (requestVersion !== changeLanguageRequestVersion) {
    return
  }

  await i18n.changeLanguage(lang)
}

export async function applyDetectedLanguageSafely(detectedLanguage: Language): Promise<void> {
  try {
    await changeLanguageSafely(detectedLanguage)
  } catch (err) {
    logError('[i18n] Failed to load detected locale chunk:', err)
    try {
      await i18n.changeLanguage('en')
    } catch (fallbackErr) {
      logError('[i18n] Failed to fallback to en after locale load failure:', fallbackErr)
    }
  }
}

export function __resetI18nLoaderStateForTests(): void {
  abortRequestsWithPrefix('i18n:')
  changeLanguageRequestVersion = 0

  for (const lang of loadedLocales) {
    if (lang !== 'en' && i18n.hasResourceBundle(lang, 'translation')) {
      i18n.removeResourceBundle(lang, 'translation')
    }
  }

  loadedLocales.clear()
  loadedLocales.add('en')
}

i18n.use(LanguageDetector).use(initReactI18next)

void i18n.init({
  resources: {
    en: { translation: baseEnglishTranslations },
  },
  supportedLngs: supportedLanguages,
  load: 'languageOnly',
  fallbackLng: getDefaultLanguage(),
  detection: {
    lookupLocalStorage: STORAGE_KEY_LANGUAGE,
    caches: ['localStorage'],
    order: ['localStorage'],
  },
  interpolation: {
    escapeValue: false,
  },
})

// Sync document lang attribute with current language
// This enables language-specific font stacks in CSS via :root[lang="xx"]
i18n.on('languageChanged', syncDocumentLang)

const detectedLanguage = normalizeLanguage(i18n.resolvedLanguage ?? i18n.language)
if (detectedLanguage && detectedLanguage !== 'en') {
  void applyDetectedLanguageSafely(detectedLanguage)
}

syncDocumentLang(i18n.language)

export default i18n
