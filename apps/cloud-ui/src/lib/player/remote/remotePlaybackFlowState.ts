import { TRANSCRIPT_INGESTION_STATUS, useTranscriptStore } from '../../../store/transcriptStore'
import { autoIngestEpisodeTranscript } from '../../remoteTranscript'
import type { EpisodeMetadata } from '../playbackMetadata'

export interface RemotePlaybackFlowDeps {
  setAudioUrl: (
    url: string | null,
    title?: string,
    coverArt?: string | Blob | null,
    metadata?: EpisodeMetadata | null,
    isPlaying?: boolean
  ) => void
  play: () => void
}

export function applyPlaybackLoadingState(input: {
  deps: RemotePlaybackFlowDeps
  playableTitle: string
  artwork: string
  metadata: EpisodeMetadata
  hasTranscriptSource: boolean
}): void {
  input.deps.setAudioUrl(null, input.playableTitle, input.artwork, input.metadata, true)
  if (input.hasTranscriptSource) {
    useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.LOADING)
  }
}

export function handlePlaybackResolutionFailure(input: {
  deps: RemotePlaybackFlowDeps
  reason: 'stale' | 'no_playable_source' | 'download_failed'
  hasTranscriptSource: boolean
}): void {
  if (input.hasTranscriptSource && input.reason !== 'stale') {
    useTranscriptStore.getState().setTranscriptIngestionStatus(TRANSCRIPT_INGESTION_STATUS.IDLE)
  }
  if (input.reason === 'no_playable_source' || input.reason === 'download_failed') {
    input.deps.setAudioUrl(null)
  }
}

export async function completePlaybackReadyState<TMetadata extends EpisodeMetadata>(input: {
  deps: RemotePlaybackFlowDeps
  source: { url: string; trackId?: string }
  playableTitle: string
  artwork: string
  metadata: TMetadata
  isStreamWithoutTranscript: boolean
  transcriptSourceUrl: string | null
  originalAudioUrl: string
  onReadyToPlay?: (ctx: {
    source: { url: string; trackId?: string }
    isStreamWithoutTranscript: boolean
    metadata: TMetadata
    playableTitle: string
  }) => void | Promise<void>
}): Promise<void> {
  if (input.isStreamWithoutTranscript) {
    useTranscriptStore.getState().resetTranscript()
  }

  input.deps.setAudioUrl(input.source.url, input.playableTitle, input.artwork, input.metadata, true)
  await input.onReadyToPlay?.({
    source: input.source,
    isStreamWithoutTranscript: input.isStreamWithoutTranscript,
    metadata: input.metadata,
    playableTitle: input.playableTitle,
  })
  input.deps.play()

  if (!input.isStreamWithoutTranscript) {
    autoIngestEpisodeTranscript(input.transcriptSourceUrl || undefined, input.originalAudioUrl)
  }
}
