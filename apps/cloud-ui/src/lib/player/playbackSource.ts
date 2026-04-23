import { db } from '../dexieDb'
import { findDownloadedTrack } from '../downloadService'
import { logError } from '../logger'
import { normalizePodcastAudioUrl, unwrapPodcastTrackingUrl } from '../networking/urlUtils'

// Singleton check (Instruction 124) to avoid redundant Blob URL creation for repeats
let lastResolved: { normalizedUrl: string; objectUrl: string } | null = null

export async function resolvePlaybackSource(
  sourceUrl: string
): Promise<{ url: string; trackId?: string }> {
  try {
    const normalizedUrl = normalizePodcastAudioUrl(sourceUrl)
    if (!normalizedUrl) return { url: unwrapPodcastTrackingUrl(sourceUrl) }

    const track = await findDownloadedTrack(normalizedUrl)
    if (!track || !track.audioId) return { url: unwrapPodcastTrackingUrl(sourceUrl) }

    // Use cached singleton if it's identical
    if (lastResolved && lastResolved.normalizedUrl === normalizedUrl) {
      return { url: lastResolved.objectUrl, trackId: track.id }
    }

    const audioBlobRecord = await db.audioBlobs.get(track.audioId)
    if (!audioBlobRecord) {
      return { url: unwrapPodcastTrackingUrl(sourceUrl), trackId: track.id }
    }

    const objectUrl = URL.createObjectURL(audioBlobRecord.blob)
    lastResolved = { normalizedUrl, objectUrl }

    return { url: objectUrl, trackId: track.id }
  } catch (error) {
    logError(
      '[playbackSource] Failed to resolve local playback source, falling back to remote url.',
      error
    )
    return { url: unwrapPodcastTrackingUrl(sourceUrl) }
  }
}

export function __resetPlaybackSourceCache() {
  lastResolved = null
}

export function __dropPlaybackSourceObjectUrl(objectUrl: string): void {
  if (lastResolved?.objectUrl === objectUrl) {
    lastResolved = null
  }
}
