import { error as logError } from '../logger'

import type { ReadioDB } from './schema'

export interface StorageStats {
  sessions: number
  audioBlobs: number
  subtitles: number
  remoteTranscripts: number
  totalSize: number
}

export interface StorageInfo {
  indexedDB: {
    sessions: number
    audioBlobs: number
    audioBlobsSize: number
    subtitles: number
    subtitlesSize: number
    remoteTranscripts: number
    remoteTranscriptsSize: number
    totalSize: number
  }
  browser: {
    usage: number
    quota: number
    available: number
    percentage: number
  } | null
}

function getRemoteTranscriptSize(cues: unknown): number {
  return new Blob([JSON.stringify(cues)]).size
}

async function getIndexedDbStorage(db: ReadioDB) {
  const [sessions, audioBlobs, subtitles, remoteTranscripts] = await Promise.all([
    db.playback_sessions.count(),
    db.audioBlobs.toArray(),
    db.subtitles.toArray(),
    db.remote_transcripts.toArray(),
  ])

  const audioBlobsSize = audioBlobs.reduce((sum, audioBlob) => sum + audioBlob.size, 0)
  const subtitlesSize = subtitles.reduce((sum, subtitle) => sum + subtitle.size, 0)
  const remoteTranscriptsSize = remoteTranscripts.reduce(
    (sum, transcript) => sum + getRemoteTranscriptSize(transcript.cues),
    0
  )

  return {
    sessions,
    audioBlobs: audioBlobs.length,
    audioBlobsSize,
    subtitles: subtitles.length,
    subtitlesSize,
    remoteTranscripts: remoteTranscripts.length,
    remoteTranscriptsSize,
    totalSize: audioBlobsSize + subtitlesSize + remoteTranscriptsSize,
  }
}

async function getBrowserStorageInfo(): Promise<StorageInfo['browser']> {
  const estimate = globalThis.navigator?.storage?.estimate
  if (!estimate) return null

  try {
    const { usage = 0, quota = 0 } = await estimate.call(globalThis.navigator.storage)
    return {
      usage,
      quota,
      available: quota - usage,
      percentage: quota > 0 ? (usage / quota) * 100 : 0,
    }
  } catch (err) {
    logError('[DB] Failed to get browser storage estimate:', err)
    return null
  }
}

export function createStorageInfoDbMethods(db: ReadioDB) {
  return {
    async getStorageStats(): Promise<StorageStats> {
      const indexedDB = await getIndexedDbStorage(db)

      return {
        sessions: indexedDB.sessions,
        audioBlobs: indexedDB.audioBlobs,
        subtitles: indexedDB.subtitles,
        remoteTranscripts: indexedDB.remoteTranscripts,
        totalSize: indexedDB.totalSize,
      }
    },

    async getStorageInfo(): Promise<StorageInfo> {
      const [indexedDB, browser] = await Promise.all([
        getIndexedDbStorage(db),
        getBrowserStorageInfo(),
      ])

      return {
        indexedDB,
        browser,
      }
    },
  }
}
