/**
 * UUID ↔ compact base64url episode key helpers.
 *
 * Contract (Instruction 028):
 * - Input UUID must match the canonical 8-4-4-4-12 hyphenated shape.
 * - Accept upper/lowercase hex input and normalize to lowercase.
 * - Do not enforce RFC UUID version or variant semantics.
 * - Compact key is exactly 22 base64url characters (no padding).
 * - Encoding/decoding must be lossless with respect to canonical UUID text.
 * - Any parse failure must fail closed (return null).
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMPACT_KEY_RE = /^[A-Za-z0-9_-]{22}$/

/**
 * Normalize a UUID-like string to canonical lowercase hyphenated form.
 * Accepts only the canonical 8-4-4-4-12 hyphenated shape, any case.
 * Returns null if the input does not match that shape.
 */
export function normalizeUUID(input: string): string | null {
  const trimmed = input.trim()

  if (!UUID_RE.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/**
 * Encode a canonical-shape UUID string into a 22-character base64url key.
 * Returns null if the input does not match the 8-4-4-4-12 UUID shape.
 */
export function uuidToCompactKey(uuid: string): string | null {
  const canonical = normalizeUUID(uuid)
  if (!canonical) return null

  const hex = canonical.replace(/-/g, '')
  const bytes = new Uint8Array(16)
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  // base64url encode without padding
  let base64: string
  if (typeof btoa === 'function') {
    base64 = btoa(String.fromCharCode(...bytes))
  } else {
    // Node.js fallback for tests
    base64 = Buffer.from(bytes).toString('base64')
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Validate whether a string is a valid 22-character base64url compact key.
 */
export function isValidCompactKey(key: string): boolean {
  return COMPACT_KEY_RE.test(key)
}

/**
 * Decode a 22-character base64url key back to canonical UUID string.
 * Returns null if the key is not valid or decode fails.
 */
export function compactKeyToUUID(key: string): string | null {
  if (!isValidCompactKey(key)) return null

  try {
    // Restore base64 padding
    const base64 = `${key.replace(/-/g, '+').replace(/_/g, '/')}==`
    let bytes: Uint8Array

    if (typeof atob === 'function') {
      const binary = atob(base64)
      bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
    } else {
      // Node.js fallback for tests
      bytes = new Uint8Array(Buffer.from(base64, 'base64'))
    }

    if (bytes.length !== 16) return null

    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')

    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
  } catch {
    return null
  }
}
