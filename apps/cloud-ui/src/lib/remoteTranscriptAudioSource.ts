import { ASRClientError } from './asr'
import { CLOUD_BACKEND_FALLBACK_CLASSES, FetchError, fetchWithFallback } from './fetchUtils'
import { unwrapPodcastTrackingUrl } from './networking/urlUtils'
import { normalizeAsrAudioUrl } from './remoteTranscriptResource'
import { FilesRepository } from './repositories/FilesRepository'
import { PlaybackRepository } from './repositories/PlaybackRepository'
import { findDownloadedTrack } from './downloadService'

export class AudioDownloadError extends Error {
  code = 'audio_download_error' as const

  constructor(message: string) {
    super(message)
    this.name = 'AudioDownloadError'
  }
}

function mapStatusToAsrError(status: number, message: string): ASRClientError {
  if (status === 401) return new ASRClientError(message, 'unauthorized', status)
  if (status === 413) return new ASRClientError(message, 'payload_too_large', status)
  if (status === 429) return new ASRClientError(message, 'rate_limited', status)
  if (status >= 500) return new ASRClientError(message, 'service_unavailable', status)
  return new ASRClientError(message, 'client_error', status)
}

async function fetchRemoteAudioBlob(audioUrl: string, signal?: AbortSignal): Promise<Blob> {
  const unwrappedUrl = unwrapPodcastTrackingUrl(audioUrl)

  try {
    const response = await fetchWithFallback<Response>(unwrappedUrl, {
      signal,
      raw: true,
      method: 'GET',
      purpose: 'ASR-Fetch',
      cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.ASR_AUDIO,
    })

    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/html') || contentType.includes('application/json')) {
      throw new AudioDownloadError(`Received non-audio response (${contentType})`)
    }

    return await response.blob()
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ASRClientError('ASR request aborted', 'aborted')
    }
    if (error instanceof FetchError) {
      throw mapStatusToAsrError(error.status ?? 0, error.message)
    }
    throw new AudioDownloadError(
      error instanceof Error ? error.message : 'Network error while downloading audio'
    )
  }
}

export async function fetchTrackAudioBlob(
  expectedAudioUrl: string,
  localTrackId: string | null,
  signal?: AbortSignal
): Promise<Blob> {
  if (localTrackId) {
    const track = await FilesRepository.getTrackById(localTrackId)
    if (track) {
      const audioBlob = await PlaybackRepository.getAudioBlob(track.audioId)
      if (!audioBlob) {
        throw new ASRClientError('Missing local track audio blob', 'client_error')
      }
      return audioBlob.blob
    }
    throw new ASRClientError('Missing local track or download', 'client_error')
  }

  const downloadedMeta = await findDownloadedTrack(normalizeAsrAudioUrl(expectedAudioUrl))
  if (downloadedMeta?.audioId) {
    const audioBlob = await PlaybackRepository.getAudioBlob(downloadedMeta.audioId)
    if (audioBlob) {
      return audioBlob.blob
    }
  }

  return fetchRemoteAudioBlob(expectedAudioUrl, signal)
}
