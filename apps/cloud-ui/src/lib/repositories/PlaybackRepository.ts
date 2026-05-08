import type {
  AudioBlob,
  PlaybackSession,
  PlaybackSessionCreateInput,
  PlaybackSessionUpdatePatch,
  RemoteTranscriptCache,
  SubtitleText,
} from '../dexieDb'
import { DB, db } from '../dexieDb'

export const PlaybackRepository = {
  getAllPlaybackSessions(): Promise<PlaybackSession[]> {
    return DB.getAllPlaybackSessions()
  },

  deletePlaybackSession(id: string): Promise<void> {
    return DB.deletePlaybackSession(id)
  },

  getLastPlaybackSession(): Promise<PlaybackSession | undefined> {
    return DB.getLastPlaybackSession()
  },

  getPlaybackSession(id: string): Promise<PlaybackSession | undefined> {
    return DB.getPlaybackSession(id)
  },

  upsertPlaybackSession(data: PlaybackSessionCreateInput): Promise<string> {
    return DB.upsertPlaybackSession(data)
  },

  updatePlaybackSession(id: string, updates: PlaybackSessionUpdatePatch): Promise<void> {
    return DB.updatePlaybackSession(id, updates)
  },

  findLastSessionByUrl(audioUrl: string): Promise<PlaybackSession | undefined> {
    return DB.findLastSessionByUrl(audioUrl)
  },

  findLastExploreSessionByCanonicalIdentity(
    podcastItunesId: string,
    episodeGuid: string
  ): Promise<PlaybackSession | undefined> {
    return DB.findLastExploreSessionByCanonicalIdentity(podcastItunesId, episodeGuid)
  },

  findLastSessionByTrackId(trackId: string): Promise<PlaybackSession | undefined> {
    return DB.findLastSessionByTrackId(trackId)
  },

  searchPlaybackSessionsByTitle(query: string, limit = 200): Promise<PlaybackSession[]> {
    return DB.searchPlaybackSessionsByTitle(query, limit)
  },

  searchExploreSessionsByCanonicalEpisodes(
    identities: Array<{ podcastItunesId: string; episodeGuid: string }>
  ): Promise<PlaybackSession[]> {
    return DB.searchExploreSessionsByCanonicalEpisodes(identities)
  },

  getPlaybackSessionCutoff(limit: number): Promise<number> {
    return DB.getPlaybackSessionCutoff(limit)
  },

  getOldPlaybackSessionIds(cutoff: number): Promise<string[]> {
    return DB.getOldPlaybackSessionIds(cutoff)
  },

  deletePlaybackSessionsBulk(ids: string[]): Promise<number> {
    return DB.deletePlaybackSessionsBulk(ids)
  },

  addAudioBlob(blob: Blob, filename: string): Promise<string> {
    return DB.addAudioBlob(blob, filename)
  },

  getAudioBlob(id: string): Promise<AudioBlob | undefined> {
    return DB.getAudioBlob(id)
  },

  getAllAudioBlobIds(): Promise<string[]> {
    return DB.getAllAudioBlobIds()
  },

  async getTotalAudioBlobBytes(): Promise<number> {
    let total = 0
    await db.audioBlobs.each((blob) => {
      total += blob.size
    })
    return total
  },

  deleteAudioBlobsBulk(ids: string[]): Promise<number> {
    return DB.deleteAudioBlobsBulk(ids)
  },

  addSubtitle(
    cues: import('../asr/types').ASRCue[],
    filename: string,
    asrFingerprint?: string
  ): Promise<string> {
    return DB.addSubtitle(cues, filename, asrFingerprint)
  },

  getSubtitle(id: string): Promise<SubtitleText | undefined> {
    return DB.getSubtitle(id)
  },

  findSubtitleByFingerprint(fingerprint: string): Promise<SubtitleText | undefined> {
    return DB.findSubtitleByFingerprint(fingerprint)
  },

  getRemoteTranscriptByUrl(url: string): Promise<RemoteTranscriptCache | undefined> {
    return DB.getRemoteTranscriptByUrl(url)
  },

  findRemoteTranscriptByFingerprint(
    fingerprint: string
  ): Promise<RemoteTranscriptCache | undefined> {
    return DB.findRemoteTranscriptByFingerprint(fingerprint)
  },

  upsertRemoteTranscript(
    data: Omit<RemoteTranscriptCache, 'id' | 'fetchedAt'> & {
      id: string
      fetchedAt?: number
    }
  ): Promise<string> {
    return DB.upsertRemoteTranscript(data)
  },

  pruneRemoteTranscripts(maxEntries: number, maxAgeMs: number): Promise<void> {
    return DB.pruneRemoteTranscripts(maxEntries, maxAgeMs)
  },

  iterateAllPlaybackSessions(
    callback: (session: PlaybackSession) => void | Promise<void>
  ): Promise<void> {
    return DB.iterateAllPlaybackSessions(callback)
  },

  async trackExists(id: string): Promise<boolean> {
    const track = await db.tracks.get(id)
    return !!track
  },
}
