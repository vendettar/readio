import { describe, expect, it } from 'vitest'
import {
  compactKeyToEpisodeIdentity,
  compactKeyToUUID,
  episodeIdentityToCompactKey,
  isValidCompactKey,
  normalizeUUID,
  uuidToCompactKey,
} from '../compactKey'

describe('compactKey UUID shape normalization', () => {
  it('accepts hyphenated UUID-shaped values without enforcing RFC version or variant bits', () => {
    const input = 'cd068fd1-8d6c-41ed-aacc-9abf882e1cf3'
    const key = uuidToCompactKey(input)

    expect(key).toBe('zQaP0Y1sQe2qzJq_iC4c8w')
    if (!key) throw new Error('expected compact key')
    expect(compactKeyToUUID(key)).toBe(input)
    expect(compactKeyToEpisodeIdentity(key)).toBe(input)
  })

  it('normalizes uppercase UUID-shaped values to lowercase', () => {
    expect(normalizeUUID('CD068FD1-8D6C-41ED-AACC-9ABF882E1CF3')).toBe(
      'cd068fd1-8d6c-41ed-aacc-9abf882e1cf3'
    )
  })

  it('rejects non-hyphenated 32-hex values even when the hex payload is otherwise valid', () => {
    expect(normalizeUUID('cd068fd18d6c41edaacc9abf882e1cf3')).toBeNull()
    expect(uuidToCompactKey('cd068fd18d6c41edaacc9abf882e1cf3')).toBeNull()
  })

  it('rejects malformed hyphenated values', () => {
    expect(normalizeUUID('cd068fd1-8d6c-41ed-aacc-9abf882e1cf')).toBeNull()
    expect(normalizeUUID('cd068fd1-8d6c-41ed-aacc9-abf882e1cf3')).toBeNull()
  })

  describe('compactKeyToUUID token validation', () => {
    it('returns null for tokens that are not exactly 22 characters', () => {
      expect(compactKeyToUUID('too-short')).toBeNull()
      expect(compactKeyToUUID('too-long-actually-longer-than-twenty-two-chars')).toBeNull()
    })

    it('returns null for tokens containing invalid base64url characters', () => {
      // '+' and '/' are valid base64 but NOT base64url
      expect(compactKeyToUUID('dm8RLqvNEjRWeAfgXlSAd+')).toBeNull()
      expect(compactKeyToUUID('dm8RLqvNEjRWeAfgXlSAd/')).toBeNull()
      // Symbols
      expect(compactKeyToUUID('dm8RLqvNEjRWeAfgXlSAd!')).toBeNull()
    })

    it('returns null for empty or whitespace tokens', () => {
      expect(compactKeyToUUID('')).toBeNull()
      expect(compactKeyToUUID('                      ')).toBeNull()
    })
  })

  describe('generic non-UUID identity support', () => {
    it('round-trips a stable non-UUID episode identity', () => {
      const input = 'abc123-def456'
      const key = episodeIdentityToCompactKey(input)

      expect(key).toBe('e_YWJjMTIzLWRlZjQ1Ng')
      if (!key) throw new Error('expected compact key')
      expect(compactKeyToEpisodeIdentity(key)).toBe(input)
      expect(compactKeyToUUID(key)).toBeNull()
    })

    it('round-trips a URL-shaped episode identity', () => {
      const input = 'https://podnews.net/update/new-heights-prime-video'
      const key = episodeIdentityToCompactKey(input)

      expect(key).toBeTruthy()
      if (!key) throw new Error('expected compact key')
      expect(compactKeyToEpisodeIdentity(key)).toBe(input)
      expect(compactKeyToUUID(key)).toBeNull()
    })

    it('rejects empty identities', () => {
      expect(episodeIdentityToCompactKey('')).toBeNull()
      expect(episodeIdentityToCompactKey('   ')).toBeNull()
    })
  })

  describe('isValidCompactKey', () => {
    it('accepts valid 22-character base64url keys', () => {
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAdA')).toBe(true)
      expect(isValidCompactKey('766f112eabcd1234567807')).toBe(true) // random chars but valid b64url
      expect(isValidCompactKey('e_YWJjMTIzLWRlZjQ1Ng')).toBe(true)
    })

    it('rejects keys with wrong length', () => {
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAd')).toBe(false) // 21
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAdAA')).toBe(false) // 23
    })

    it('rejects keys with invalid characters', () => {
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAd+')).toBe(false)
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAd/')).toBe(false)
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAd!')).toBe(false)
    })
  })
})
