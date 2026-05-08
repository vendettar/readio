import { isAbortLikeError } from '../lib/fetchUtils'
import { warn } from '../lib/logger'
import type { EpisodeMetadata } from '../lib/player/playbackMetadata'
import {
  MANUAL_PLAYBACK_AUDIO_PERSIST_REASON,
  persistManualPlaybackAudio,
  persistManualPlaybackSubtitles,
} from '../lib/player/playerPersistenceService'
import { revokePlaybackBlobUrls } from '../lib/player/playerBlobUrls'
import { parseSubtitles, type ASRCue } from '../lib/subtitles'
import { toast } from '../lib/toast'
import {
  resolvePlayerStoreBlobLoadTransition,
  type PlayerStoreAudioTransitionState,
} from './playerStoreAudioTransition'
import { useTranscriptStore } from './transcriptStore'

type BlobLoadTransitionState = PlayerStoreAudioTransitionState & {
  activeBlobUrls: string[]
}

export function buildPlayerStoreBlobLoadState(
  state: BlobLoadTransitionState,
  input: {
    url: string
    title: string
    coverArt: string | Blob | null
    sessionId: string | null
    metadata: EpisodeMetadata | null
    nextDurationSeconds: number
  }
) {
  revokePlaybackBlobUrls(state.activeBlobUrls)
  return {
    ...resolvePlayerStoreBlobLoadTransition(state, input),
    activeBlobUrls: [input.url],
  }
}

export function createPlayerStoreBlobLoadState(
  state: BlobLoadTransitionState,
  input: {
    blob: Blob
    title: string
    coverArt: string | Blob | null
    sessionId: string | null
    metadata: EpisodeMetadata | null
    nextDurationSeconds: number
  }
): ReturnType<typeof buildPlayerStoreBlobLoadState> {
  return buildPlayerStoreBlobLoadState(state, {
    url: URL.createObjectURL(input.blob),
    title: input.title,
    coverArt: input.coverArt,
    sessionId: input.sessionId,
    metadata: input.metadata,
    nextDurationSeconds: input.nextDurationSeconds,
  })
}

export function resetTranscriptAfterMediaLoad(): void {
  useTranscriptStore.getState().resetTranscript()
}

export function applyLoadedSubtitles(subtitles: ASRCue[]): void {
  const transcriptState = useTranscriptStore.getState()
  transcriptState.setSubtitles(subtitles)
  transcriptState.setCurrentIndex(-1)
}

export async function persistManualAudioLoadInBackground(
  file: File,
  getCurrentSessionId: () => string | null
): Promise<void> {
  try {
    const result = await persistManualPlaybackAudio({
      file,
      getCurrentSessionId,
    })
    if (!result.ok && result.reason === MANUAL_PLAYBACK_AUDIO_PERSIST_REASON.BLOCKED_BY_QUOTA) {
      toast.errorKey('downloadStorageLimit')
    }
  } catch (err) {
    if (!isAbortLikeError(err)) {
      warn('[PlayerStore] Failed to save audio to IndexedDB:', err)
    }
  }
}

export async function persistManualSubtitlesInBackground(
  filename: string,
  subtitles: ASRCue[],
  getCurrentSessionId: () => string | null
): Promise<void> {
  try {
    await persistManualPlaybackSubtitles({
      filename,
      subtitles,
      getCurrentSessionId,
    })
  } catch (err) {
    if (!isAbortLikeError(err)) {
      warn('[PlayerStore] Failed to save subtitle to IndexedDB:', err)
    }
  }
}

export async function readSubtitleFile(file: File): Promise<ASRCue[]> {
  const content = await file.text()
  return parseSubtitles(content)
}
