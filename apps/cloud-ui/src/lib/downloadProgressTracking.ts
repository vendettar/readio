import { create } from 'zustand'
import {
  buildDownloadProgressStatusKey,
  type DownloadJobOptions,
  type DownloadProgress,
} from './downloadJobOptions'
import { normalizePodcastAudioUrl } from './networking/urlUtils'

interface DownloadProgressStore {
  progressMap: Record<string, DownloadProgress>
  setProgress: (url: string, progress: DownloadProgress | null) => void
}

export const useDownloadProgressStore = create<DownloadProgressStore>((set) => ({
  progressMap: {},
  setProgress: (url, progress) =>
    set((state) => {
      if (progress === null) {
        const newMap = { ...state.progressMap }
        delete newMap[url]
        return { progressMap: newMap }
      }
      return { progressMap: { ...state.progressMap, [url]: progress } }
    }),
}))

interface CreateDownloadProgressTrackerInput {
  options: Pick<
    DownloadJobOptions,
    'audioUrl' | 'podcastItunesId' | 'episodeGuid' | 'signal' | 'onProgress'
  >
  contentLength: number | null
}

interface DownloadProgressTracker {
  trackedBody: TransformStream<Uint8Array, Uint8Array>
  clearProgress: (mode: 'success' | 'failure') => void
}

export function createDownloadProgressTracker(
  input: CreateDownloadProgressTrackerInput
): DownloadProgressTracker {
  const normalizedUrlKey = normalizePodcastAudioUrl(input.options.audioUrl)
  const progressStatusKey = buildDownloadProgressStatusKey({
    audioUrl: input.options.audioUrl,
    podcastItunesId: input.options.podcastItunesId,
    episodeGuid: input.options.episodeGuid,
  })
  const progressStore = useDownloadProgressStore.getState()

  let loadedBytes = 0
  let lastReportTime = Date.now()
  let lastLoadedBytes = 0

  const reportProgress = (speedBytesPerSecond?: number) => {
    const percent =
      input.contentLength !== null && input.contentLength > 0
        ? Math.min(100, Math.round((loadedBytes / input.contentLength) * 100))
        : null

    if (!normalizedUrlKey) {
      if (input.options.onProgress) {
        input.options.onProgress({
          loadedBytes,
          totalBytes: input.contentLength,
          percent,
        })
      }
      return
    }

    let currentSpeed = speedBytesPerSecond
    const timeDiff = Date.now() - lastReportTime
    if (currentSpeed === undefined && timeDiff <= 500) {
      const currentProgress =
        progressStore.progressMap[progressStatusKey] ?? progressStore.progressMap[normalizedUrlKey]
      if (currentProgress && currentProgress.speedBytesPerSecond !== undefined) {
        currentSpeed = currentProgress.speedBytesPerSecond
      }
    }

    const progressData: DownloadProgress = {
      loadedBytes,
      totalBytes: input.contentLength,
      percent,
      speedBytesPerSecond: currentSpeed,
    }
    progressStore.setProgress(progressStatusKey, progressData)
    progressStore.setProgress(normalizedUrlKey, progressData)
    input.options.onProgress?.(progressData)
  }

  return {
    trackedBody: new TransformStream({
      transform(chunk: Uint8Array, controller) {
        if (input.options.signal?.aborted) {
          controller.error(new DOMException('Aborted', 'AbortError'))
          return
        }

        loadedBytes += chunk.byteLength
        const now = Date.now()
        const timeDiff = now - lastReportTime

        if (timeDiff > 500) {
          const bytesDiff = loadedBytes - lastLoadedBytes
          reportProgress((bytesDiff / timeDiff) * 1000)
          lastReportTime = now
          lastLoadedBytes = loadedBytes
        } else {
          reportProgress()
        }

        controller.enqueue(chunk)
      },
    }),
    clearProgress(mode) {
      if (!normalizedUrlKey) return
      const clear = () => {
        useDownloadProgressStore.getState().setProgress(progressStatusKey, null)
        useDownloadProgressStore.getState().setProgress(normalizedUrlKey, null)
      }

      if (mode === 'failure') {
        clear()
        return
      }

      setTimeout(clear, 2000)
    },
  }
}
