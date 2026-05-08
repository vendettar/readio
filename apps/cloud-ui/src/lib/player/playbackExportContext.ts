import { useTranscriptStore } from '../../store/transcriptStore'
import type { Track } from '../db/types'
import { isPodcastDownloadTrack, isUserUploadTrack } from '../db/types'
import { getValidTranscriptUrl, hasStoredTranscriptSource } from '../remoteTranscript'
import { DownloadsRepository } from '../repositories/DownloadsRepository'
import { FilesRepository } from '../repositories/FilesRepository'
import type { PlaybackIdentitySnapshot } from './playbackIdentity'
import { resolveCurrentPlaybackIdentity } from './playbackIdentity'
import { resolveCanonicalRemotePlaybackSource, resolvePlaybackSourceAudioUrl } from './playbackMetadata'

export interface PlaybackExportContext {
  identity: PlaybackIdentitySnapshot
  track: Track | null
  resolvedLocalTrackId: string | null
  trackKind: 'user-upload' | 'podcast-download' | null
  hasMissingLocalTrackBinding: boolean
  canFallbackToCanonicalRemote: boolean
  transcriptUrl: string | null
  hasLoadedTranscript: boolean
  hasStoredTranscriptSource: boolean
  hasBuiltInTranscriptSource: boolean
  canExportTranscript: boolean
  canExportAudio: boolean
  canExportBundle: boolean
}

async function resolvePlaybackTrackBinding(localTrackId: string | null): Promise<{
  track: Track | null
  resolvedLocalTrackId: string | null
  trackKind: 'user-upload' | 'podcast-download' | null
  hasMissingLocalTrackBinding: boolean
}> {
  if (!localTrackId) {
    return {
      track: null,
      resolvedLocalTrackId: null,
      trackKind: null,
      hasMissingLocalTrackBinding: false,
    }
  }

  const track =
    (await FilesRepository.getTrackById(localTrackId)) ??
    (await DownloadsRepository.getTrackSnapshot(localTrackId)) ??
    null
  const trackKind = isUserUploadTrack(track)
    ? 'user-upload'
    : isPodcastDownloadTrack(track)
      ? 'podcast-download'
      : null

  return {
    track,
    resolvedLocalTrackId: track ? localTrackId : null,
    trackKind,
    hasMissingLocalTrackBinding: !track,
  }
}

export async function resolveCurrentPlaybackExportContext(): Promise<PlaybackExportContext | null> {
  const identity = resolveCurrentPlaybackIdentity()
  if (!identity) return null

  const transcriptUrl = getValidTranscriptUrl(identity.episodeMetadata?.transcriptUrl)
  const resolvedAudioUrl = resolvePlaybackSourceAudioUrl(identity.audioUrl, identity.episodeMetadata)
  const {
    track,
    resolvedLocalTrackId,
    trackKind,
    hasMissingLocalTrackBinding,
  } = await resolvePlaybackTrackBinding(identity.localTrackId)
  const canonicalRemoteSource = resolveCanonicalRemotePlaybackSource({
    audioUrl: identity.audioUrl,
    metadata: identity.episodeMetadata,
  })
  const canFallbackToCanonicalRemote = !resolvedLocalTrackId && canonicalRemoteSource !== null
  const hasLoadedTranscript = useTranscriptStore.getState().subtitles.length > 0
  const hasBuiltInTranscriptSource = Boolean(transcriptUrl)
  const hasStoredTranscript = resolvedLocalTrackId
    ? await hasStoredTranscriptSource(resolvedAudioUrl, resolvedLocalTrackId)
    : await hasStoredTranscriptSource(resolvedAudioUrl, null)
  const hasStoredTranscriptSourceForPlayback = hasStoredTranscript || hasBuiltInTranscriptSource
  const canExportTranscript =
    hasLoadedTranscript || hasStoredTranscriptSourceForPlayback || hasBuiltInTranscriptSource
  const canExportAudio = Boolean((trackKind && track) || canFallbackToCanonicalRemote)

  return {
    identity,
    track,
    resolvedLocalTrackId,
    trackKind,
    hasMissingLocalTrackBinding,
    canFallbackToCanonicalRemote,
    transcriptUrl,
    hasLoadedTranscript,
    hasStoredTranscriptSource: hasStoredTranscriptSourceForPlayback,
    hasBuiltInTranscriptSource,
    canExportTranscript,
    canExportAudio,
    canExportBundle: canExportTranscript && canExportAudio,
  }
}
