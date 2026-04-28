/**
 * Podcast Audio URL Normalization (SSOT)
 *
 * Shared helper for deterministic URL normalization.
 * Used by both remote ASR (Instruction 123) and download dedup (Instruction 124).
 */

const TRACKING_PREFIXES = [
  /^https?:\/\/dts\.podtrac\.com\/redirect\.(?:mp3|m4a|aac|wav)\//i,
  /^https?:\/\/pdst\.fm\/e\//i,
  /^https?:\/\/pfx\.vpixl\.com\/[a-zA-Z0-9-]+\//i,
  /^https?:\/\/pscrb\.fm\/rss\/p\//i,
  /^https?:\/\/chrt\.fm\/track\/[a-zA-Z0-9-]+\//i,
  /^https?:\/\/awny\.macromedia\.com\/[a-zA-Z0-9-]+\//i,
  /^https?:\/\/adswizz\.com\/[a-zA-Z0-9-]+\//i,
  /^https?:\/\/podmetrics\.co\/[a-zA-Z0-9-]+\//i,
  /^https?:\/\/prfx\.byspotify\.com\/e\//i,
  /^https?:\/\/chtbl\.com\/track\/[a-zA-Z0-9-]+\//i,
]

const REMOVE_QUERY_KEYS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_cid',
  'mc_eid',
  'mkt_tok',
  'ref',
  'source',
  'spm',
  'utm_campaign',
  'utm_content',
  'utm_id',
  'utm_medium',
  'utm_name',
  'utm_source',
  'utm_term',
  'vero_conv',
  'vero_id',
])

/**
 * Normalize a podcast audio URL for deterministic key generation.
 *
 * Canonicalization rules:
 * - Protocol forced to https
 * - Host lowercased
 * - Hash stripped
 * - Tracking query params removed
 * - Trailing slashes removed from path (except root)
 */
export function normalizePodcastAudioUrl(url: string): string {
  const trimmed = String(url || '').trim()
  if (!trimmed) return ''

  try {
    const parsed = new URL(trimmed)
    parsed.protocol = 'https:'
    parsed.host = parsed.host.toLowerCase()
    parsed.hash = ''

    for (const key of [...parsed.searchParams.keys()]) {
      if (key.toLowerCase().startsWith('utm_') || REMOVE_QUERY_KEYS.has(key.toLowerCase())) {
        parsed.searchParams.delete(key)
      }
    }

    if (parsed.pathname !== '/') {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '')
    } else {
      parsed.pathname = ''
    }

    return parsed.toString()
  } catch {
    return trimmed.replace(/\/+$/, '')
  }
}

/**
 * SHA-256 Hash utility (Instruction 125)
 * Returns a lowercase hexadecimal string.
 */
export async function sha256(message: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(message)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Unwrap nested podcast tracking URLs (e.g., dts.podtrac.com/redirect.mp3/...)
 * Unwrapping bypasses adblockers that usually drop the connection (ERR_CONNECTION_CLOSED).
 * Important: This should only be used for actual fetching/streaming, NOT for identity hashing.
 */
export function unwrapPodcastTrackingUrl(url: string): string {
  let currentUrl = url
  let unwrapped = true

  // Recursively remove known tracking prefixes because they can be chained
  // (e.g. podtrac -> pdst -> vpixl -> actual_host)
  while (unwrapped && currentUrl) {
    unwrapped = false
    for (const prefix of TRACKING_PREFIXES) {
      if (prefix.test(currentUrl)) {
        currentUrl = currentUrl.replace(prefix, 'https://')
        unwrapped = true
        break
      }
    }
  }
  return currentUrl
}
