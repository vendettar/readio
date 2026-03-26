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

export function normalizeFeedUrl(feedUrl: string): string {
  return tryNormalizeAbsoluteUrl(feedUrl) ?? feedUrl.trim()
}

export function normalizeFeedUrlOrUndefined(feedUrl: string | undefined): string | undefined {
  if (typeof feedUrl !== 'string') return undefined
  return tryNormalizeAbsoluteUrl(feedUrl)
}
