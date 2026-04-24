export type NormalizedFeedUrl = string & { readonly __normalizedFeedUrl: unique symbol }

function normalizeParsedUrl(url: URL): string {
  url.protocol = url.protocol.toLowerCase()
  url.hostname = url.hostname.toLowerCase()
  url.hash = ''
  if (
    (url.protocol === 'http:' && url.port === '80') ||
    (url.protocol === 'https:' && url.port === '443')
  ) {
    url.port = ''
  }
  return url.toString()
}

function tryNormalizeAbsoluteUrl(raw: string): string | undefined {
  const trimmed = raw.trim()
  if (!trimmed) return undefined

  try {
    return normalizeParsedUrl(new URL(trimmed))
  } catch {
    return undefined
  }
}

export function normalizeFeedUrl(feedUrl: string): NormalizedFeedUrl {
  return (tryNormalizeAbsoluteUrl(feedUrl) ?? feedUrl.trim()) as NormalizedFeedUrl
}

export function normalizeFeedUrlOrUndefined(
  feedUrl: string | undefined
): NormalizedFeedUrl | undefined {
  if (typeof feedUrl !== 'string') return undefined
  return tryNormalizeAbsoluteUrl(feedUrl) as NormalizedFeedUrl | undefined
}
