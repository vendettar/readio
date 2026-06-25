const activePlaybackBlobUrls = new Set<string>()

function isBlobUrl(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('blob:')
}

export function createPlaybackBlobUrl(blob: Blob): string {
  const url = URL.createObjectURL(blob)
  activePlaybackBlobUrls.add(url)
  return url
}

export function registerPlaybackBlobUrl(url: string): string {
  if (isBlobUrl(url)) {
    activePlaybackBlobUrls.add(url)
  }
  return url
}

export function isPlaybackBlobUrlActive(url: string): boolean {
  return activePlaybackBlobUrls.has(url)
}

export function revokePlaybackBlobUrl(url: string): void {
  if (!isBlobUrl(url) || !activePlaybackBlobUrls.has(url)) return

  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ignore revocation errors.
  } finally {
    activePlaybackBlobUrls.delete(url)
  }
}

export function revokePlaybackBlobUrls(urls: readonly string[]): void {
  Array.from(new Set(urls)).forEach((url) => {
    revokePlaybackBlobUrl(url)
  })
}

export function collectPlaybackBlobUrls(
  audioUrl: string | null,
  coverArt: string | Blob | null
): string[] {
  const blobUrls = new Set<string>()
  if (isBlobUrl(audioUrl)) {
    blobUrls.add(registerPlaybackBlobUrl(audioUrl))
  }
  if (isBlobUrl(coverArt)) {
    blobUrls.add(registerPlaybackBlobUrl(coverArt))
  }
  return Array.from(blobUrls)
}

export function __resetPlaybackBlobUrlOwnerForTests(): void {
  activePlaybackBlobUrls.clear()
}
