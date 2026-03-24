import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n, {
  __resetI18nLoaderStateForTests,
  applyDetectedLanguageSafely,
  changeLanguageSafely,
} from '../i18n'
import {
  baseEnglishTranslations,
  type Language,
  localeLoaders,
  type TranslationSchema,
} from '../translations'

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function normalizeLanguage(value: string): string {
  return value.split('-')[0]
}

describe('changeLanguageSafely', () => {
  let originalLoaders: Record<Language, () => Promise<TranslationSchema>>

  beforeEach(async () => {
    originalLoaders = { ...localeLoaders }
    __resetI18nLoaderStateForTests()
    await i18n.changeLanguage('en')
  })

  afterEach(() => {
    Object.assign(localeLoaders, originalLoaders)
  })

  it('waits for locale load before applying language', async () => {
    const deferred = createDeferred<TranslationSchema>()
    localeLoaders.zh = vi.fn(() => deferred.promise)

    const pending = changeLanguageSafely('zh')
    await Promise.resolve()

    expect(normalizeLanguage(i18n.language)).toBe('en')

    deferred.resolve(baseEnglishTranslations)
    await pending

    expect(normalizeLanguage(i18n.language)).toBe('zh')
  })

  it('applies latest language when rapid toggles race', async () => {
    const zhDeferred = createDeferred<TranslationSchema>()
    const jaDeferred = createDeferred<TranslationSchema>()

    localeLoaders.zh = vi.fn(() => zhDeferred.promise)
    localeLoaders.ja = vi.fn(() => jaDeferred.promise)

    const slow = changeLanguageSafely('zh')
    const fast = changeLanguageSafely('ja')

    jaDeferred.resolve(baseEnglishTranslations)
    await fast
    zhDeferred.resolve(baseEnglishTranslations)
    await slow

    expect(normalizeLanguage(i18n.language)).toBe('ja')
  })

  it('allows retry after failed locale load', async () => {
    const failure = vi.fn(async () => {
      throw new Error('load failed')
    })
    localeLoaders.de = failure

    await expect(changeLanguageSafely('de')).rejects.toThrow('load failed')

    const success = vi.fn(async () => baseEnglishTranslations)
    localeLoaders.de = success
    await changeLanguageSafely('de')

    expect(success).toHaveBeenCalledTimes(1)
    expect(normalizeLanguage(i18n.language)).toBe('de')
  })

  it('keeps final language monotonic for A→B→A rapid toggles', async () => {
    const zhDeferred = createDeferred<TranslationSchema>()
    localeLoaders.zh = vi.fn(() => zhDeferred.promise)

    const toZh = changeLanguageSafely('zh')
    const backToEn = changeLanguageSafely('en')
    await backToEn

    expect(normalizeLanguage(i18n.language)).toBe('en')

    zhDeferred.resolve(baseEnglishTranslations)
    await toZh

    expect(normalizeLanguage(i18n.language)).toBe('en')
  })

  it('keeps manual switch as final language when startup detected load races', async () => {
    const zhDeferred = createDeferred<TranslationSchema>()
    const jaDeferred = createDeferred<TranslationSchema>()

    localeLoaders.zh = vi.fn(() => zhDeferred.promise)
    localeLoaders.ja = vi.fn(() => jaDeferred.promise)

    const startupDetectedApply = applyDetectedLanguageSafely('zh')
    const manualSwitch = changeLanguageSafely('ja')

    jaDeferred.resolve(baseEnglishTranslations)
    await manualSwitch
    zhDeferred.resolve(baseEnglishTranslations)
    await startupDetectedApply

    expect(normalizeLanguage(i18n.language)).toBe('ja')
  })
})
