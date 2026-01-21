import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { STORAGE_KEY_LANGUAGE } from '../constants/storage'
import { translations } from './translations'

// Module augmentation for type safety
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: {
      translation: typeof translations.en
    }
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: translations.en },
      zh: { translation: translations.zh },
      ja: { translation: translations.ja },
      ko: { translation: translations.ko },
      de: { translation: translations.de },
      es: { translation: translations.es },
    },
    supportedLngs: ['en', 'zh', 'ja', 'ko', 'de', 'es'],
    load: 'languageOnly',
    fallbackLng: 'en',
    detection: {
      lookupLocalStorage: STORAGE_KEY_LANGUAGE,
      caches: ['localStorage'],
      order: ['localStorage', 'navigator'],
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
