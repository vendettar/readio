import type { ASRCue } from '../../asr/types'
import type { ExplorePlaybackSession, PlaybackSession } from '../../dexieDb'
import { isNavigableExplorePlaybackSession } from '../../dexieDb'
import { log, warn } from '../../logger'
import { DownloadsRepository } from '../../repositories/DownloadsRepository'
import { FilesRepository } from '../../repositories/FilesRepository'
import { PlaybackRepository } from '../../repositories/PlaybackRepository'
import {
  buildRestoredLocalBlobState,
  buildRestoredRemoteSessionState,
  type RestoredPlaybackState,
} from './playerSessionRestore'

export interface PlayerSessionRestoreResult {
  hasResumableSession: boolean
  durationSeconds: number | null
  restoredState: RestoredPlaybackState | null
  subtitleCues: ASRCue[] | null
}

async function resolveTrackArtwork(
  trackId: string | null | undefined
): Promise<string | Blob | null> {
  if (!trackId) return null

  try {
    return await FilesRepository.resolveTrackArtwork(trackId)
  } catch (err) {
    warn('[PlayerSessionRestoreService] Failed to restore artwork for local track', err)
    return null
  }
}

async function loadLocalBlobState(
  session: PlaybackSession,
  audioBlobId: string,
  localTrackId?: string | null
): Promise<RestoredPlaybackState | null> {
  const audioData = await PlaybackRepository.getAudioBlob(audioBlobId)
  if (!audioData) return null

  const file = new File([audioData.blob], audioData.filename, {
    type: audioData.type,
  })
  const audioUrl = URL.createObjectURL(file)
  const artwork = await resolveTrackArtwork(localTrackId ?? session.localTrackId)

  return buildRestoredLocalBlobState({
    session,
    audioUrl,
    audioTitle: file.name,
    coverArtUrl: artwork,
    activeBlobUrls: [audioUrl],
    localTrackId,
  })
}

async function loadExploreSessionState(
  session: ExplorePlaybackSession
): Promise<RestoredPlaybackState | null> {
  if (isNavigableExplorePlaybackSession(session)) {
    const downloadedTrack = await DownloadsRepository.findTrackByPodcastAndEpisode(
      session.podcastItunesId,
      session.episodeGuid
    )

    if (downloadedTrack) {
      const localState = await loadLocalBlobState(
        session,
        downloadedTrack.audioId,
        downloadedTrack.id
      )
      if (localState) {
        log(
          '[PlayerSessionRestoreService] Restoring remote session from local download:',
          downloadedTrack.audioId
        )
        return buildRestoredRemoteSessionState({
          session,
          audioUrl: localState.audioUrl,
          coverArtUrl: localState.coverArtUrl || session.artworkUrl,
          activeBlobUrls: localState.activeBlobUrls,
          localTrackId: downloadedTrack.id,
          originalAudioUrl: session.audioUrl,
        })
      }
    }
  }

  return buildRestoredRemoteSessionState({
    session,
    audioUrl: session.audioUrl,
    coverArtUrl: session.artworkUrl,
  })
}

async function loadSessionSubtitleCues(session: PlaybackSession): Promise<ASRCue[] | null> {
  if (!session.subtitleId) return null

  const subtitleData = await PlaybackRepository.getSubtitle(session.subtitleId)
  return subtitleData?.cues ?? null
}

export async function loadPlayerSessionRestore(): Promise<PlayerSessionRestoreResult> {
  const lastSession = await PlaybackRepository.getLastPlaybackSession()
  if (!lastSession || lastSession.progress <= 0) {
    return {
      hasResumableSession: false,
      durationSeconds: null,
      restoredState: null,
      subtitleCues: null,
    }
  }

  const durationSeconds =
    typeof lastSession.durationSeconds === 'number' ? lastSession.durationSeconds : null

  let restoredState: RestoredPlaybackState | null = null
  if (lastSession.audioId) {
    restoredState = await loadLocalBlobState(lastSession, lastSession.audioId)
  } else if (lastSession.source === 'explore' && lastSession.audioUrl) {
    restoredState = await loadExploreSessionState(lastSession)
  }

  return {
    hasResumableSession: true,
    durationSeconds,
    restoredState,
    subtitleCues: await loadSessionSubtitleCues(lastSession),
  }
}
