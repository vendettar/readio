import { checkDownloadCapacity } from './downloadCapacity'
import { createDownloadProgressTracker } from './downloadProgressTracking'
import { CLOUD_BACKEND_FALLBACK_CLASSES, fetchWithFallback, isAbortLikeError } from './fetchUtils'
import { warn } from './logger'
import { unwrapPodcastTrackingUrl } from './networking/urlUtils'
import { toast } from './toast'

export interface DownloadBlobTransportOptions {
  audioUrl: string
  podcastItunesId: string
  episodeGuid: string
  silent?: boolean
  signal?: AbortSignal
  onProgress?: (progress: {
    loadedBytes: number
    totalBytes: number | null
    percent: number | null
    speedBytesPerSecond?: number
  }) => void
}

export type DownloadBlobTransportResult =
  | { ok: true; blob: Blob }
  | {
      ok: false
      reason: 'capacity_blocked' | 'aborted' | 'network_error' | 'quota_error'
    }

export async function downloadBlobWithProgress(
  options: DownloadBlobTransportOptions
): Promise<DownloadBlobTransportResult> {
  const { signal, onProgress } = options
  const silent = options.silent === true
  const unwrappedUrl = unwrapPodcastTrackingUrl(options.audioUrl)
  let progressTracker: ReturnType<typeof createDownloadProgressTracker> | null = null

  try {
    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    let contentLength: number | null = null
    try {
      const headRes = await fetchWithFallback<Response>(unwrappedUrl, {
        method: 'HEAD',
        signal,
        raw: true,
        purpose: 'Sizing',
        cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_HEAD,
      })

      if (headRes.body) {
        void headRes.body.cancel()
      }
      const clHeader = headRes.headers.get('content-length')
      if (clHeader) {
        const parsed = Number(clHeader)
        if (Number.isFinite(parsed) && parsed > 0) {
          contentLength = parsed
        }
      }
    } catch {
      // HEAD failed — continue with GET and unknown length.
    }

    const capacityResult = await checkDownloadCapacity(contentLength)
    if (!capacityResult.allowed) {
      if (!silent) {
        if (capacityResult.reason === 'physical_quota_insufficient') {
          toast.errorKey('downloadStorageLimitPhysical')
        } else {
          toast.errorKey('downloadStorageLimitApp')
        }
      }
      return { ok: false, reason: 'capacity_blocked' }
    }

    if (signal?.aborted) {
      return { ok: false, reason: 'aborted' }
    }

    const response = await fetchWithFallback<Response>(unwrappedUrl, {
      signal,
      raw: true,
      purpose: 'Download',
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.DOWNLOAD_GET,
    })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    if (contentLength === null) {
      const clHeader = response.headers.get('content-length')
      if (clHeader) {
        const parsed = Number(clHeader)
        if (Number.isFinite(parsed) && parsed > 0) {
          contentLength = parsed
        }
      }
    }

    if (!response.body) {
      throw new Error('Response body is not readable')
    }

    progressTracker = createDownloadProgressTracker({
      options: {
        audioUrl: options.audioUrl,
        podcastItunesId: options.podcastItunesId,
        episodeGuid: options.episodeGuid,
        signal,
        onProgress,
      },
      contentLength,
    })

    try {
      const trackedResponse = new Response(response.body.pipeThrough(progressTracker.trackedBody), {
        headers: response.headers,
      })
      const blob = await trackedResponse.blob()
      if (signal?.aborted) {
        return { ok: false, reason: 'aborted' }
      }
      return { ok: true, blob }
    } catch (err: unknown) {
      if ((err as DOMException)?.name === 'AbortError' || signal?.aborted) {
        return { ok: false, reason: 'aborted' }
      }
      throw err
    }
  } catch (err) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      return { ok: false, reason: 'aborted' }
    }

    if (err instanceof DOMException && err.name === 'QuotaExceededError') {
      if (!silent) {
        toast.errorKey('downloadStorageLimitPhysical')
      }
      return { ok: false, reason: 'quota_error' }
    }

    if (!isAbortLikeError(err)) {
      warn('[download] Failed:', err)
    }
    return { ok: false, reason: 'network_error' }
  } finally {
    progressTracker?.clearProgress(signal?.aborted ? 'failure' : 'success')
  }
}
