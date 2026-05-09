import { useEpisodeStatus } from '../../hooks/useEpisodeStatus'
import type { EpisodeMetadataInput } from '../../lib/player/metadata/playbackMetadataModel'
import {
  resolveCanonicalRemotePlaybackSource,
  resolvePlaybackSourceAudioUrl,
} from '../../lib/player/playbackMetadata'

export function usePlayerDownloadSource(input: {
  audioUrl: string | null | undefined
  metadata?: EpisodeMetadataInput | null
}) {
  const sourceIdentityUrl = resolvePlaybackSourceAudioUrl(input.audioUrl, input.metadata)
  const canonicalRemoteSource = resolveCanonicalRemotePlaybackSource({
    audioUrl: input.audioUrl,
    metadata: input.metadata,
  })
  const status = useEpisodeStatus(
    canonicalRemoteSource
      ? {
          audioUrl: canonicalRemoteSource.audioUrl,
          podcastItunesId: canonicalRemoteSource.metadata.podcastItunesId,
          episodeGuid: canonicalRemoteSource.metadata.episodeGuid,
        }
      : sourceIdentityUrl
  )

  return {
    sourceIdentityUrl,
    canonicalRemoteSource,
    isDownloadable: Boolean(sourceIdentityUrl) && !sourceIdentityUrl.startsWith('blob:'),
    status,
  }
}
