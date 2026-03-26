import {
  QUOTA_BLOCK_THRESHOLD,
  QUOTA_HARD_BLOCK_THRESHOLD,
  QUOTA_WARNING_THRESHOLD,
} from '../constants/storageQuota'

export type UploadGuardrailReason =
  | 'none'
  | 'audio-cap'
  | 'quota-block-threshold'
  | 'quota-hard-threshold'

export interface UploadGuardrailPolicyInput {
  audioCacheCapBytes: number
  audioBlobsSize: number
  incomingAudioSize: number
  incomingTotalSize: number
  browserUsage: number | null | undefined
  browserQuota: number | null | undefined
}

export function computeQuotaPercentage(usage: number, quota: number): number {
  if (quota <= 0) return 0
  return (usage / quota) * 100
}

export function shouldWarnOnCrossing(
  percent: number,
  lastPercent: number,
  warned: boolean
): boolean {
  if (warned) return false
  const thresholdPercent = QUOTA_WARNING_THRESHOLD * 100
  return percent >= thresholdPercent && lastPercent < thresholdPercent
}

export function shouldBlockUpload(usage: number, quota: number, incomingSize: number): boolean {
  if (quota <= 0) return false
  if (usage / quota >= QUOTA_BLOCK_THRESHOLD) return true
  return usage + incomingSize > quota * QUOTA_HARD_BLOCK_THRESHOLD
}

export function evaluateUploadGuardrailPolicy({
  audioCacheCapBytes,
  audioBlobsSize,
  incomingAudioSize,
  incomingTotalSize,
  browserUsage,
  browserQuota,
}: UploadGuardrailPolicyInput): { blocked: boolean; reason: UploadGuardrailReason } {
  const exceedsAudioCap =
    audioCacheCapBytes > 0 &&
    (audioBlobsSize >= audioCacheCapBytes ||
      audioBlobsSize + incomingAudioSize > audioCacheCapBytes)

  if (exceedsAudioCap) {
    return { blocked: true, reason: 'audio-cap' }
  }

  if (!browserQuota || browserQuota <= 0 || browserUsage == null) {
    return { blocked: false, reason: 'none' }
  }

  const usageRatio = browserUsage / browserQuota
  if (usageRatio >= QUOTA_BLOCK_THRESHOLD) {
    return { blocked: true, reason: 'quota-block-threshold' }
  }

  if (browserUsage + incomingTotalSize > browserQuota * QUOTA_HARD_BLOCK_THRESHOLD) {
    return { blocked: true, reason: 'quota-hard-threshold' }
  }

  return { blocked: false, reason: 'none' }
}
