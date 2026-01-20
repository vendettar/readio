// src/hooks/useI18n.ts
import { createContext, type ReactNode, useCallback, useContext, useEffect, useState } from 'react'
import { STORAGE_KEY_LANGUAGE, STORAGE_KEY_LEGACY_LANGUAGE } from '../constants/storage'
import { getJson, removeItem, setJson } from '../lib/storage'
import { type Language, languageNativeNames, translations } from '../lib/translations'

export type { Language } from '../lib/translations'

import { getAppConfig } from '../lib/runtimeConfig'

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, options?: Record<string, string | number>) => string
  languages: typeof languageNativeNames
}

const I18nContext = createContext<I18nContextType | null>(null)

function getInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'en'

  // 1. User manual preference (Namespaced)
  const stored = getJson<Language>(STORAGE_KEY_LANGUAGE)
  if (stored && translations[stored]) return stored

  // 2. Legacy fallback
  const legacy = getJson<Language>(STORAGE_KEY_LEGACY_LANGUAGE)
  if (legacy && translations[legacy]) return legacy

  // 3. Global runtime config default
  const config = getAppConfig()
  const configLang = config.DEFAULT_LANG as Language
  if (configLang && translations[configLang]) return configLang

  // 4. Try browser language
  const browserLang = navigator.language.slice(0, 2) as Language
  if (translations[browserLang]) return browserLang

  return 'en'
}

interface I18nProviderProps {
  children: ReactNode
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage)

  const setLanguage = useCallback((lang: Language) => {
    if (translations[lang]) {
      setLanguageState(lang)
      setJson(STORAGE_KEY_LANGUAGE, lang)
      document.documentElement.lang = lang
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = language

    // Migrate legacy storage key if it exists
    const legacy = getJson<Language>(STORAGE_KEY_LEGACY_LANGUAGE)
    if (legacy && translations[legacy]) {
      setJson(STORAGE_KEY_LANGUAGE, legacy)
      removeItem(STORAGE_KEY_LEGACY_LANGUAGE)
    }
  }, [language])

  const t = useCallback(
    (key: string, options?: Record<string, string | number>): string => {
      const pack = (translations[language] || translations.en) as Record<string, string>
      const fallback = translations.en as Record<string, string>
      let text = pack[key] || fallback[key] || key

      if (options && typeof text === 'string') {
        Object.entries(options).forEach(([k, v]) => {
          text = text.replace(`{${k}}`, String(v))
        })
      }
      return text
    },
    [language]
  )

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, languages: languageNativeNames }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider')
  }
  return context
}
