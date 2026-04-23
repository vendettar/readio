import type {
  AudioBlob,
  PlaybackSession,
  PlaybackSessionUpdatePatch,
  SubtitleText,
} from '../dexieDb'
import { DB } from '../dexieDb'

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

  updatePlaybackSession(id: string, updates: PlaybackSessionUpdatePatch): Promise<void> {
    return DB.updatePlaybackSession(id, updates)
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

  iterateAllPlaybackSessions(
    callback: (session: PlaybackSession) => void | Promise<void>
  ): Promise<void> {
    return DB.iterateAllPlaybackSessions(callback)
  },

  async trackExists(id: string): Promise<boolean> {
    const { db } = await import('../dexieDb')
    const track = await db.tracks.get(id)
    return !!track
  },
}
