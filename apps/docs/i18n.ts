import { defineI18n } from 'fumadocs-core/i18n'
import { docsDefaultLanguage, docsLanguages } from './lib/docsLocale.mjs'

export const i18n = defineI18n({
  defaultLanguage: docsDefaultLanguage,
  languages: docsLanguages,
})
