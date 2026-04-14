import { describe, expect, it } from 'vitest'
import { compactKeyToUUID, isValidCompactKey, normalizeUUID, uuidToCompactKey } from '../compactKey'

describe('compactKey UUID shape normalization', () => {
  it('accepts hyphenated UUID-shaped values without enforcing RFC version or variant bits', () => {
    const input = 'cd068fd1-8d6c-41ed-aacc-9abf882e1cf3'
    const key = uuidToCompactKey(input)

    expect(key).toBe('zQaP0Y1sQe2qzJq_iC4c8w')
    // biome-ignore lint/style/noNonNullAssertion: test assertion
    expect(compactKeyToUUID(key!)).toBe(input)
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

  describe('isValidCompactKey', () => {
    it('accepts valid 22-character base64url keys', () => {
      expect(isValidCompactKey('dm8RLqvNEjRWeAfgXlSAdA')).toBe(true)
      expect(isValidCompactKey('766f112eabcd1234567807')).toBe(true) // random chars but valid b64url
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
