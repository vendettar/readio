// src/lib/text.test.ts
import { describe, expect, it } from 'vitest'
import { isInteractiveWord, normalizeInteractiveWord, tokenize } from './text'

describe('tokenize', () => {
  it('splits text into words and delimiters', () => {
    expect(tokenize('Hello, world!')).toEqual(['Hello', ', ', 'world', '!'])
  })

  it('handles multiple spaces', () => {
    expect(tokenize('foo   bar')).toEqual(['foo', '   ', 'bar'])
  })

  it('handles hyphens and apostrophes inside words', () => {
    expect(tokenize("It's a well-known fact.")).toEqual([
      "It's",
      ' ',
      'a',
      ' ',
      'well-known',
      ' ',
      'fact',
      '.',
    ])
  })
})

describe('normalizeInteractiveWord', () => {
  it('normalizes punctuation and casing consistently', () => {
    expect(normalizeInteractiveWord('Hello,')).toBe('hello')
    expect(normalizeInteractiveWord("'Well-known!'")).toBe('well-known')
    expect(normalizeInteractiveWord('  ROCK-N-ROLL  ')).toBe('rock-n-roll')
  })
})

describe('isInteractiveWord', () => {
  it('returns true for words', () => {
    expect(isInteractiveWord('Hello')).toBe(true)
    expect(isInteractiveWord("It's")).toBe(true)
    expect(isInteractiveWord('well-known')).toBe(true)
    expect(isInteractiveWord('1990')).toBe(true)
    expect(isInteractiveWord('中文')).toBe(true)
    expect(isInteractiveWord('今日は')).toBe(true)
  })

  it('returns false for punctuation', () => {
    expect(isInteractiveWord(', ')).toBe(false)
    expect(isInteractiveWord('   ')).toBe(false)
    expect(isInteractiveWord('!')).toBe(false)
    expect(isInteractiveWord('.')).toBe(false)
    expect(isInteractiveWord("'---'")).toBe(false)
  })
})
