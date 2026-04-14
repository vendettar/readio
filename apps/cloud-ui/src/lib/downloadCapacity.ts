/**
 * Download Capacity Enforcement (Instruction 124)
 *
 * Pre-flight and post-persist capacity checks for podcast downloads.
 * Uses MAX_AUDIO_CACHE_GB as the only cap config.
 */

import { BYTES_PER_GB } from '../constants/storageQuota'
import { db } from './dexieDb'
import { logError } from './logger'
import { getAppConfig } from './runtimeConfig'

export interface CapacityCheckResult {
  allowed: boolean
  reason?: 'over_cap' | 'known_size_exceeds' | 'physical_quota_insufficient'
  currentUsageBytes: number
  capBytes: number
}

/**
 * Get total bytes used by all audioBlobs rows (global audio cache).
 */
export async function getAudioBlobsTotalBytes(): Promise<number> {
  let total = 0
  await db.audioBlobs.each((blob) => {
    total += blob.size
  })
  return total
}

/**
 * Pre-flight capacity check before starting a download.
 *
 * Policy (from instruction 124):
 * 1. If current usage already exceeds cap, block immediately.
 * 2. If Content-Length exists and usage + contentLength > cap, block immediately.
 * 3. If Content-Length is absent, allow this attempt.
 * 4. If navigator.storage.estimate() shows insufficient physical quota, fail early.
 */
export async function checkDownloadCapacity(
  contentLengthBytes: number | null
): Promise<CapacityCheckResult> {
  const { MAX_AUDIO_CACHE_GB } = getAppConfig()
  const capBytes = Math.max(0, MAX_AUDIO_CACHE_GB) * BYTES_PER_GB
  let currentUsageBytes: number

  try {
    currentUsageBytes = await getAudioBlobsTotalBytes()
  } catch (err) {
    logError('[downloadCapacity] Failed to compute usage:', err)
    // Fail open — allow download attempt
    return { allowed: true, currentUsageBytes: 0, capBytes }
  }

  // 1. Already over cap → block
  if (capBytes > 0 && currentUsageBytes >= capBytes) {
    return {
      allowed: false,
      reason: 'over_cap',
      currentUsageBytes,
      capBytes,
    }
  }

  // 2. Known size → hard pre-flight check
  if (contentLengthBytes !== null && capBytes > 0) {
    if (currentUsageBytes + contentLengthBytes > capBytes) {
      return {
        allowed: false,
        reason: 'known_size_exceeds',
        currentUsageBytes,
        capBytes,
      }
    }
  }

  // 3. Physical quota check
  if (navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate()
      const quota = estimate.quota
      const usage = estimate.usage

      if (
        typeof quota === 'number' &&
        Number.isFinite(quota) &&
        typeof usage === 'number' &&
        Number.isFinite(usage)
      ) {
        const remaining = quota - usage
        const criticallyLowThreshold = 5 * 1024 * 1024 // 5MB guard
        const isInsufficient =
          contentLengthBytes !== null
            ? remaining < contentLengthBytes
            : remaining < criticallyLowThreshold

        if (isInsufficient) {
          return {
            allowed: false,
            reason: 'physical_quota_insufficient',
            currentUsageBytes,
            capBytes,
          }
        }
      }
    } catch (err) {
      logError('[downloadCapacity] navigator.storage.estimate failed:', err)
    }
  }

  // 4. Unknown size (no content-length) → allow this attempt
  return { allowed: true, currentUsageBytes, capBytes }
}
