/**
 * Episode identity ↔ compact route key helpers.
 *
 * Current route contract:
 * - UUID-shaped stable identities keep the 22-character base64url form.
 * - Non-UUID stable identities use the generic prefixed UTF-8 base64url form.
 * - Both decode into the same canonical "stable episode identity" layer.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COMPACT_KEY_RE = /^[A-Za-z0-9_-]{22}$/
const GENERIC_COMPACT_KEY_PREFIX = 'e_'
const GENERIC_COMPACT_KEY_RE = /^e_[A-Za-z0-9_-]+$/
const MAX_GENERIC_EPISODE_IDENTITY_BYTES = 512

function encodeBytesToBase64Url(bytes: Uint8Array): string {
  let base64: string
  if (typeof btoa === 'function') {
    base64 = btoa(String.fromCharCode(...bytes))
  } else {
    base64 = Buffer.from(bytes).toString('base64')
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function decodeBase64UrlToBytes(encoded: string): Uint8Array | null {
  try {
    const padded = encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '=')
    const base64 = padded.replace(/-/g, '+').replace(/_/g, '/')

    if (typeof atob === 'function') {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }

    return new Uint8Array(Buffer.from(base64, 'base64'))
  } catch {
    return null
  }
}

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value)
  }
  return new Uint8Array(Buffer.from(value, 'utf8'))
}

function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    }
    return Buffer.from(bytes).toString('utf8')
  } catch {
    return null
  }
}

function normalizeEpisodeIdentity(input: string): string | null {
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Normalize a UUID-shaped stable identity to canonical lowercase hyphenated form.
 * Accepts only the canonical 8-4-4-4-12 hyphenated shape, any case.
 * Returns null if the input does not match that shape.
 */
export function normalizeUUID(input: string): string | null {
  const trimmed = input.trim()

  if (!UUID_RE.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/**
 * Encode a UUID-shaped stable identity into the 22-character base64url key.
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

  return encodeBytesToBase64Url(bytes)
}

export function episodeIdentityToCompactKey(identity: string): string | null {
  const normalizedIdentity = normalizeEpisodeIdentity(identity)
  if (!normalizedIdentity) return null

  const uuidKey = uuidToCompactKey(normalizedIdentity)
  if (uuidKey) return uuidKey

  const bytes = encodeUtf8(normalizedIdentity)
  if (bytes.length === 0 || bytes.length > MAX_GENERIC_EPISODE_IDENTITY_BYTES) {
    return null
  }

  return `${GENERIC_COMPACT_KEY_PREFIX}${encodeBytesToBase64Url(bytes)}`
}

/**
 * Validate whether a string is a valid compact key in either supported form.
 */
export function isValidCompactKey(key: string): boolean {
  return COMPACT_KEY_RE.test(key) || GENERIC_COMPACT_KEY_RE.test(key)
}

/**
 * Decode a 22-character UUID compact key back to canonical UUID text.
 * Returns null for generic compact keys or invalid UUID compact keys.
 */
export function compactKeyToUUID(key: string): string | null {
  if (!COMPACT_KEY_RE.test(key)) return null

  const bytes = decodeBase64UrlToBytes(key)
  if (!bytes || bytes.length !== 16) return null

  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

export function compactKeyToEpisodeIdentity(key: string): string | null {
  if (!isValidCompactKey(key)) return null

  const uuidIdentity = compactKeyToUUID(key)
  if (uuidIdentity) return uuidIdentity

  if (!GENERIC_COMPACT_KEY_RE.test(key)) return null

  const encodedIdentity = key.slice(GENERIC_COMPACT_KEY_PREFIX.length)
  const bytes = decodeBase64UrlToBytes(encodedIdentity)
  if (!bytes || bytes.length === 0 || bytes.length > MAX_GENERIC_EPISODE_IDENTITY_BYTES) {
    return null
  }

  return normalizeEpisodeIdentity(decodeUtf8(bytes) ?? '')
}
