import { __dropPlaybackSourceObjectUrl } from './playbackSource'

export function revokePlaybackBlobUrl(url: string): void {
  try {
    URL.revokeObjectURL(url)
  } catch {
    // Ignore revocation errors.
  } finally {
    __dropPlaybackSourceObjectUrl(url)
  }
}

export function revokePlaybackBlobUrls(urls: readonly string[]): void {
  urls.forEach((url) => {
    revokePlaybackBlobUrl(url)
  })
}

export function collectPlaybackBlobUrls(
  audioUrl: string | null,
  coverArt: string | Blob | null
): string[] {
  const blobUrls: string[] = []
  if (audioUrl?.startsWith('blob:')) {
    blobUrls.push(audioUrl)
  }
  if (typeof coverArt === 'string' && coverArt.startsWith('blob:')) {
    blobUrls.push(coverArt)
  }
  return blobUrls
}
