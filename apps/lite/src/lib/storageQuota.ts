import {
  STORAGE_KEY_STORAGE_QUOTA_LAST_PERCENT,
  STORAGE_KEY_STORAGE_QUOTA_WARNED,
} from '../constants/storage'
import { BYTES_PER_GB } from '../constants/storageQuota'
import { DB } from './dexieDb'
import { logError } from './logger'
import { getAppConfig } from './runtimeConfig'
import { isValidAudioFile } from './schemas/files'
import { getJson, setJson } from './storage'
import {
  computeQuotaPercentage as computeQuotaPercentagePolicy,
  evaluateUploadGuardrailPolicy,
  shouldBlockUpload as shouldBlockUploadPolicy,
  shouldWarnOnCrossing as shouldWarnOnCrossingPolicy,
} from './storageQuotaPolicy'
import { toast } from './toast'

export function computeQuotaPercentage(usage: number, quota: number): number {
  return computeQuotaPercentagePolicy(usage, quota)
}

export function shouldWarnOnCrossing(
  percent: number,
  lastPercent: number,
  warned: boolean
): boolean {
  return shouldWarnOnCrossingPolicy(percent, lastPercent, warned)
}

export function shouldBlockUpload(usage: number, quota: number, incomingSize: number): boolean {
  return shouldBlockUploadPolicy(usage, quota, incomingSize)
}

const getSessionNumber = (key: string, fallback: number) => {
  const value = getJson<number>(key, sessionStorage)
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

const getSessionBoolean = (key: string, fallback: boolean) => {
  const value = getJson<boolean>(key, sessionStorage)
  return typeof value === 'boolean' ? value : fallback
}

type StorageQuotaMode = 'silent' | 'user'

let quotaCheckInFlight: Promise<void> | null = null

export async function checkStorageQuota({
  mode = 'user',
}: {
  mode?: StorageQuotaMode
} = {}): Promise<void> {
  if (quotaCheckInFlight) return quotaCheckInFlight

  quotaCheckInFlight = (async () => {
    try {
      const info = await DB.getStorageInfo()
      const browserInfo = info.browser
      if (!browserInfo || browserInfo.quota <= 0) {
        return
      }

      const percent = computeQuotaPercentage(browserInfo.usage, browserInfo.quota)
      const lastPercent = getSessionNumber(STORAGE_KEY_STORAGE_QUOTA_LAST_PERCENT, 0)
      const warned = getSessionBoolean(STORAGE_KEY_STORAGE_QUOTA_WARNED, false)

      if (mode === 'user' && shouldWarnOnCrossing(percent, lastPercent, warned)) {
        toast.warningKey('storageQuotaWarning')
        setJson(STORAGE_KEY_STORAGE_QUOTA_WARNED, true, sessionStorage)
      }

      setJson(STORAGE_KEY_STORAGE_QUOTA_LAST_PERCENT, percent, sessionStorage)
    } catch (err) {
      logError('[StorageQuota] Failed to check quota:', err)
    }
  })()

  try {
    await quotaCheckInFlight
  } finally {
    quotaCheckInFlight = null
  }
}

export async function evaluateUploadGuardrails(files: File[]): Promise<{ blocked: boolean }> {
  if (files.length === 0) {
    return { blocked: false }
  }

  const { MAX_AUDIO_CACHE_GB } = getAppConfig()
  const audioCacheCapBytes = Math.max(0, MAX_AUDIO_CACHE_GB) * BYTES_PER_GB

  const info = await DB.getStorageInfo()
  const browserInfo = info.browser
  const incomingSize = files.reduce((sum, file) => sum + file.size, 0)
  const incomingAudioSize = files
    .filter((file) => isValidAudioFile(file))
    .reduce((sum, file) => sum + file.size, 0)
  const audioBlobsSize = info.indexedDB?.audioBlobsSize ?? 0

  const result = evaluateUploadGuardrailPolicy({
    audioCacheCapBytes,
    audioBlobsSize,
    incomingAudioSize,
    incomingTotalSize: incomingSize,
    browserUsage: browserInfo?.usage,
    browserQuota: browserInfo?.quota,
  })

  if (result.blocked) {
    toast.errorKey('storageQuotaUploadBlocked')
    return { blocked: true }
  }

  return { blocked: false }
}
