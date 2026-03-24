import { afterEach, describe, expect, it } from 'vitest'
import {
  __resetSegmenterCacheForTests,
  tokenizeFallback,
  tokenizeWithLocale,
} from '../tokenizeWithLocale'

describe('tokenizeWithLocale', () => {
  afterEach(() => {
    __resetSegmenterCacheForTests()
  })

  it('segments english and preserves delimiters', () => {
    expect(tokenizeWithLocale('Hello, world!', 'en')).toEqual(['Hello', ', ', 'world', '!'])
  })

  it('segments chinese sentence', () => {
    const tokens = tokenizeWithLocale('今天天气很好。', 'zh-CN')
    expect(tokens.join('')).toBe('今天天气很好。')
    expect(tokens.some((token) => token.includes('天气'))).toBe(true)
    expect(tokens[tokens.length - 1]).toBe('。')
  })

  it('segments japanese sentence', () => {
    const tokens = tokenizeWithLocale('今日は天気がいいです。', 'ja-JP')
    expect(tokens.join('')).toBe('今日は天気がいいです。')
    expect(tokens.some((token) => token.includes('天気'))).toBe(true)
    expect(tokens[tokens.length - 1]).toBe('。')
  })

  it('segments korean sentence', () => {
    const tokens = tokenizeWithLocale('오늘 날씨가 좋습니다.', 'ko-KR')
    expect(tokens.join('')).toBe('오늘 날씨가 좋습니다.')
    expect(tokens.some((token) => token.includes('날씨'))).toBe(true)
    expect(tokens[tokens.length - 1]).toBe('.')
  })

  it('handles mixed language sentence', () => {
    const tokens = tokenizeWithLocale('Readio 支持 English 和中文 mixed tokens.', 'zh')
    expect(tokens.join('')).toBe('Readio 支持 English 和中文 mixed tokens.')
    expect(tokens).toContain('Readio')
    expect(tokens).toContain('English')
    expect(tokens.some((token) => token.includes('中文'))).toBe(true)
  })

  it('falls back deterministically when Intl.Segmenter is unavailable', () => {
    const intlLike = Intl as unknown as { Segmenter?: unknown }
    const originalSegmenter = intlLike.Segmenter
    Object.defineProperty(intlLike, 'Segmenter', {
      value: undefined,
      configurable: true,
    })

    try {
      expect(tokenizeWithLocale('foo   bar, baz!', 'en')).toEqual(
        tokenizeFallback('foo   bar, baz!')
      )
    } finally {
      Object.defineProperty(intlLike, 'Segmenter', {
        value: originalSegmenter,
        configurable: true,
      })
    }
  })
})
