import { useCallback, useMemo } from 'react'
import { useNetworkStatus } from '../../hooks/useNetworkStatus'
import type { ASRCue } from '../../lib/asr/types'
import type { FileSubtitle, PodcastDownload } from '../../lib/db/types'
import { buildEpisodeCompactKey } from '../../lib/discovery/editorPicks'
import { warn as logWarn } from '../../lib/logger'
import {
  createCanonicalRemoteEpisodeMetadata,
  type CanonicalRemoteEpisodeMetadata,
  normalizeCountryAtSave,
} from '../../lib/player/playbackMetadata'
import { resolvePlaybackSource } from '../../lib/player/playbackSource'
import {
  canPlayRemoteStreamWithoutTranscript,
  playStreamWithoutTranscriptWithDeps,
} from '../../lib/player/remotePlayback'
import { DownloadsRepository } from '../../lib/repositories/DownloadsRepository'
import { buildPodcastEpisodeRoute } from '../../lib/routes/podcastRoutes'
import { selectPlaybackSubtitle } from '../../lib/downloads/subtitleSelection'
import type { SubtitleExportFormat } from '../../lib/subtitles'
import { usePlayerStore } from '../../store/playerStore'
import { usePlayerSurfaceStore } from '../../store/playerSurfaceStore'
import { useTranscriptStore } from '../../store/transcriptStore'
import type { ViewDensity } from '../Files/types'
import { DownloadTrackCard } from './DownloadTrackCard'

const COMPLETED_RESTORE_THRESHOLD_SECONDS = 2

function buildPlaybackMetadata(track: PodcastDownload): CanonicalRemoteEpisodeMetadata | null {
  const countryAtSave = normalizeCountryAtSave(track.countryAtSave)
  if (!countryAtSave) {
    return null
  }

  return createCanonicalRemoteEpisodeMetadata({
    showTitle: track.sourcePodcastTitle,
    artworkUrl: track.sourceArtworkUrl,
    originalAudioUrl: track.sourceUrlNormalized,
    transcriptUrl: track.transcriptUrl,
    durationSeconds: track.durationSeconds,
    countryAtSave,
    podcastItunesId: track.sourcePodcastItunesId,
    episodeGuid: track.sourceEpisodeGuid,
  })
}

export function DownloadedTrackItem({
  track,
  onRemove,
  onToggleFavorite,
  favorited,
  canFavorite,
  artworkBlob,
  subtitles,
  onSetActiveSubtitle,
  onDeleteSubtitle,
  onExportSubtitle,
  onExportAudio,
  onImportSubtitle,
  onRetranscribe,
  density,
}: {
  track: PodcastDownload
  onRemove: (id: string) => Promise<boolean>
  onToggleFavorite: (track: PodcastDownload, favorited: boolean) => Promise<void>
  favorited: boolean
  canFavorite: boolean
  artworkBlob: Blob | null
  subtitles: FileSubtitle[]
  onSetActiveSubtitle: (trackId: string, subtitleId: string) => Promise<void> | void
  onDeleteSubtitle: (trackId: string, fileSubtitleId: string) => Promise<boolean> | boolean
  onExportSubtitle: (
    trackId: string,
    fileSubtitleId: string,
    format: SubtitleExportFormat
  ) => Promise<void> | void
  onExportAudio: (trackId: string) => Promise<void> | void
  onImportSubtitle: (trackId: string) => void
  onRetranscribe: (trackId: string) => Promise<void> | void
  density?: ViewDensity
}) {
  const setAudioUrl = usePlayerStore((s) => s.setAudioUrl)
  const setSubtitlesStore = useTranscriptStore((s) => s.setSubtitles)
  const play = usePlayerStore((s) => s.play)
  const pause = usePlayerStore((s) => s.pause)
  const setSessionId = usePlayerStore((s) => s.setSessionId)
  const seekTo = usePlayerStore((s) => s.seekTo)
  const queueAutoplayAfterPendingSeek = usePlayerStore((s) => s.queueAutoplayAfterPendingSeek)
  const setPlaybackTrackId = usePlayerStore((s) => s.setPlaybackTrackId)
  const setPlayableContext = usePlayerSurfaceStore((s) => s.setPlayableContext)
  const toDocked = usePlayerSurfaceStore((s) => s.toDocked)
  const { isOnline } = useNetworkStatus()

  const resolveSessionRestoreState = useCallback(async () => {
    const session = await DownloadsRepository.getRestoreSessionByTrackId(track.id)
    const sessionProgress = session?.progress ?? 0
    const sessionDuration = session?.durationSeconds ?? 0
    const isSessionComplete =
      sessionDuration > 0 &&
      sessionProgress >= Math.max(0, sessionDuration - COMPLETED_RESTORE_THRESHOLD_SECONDS)
    const resumeAt =
      sessionProgress > 0
        ? isSessionComplete
          ? 0
          : Math.min(sessionProgress, sessionDuration || Infinity)
        : 0

    return { session, resumeAt }
  }, [track.id])

  const handlePlay = useCallback(
    async (overrideSubtitleId?: string) => {
      if (!track.sourceUrlNormalized) return
      const { session, resumeAt } = await resolveSessionRestoreState()
      const source = await resolvePlaybackSource(track.sourceUrlNormalized)
      const readySubs = await DownloadsRepository.getReadySubtitlesByTrackId(track.id)

      let parsedSubtitles: ASRCue[] = []
      const target = selectPlaybackSubtitle(readySubs, overrideSubtitleId)
      if (target) {
        parsedSubtitles = target.subtitle.cues
      }

      const metadata = buildPlaybackMetadata(track)
      if (!metadata) {
        logWarn('[DownloadsPage] Invalid canonical playback metadata for downloaded track', {
          trackId: track.id,
        })
        return
      }

      setAudioUrl(
        source.url,
        track.sourceEpisodeTitle || track.name,
        track.sourceArtworkUrl || null,
        metadata,
        false
      )
      setSubtitlesStore(parsedSubtitles)
      setSessionId(session?.id ?? null)
      setPlaybackTrackId(source.trackId ?? track.id)
      setPlayableContext(true)
      toDocked()

      if (resumeAt > 0) {
        queueAutoplayAfterPendingSeek()
        seekTo(resumeAt)
      } else {
        play()
      }
    },
    [
      play,
      queueAutoplayAfterPendingSeek,
      resolveSessionRestoreState,
      seekTo,
      setAudioUrl,
      setPlayableContext,
      setPlaybackTrackId,
      setSessionId,
      setSubtitlesStore,
      toDocked,
      track,
    ]
  )

  const handlePlayWithoutTranscript = useCallback(async () => {
    if (!track.sourceUrlNormalized) return
    const { session, resumeAt } = await resolveSessionRestoreState()
    const metadata = buildPlaybackMetadata(track)
    if (!metadata) {
      logWarn('[DownloadsPage] Invalid canonical playback metadata for remote stream', {
        trackId: track.id,
      })
      return
    }

    const streamStart = await playStreamWithoutTranscriptWithDeps(
      { setAudioUrl, play, pause, setPlaybackTrackId },
      {
        streamTarget: {
          sourceUrlNormalized: track.sourceUrlNormalized,
        },
        title: track.sourceEpisodeTitle || track.name,
        artwork: track.sourceArtworkUrl || '',
        metadata,
      }
    )

    if (!streamStart.started) return
    setSessionId(session?.id ?? null)
    setPlayableContext(true)
    toDocked()
    if (resumeAt > 0) {
      queueAutoplayAfterPendingSeek()
      seekTo(resumeAt)
    }
  }, [
    pause,
    play,
    queueAutoplayAfterPendingSeek,
    resolveSessionRestoreState,
    seekTo,
    setAudioUrl,
    setPlayableContext,
    setPlaybackTrackId,
    setSessionId,
    toDocked,
    track,
  ])

  const canPlayLocalWithoutTranscript = Boolean(track.audioId) && !track.isCorrupted
  const canPlayRemoteWithoutTranscript = canPlayRemoteStreamWithoutTranscript(
    {
      sourceUrlNormalized: track.sourceUrlNormalized,
    },
    isOnline
  )
  const showPlayWithoutTranscriptAction =
    canPlayLocalWithoutTranscript || canPlayRemoteWithoutTranscript

  const episodeRoute = useMemo(() => {
    const guid = track.sourceEpisodeGuid
    if (!track.sourcePodcastItunesId || !guid || !track.countryAtSave) return null
    const episodeKey = buildEpisodeCompactKey(guid)
    if (!episodeKey) return null
    return buildPodcastEpisodeRoute({
      country: track.countryAtSave,
      podcastId: track.sourcePodcastItunesId,
      episodeKey,
    })
  }, [track.sourcePodcastItunesId, track.countryAtSave, track.sourceEpisodeGuid])

  const handleSetActiveWithPlay = useCallback(
    async (trackId: string, subtitleId: string) => {
      await onSetActiveSubtitle(trackId, subtitleId)
      await handlePlay(subtitleId)
    },
    [handlePlay, onSetActiveSubtitle]
  )

  return (
    <DownloadTrackCard
      track={track}
      artworkBlob={artworkBlob}
      subtitles={subtitles}
      density={density}
      favorite={{
        enabled: canFavorite,
        favorited,
        onToggle: () => void onToggleFavorite(track, favorited),
      }}
      onPlay={handlePlay}
      onPlayWithoutTranscript={() => {
        void handlePlayWithoutTranscript()
      }}
      showPlayWithoutTranscriptAction={showPlayWithoutTranscriptAction}
      onRemove={() => onRemove(track.id)}
      onSetActiveSubtitle={handleSetActiveWithPlay}
      onDeleteSubtitle={onDeleteSubtitle}
      onExportSubtitle={(trackId, fileSubtitleId, format) => {
        void onExportSubtitle(trackId, fileSubtitleId, format)
      }}
      onExportAudio={() => {
        void onExportAudio(track.id)
      }}
      onImportSubtitle={() => onImportSubtitle(track.id)}
      onRetranscribe={() => {
        void onRetranscribe(track.id)
      }}
      episodeRoute={episodeRoute}
    />
  )
}
