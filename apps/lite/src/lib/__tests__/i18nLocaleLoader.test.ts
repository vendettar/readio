import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n, { __resetI18nLoaderStateForTests, ensureLocaleLoaded } from '../i18n'
import {
  baseEnglishTranslations,
  type Language,
  localeLoaders,
  type TranslationSchema,
} from '../translations'

function normalizeLanguage(value: string): string {
  return value.split('-')[0]
}

describe('i18n locale loader', () => {
  let originalLoaders: Record<Language, () => Promise<TranslationSchema>>

  beforeEach(async () => {
    originalLoaders = { ...localeLoaders }
    __resetI18nLoaderStateForTests()
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    Object.assign(localeLoaders, originalLoaders)
  })

  it('loads locale resource shape from loader registry', async () => {
    const zh = await localeLoaders.zh()
    expect(zh).toHaveProperty('navExplore')
    expect(zh).toHaveProperty('settings')
  })

  it('deduplicates concurrent ensureLocaleLoaded calls for same language', async () => {
    const loader = vi.fn(async () => baseEnglishTranslations)
    localeLoaders.zh = loader

    await Promise.all([ensureLocaleLoaded('zh'), ensureLocaleLoaded('zh')])

    expect(loader).toHaveBeenCalledTimes(1)
    expect(i18n.hasResourceBundle('zh', 'translation')).toBe(true)
    expect(normalizeLanguage(i18n.language)).toBe('en')
  })
})
