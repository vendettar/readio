import { createFromSource } from 'fumadocs-core/search/server'
import { docsSearchLocaleMap } from '@/lib/docsLocale.mjs'
import { source } from '@/lib/source'

export const { GET } = createFromSource(source, {
  // Orama currently has no native Chinese tokenizer in this stack version.
  // Keep locale mapping explicit to avoid accidental default-language drift.
  localeMap: docsSearchLocaleMap,
})
