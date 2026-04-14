import en from './locales/en'

export type Language = 'zh' | 'en' | 'ja' | 'ko' | 'de' | 'es'

export const languageNativeNames: Record<Language, string> = {
  zh: '简体中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  de: 'Deutsch',
  es: 'Español',
}

type DeepWiden<T> = T extends string
  ? string
  : T extends Record<string, unknown>
    ? { [K in keyof T]: DeepWiden<T[K]> }
    : T

export type TranslationSchema = DeepWiden<typeof en>
export type TranslationKey = keyof TranslationSchema

export const baseEnglishTranslations: TranslationSchema = en as TranslationSchema

export const localeLoaders: Record<Language, () => Promise<TranslationSchema>> = {
  en: async () => baseEnglishTranslations,
  zh: async () => (await import('./locales/zh')).default as TranslationSchema,
  ja: async () => (await import('./locales/ja')).default as TranslationSchema,
  ko: async () => (await import('./locales/ko')).default as TranslationSchema,
  de: async () => (await import('./locales/de')).default as TranslationSchema,
  es: async () => (await import('./locales/es')).default as TranslationSchema,
}
