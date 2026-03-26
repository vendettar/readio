const TOKEN_SPLIT_REGEX = /([^A-Za-z0-9'-]+)/

interface SegmenterEntry {
  segment: string
  isWordLike?: boolean
}

interface SegmenterLike {
  segment(input: string): Iterable<SegmenterEntry>
}

interface SegmenterCtorLike {
  new (locales?: string | string[], options?: { granularity: 'word' }): SegmenterLike
}

const segmenterCache = new Map<string, SegmenterLike>()

function normalizeLocale(language: string): string {
  const raw = String(language || '').trim()
  if (!raw) return 'en'

  try {
    const [canonical] = Intl.getCanonicalLocales(raw)
    if (!canonical) return 'en'
    return canonical
  } catch {
    return raw.toLowerCase()
  }
}

function getSegmenterCtor(): SegmenterCtorLike | null {
  const intlLike = Intl as unknown as { Segmenter?: SegmenterCtorLike }
  return intlLike.Segmenter ?? null
}

function getSegmenter(language: string): SegmenterLike | null {
  const SegmenterCtor = getSegmenterCtor()
  if (!SegmenterCtor) {
    return null
  }

  const locale = normalizeLocale(language)
  const cached = segmenterCache.get(locale)
  if (cached) return cached

  try {
    const segmenter = new SegmenterCtor(locale, { granularity: 'word' })
    segmenterCache.set(locale, segmenter)
    return segmenter
  } catch {
    const base = locale.split('-')[0] || 'en'
    const baseCached = segmenterCache.get(base)
    if (baseCached) return baseCached

    try {
      const segmenter = new SegmenterCtor(base, { granularity: 'word' })
      segmenterCache.set(base, segmenter)
      return segmenter
    } catch {
      return null
    }
  }
}

export function tokenizeFallback(text: string): string[] {
  return text.split(TOKEN_SPLIT_REGEX).filter(Boolean)
}

export function tokenizeWithLocale(text: string, language: string): string[] {
  const segmenter = getSegmenter(language)
  if (!segmenter) {
    return tokenizeFallback(text)
  }

  const tokens: string[] = []
  let pendingDelimiter = ''

  for (const entry of segmenter.segment(text)) {
    if (!entry.segment) continue
    if (entry.isWordLike) {
      if (pendingDelimiter) {
        tokens.push(pendingDelimiter)
        pendingDelimiter = ''
      }
      tokens.push(entry.segment)
      continue
    }
    pendingDelimiter += entry.segment
  }

  if (pendingDelimiter) {
    tokens.push(pendingDelimiter)
  }

  return tokens
}

export function __resetSegmenterCacheForTests(): void {
  segmenterCache.clear()
}
