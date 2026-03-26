import { describe, expect, it } from 'vitest'
import {
  computeQuotaPercentage,
  evaluateUploadGuardrailPolicy,
  shouldBlockUpload,
  shouldWarnOnCrossing,
} from '../storageQuotaPolicy'

describe('storageQuotaPolicy', () => {
  it('computes quota percentage in 0..100 scale', () => {
    expect(computeQuotaPercentage(50, 100)).toBe(50)
    expect(computeQuotaPercentage(10, 0)).toBe(0)
  })

  it('warns only when crossing threshold in percent space', () => {
    expect(shouldWarnOnCrossing(80, 79, false)).toBe(true)
    expect(shouldWarnOnCrossing(80, 80, false)).toBe(false)
    expect(shouldWarnOnCrossing(90, 70, true)).toBe(false)
  })

  it('blocks upload on quota threshold and hard-threshold projection', () => {
    expect(shouldBlockUpload(85, 100, 1)).toBe(true)
    expect(shouldBlockUpload(80, 100, 16)).toBe(true)
    expect(shouldBlockUpload(80, 100, 10)).toBe(false)
  })

  it('prioritizes audio-cap reason when audio cap is exceeded', () => {
    const result = evaluateUploadGuardrailPolicy({
      audioCacheCapBytes: 100,
      audioBlobsSize: 100,
      incomingAudioSize: 1,
      incomingTotalSize: 1,
      browserUsage: 0,
      browserQuota: 100,
    })
    expect(result).toEqual({ blocked: true, reason: 'audio-cap' })
  })

  it('returns non-blocking when browser quota is unavailable', () => {
    const result = evaluateUploadGuardrailPolicy({
      audioCacheCapBytes: 0,
      audioBlobsSize: 0,
      incomingAudioSize: 10,
      incomingTotalSize: 10,
      browserUsage: null,
      browserQuota: null,
    })
    expect(result).toEqual({ blocked: false, reason: 'none' })
  })

  it('returns block reason for ratio threshold and projected hard threshold', () => {
    const byRatio = evaluateUploadGuardrailPolicy({
      audioCacheCapBytes: 0,
      audioBlobsSize: 0,
      incomingAudioSize: 1,
      incomingTotalSize: 1,
      browserUsage: 86,
      browserQuota: 100,
    })
    expect(byRatio).toEqual({ blocked: true, reason: 'quota-block-threshold' })

    const byProjection = evaluateUploadGuardrailPolicy({
      audioCacheCapBytes: 0,
      audioBlobsSize: 0,
      incomingAudioSize: 1,
      incomingTotalSize: 20,
      browserUsage: 80,
      browserQuota: 100,
    })
    expect(byProjection).toEqual({ blocked: true, reason: 'quota-hard-threshold' })
  })
})
