import { log } from '../logger'
import { executeWithRetry } from '../networking/transportPolicy'
import { getAppConfig } from '../runtimeConfig'
import { mergeAsrCues, splitMp3Blob, splitMp3BlobWithTargetSizes } from './mp3Chunker'
import { transcribeWithDeepgram, verifyDeepgramKey } from './providers/deepgramCompatible'
import {
  transcribeWithOpenAiCompatible,
  verifyOpenAiCompatibleKey,
} from './providers/openaiCompatible'
import { transcribeWithQwen, verifyQwenKey } from './providers/qwenCompatible'
import { transcribeWithVolcengine, verifyVolcengineKey } from './providers/volcengineCompatible'
import { isAsrProviderEnabled } from './providerToggles'
import { getAsrProviderConfig } from './registry'
import { ASRClientError, type ASRCue, type ASRProvider, type ASRTranscriptionResult } from './types'

export { getAsrProviderConfig } from './registry'
export * from './types'

export const ASR_MAX_BLOB_BYTES = 10 * 1024 * 1024
export const ABSOLUTE_MAX_CALLS = 24

const RAMP_SEQUENCE_SECONDS = [5, 10, 20, 60] as const
const STEADY_CHUNK_SECONDS = 600
const SHORT_AUDIO_BYPASS_SECONDS = 90
const MP3_PROBE_MAX_BYTES = 64 * 1024
const MP3_FRAME_SEARCH_AFTER_ID3_BYTES = 8 * 1024

const MP3_MIME_TYPES = new Set(['audio/mpeg', 'audio/mp3', 'audio/x-mp3', 'audio/mpeg3'])
const GENERIC_BINARY_MIME_TYPES = new Set([
  '',
  'application/octet-stream',
  'binary/octet-stream',
  'audio/octet-stream',
])

interface ChunkCallBudget {
  baselineCalls: number
  maxExtraCalls: number
  hardCallBudget: number
}

type ProgressiveSkipReason =
  | 'progressive_disabled'
  | 'missing_duration'
  | 'non_frame_safe_source'
  | 'baseline_at_cap'
  | 'invalid_bytes_per_second'
  | 'empty_plan'
  | 'byte_floor_exceeds_budget'
  | 'split_result_exceeds_budget'

type ChunkPlanMode = 'progressive' | 'legacy'

interface ProgressivePlanReady {
  mode: 'progressive'
  budget: ChunkCallBudget
  planSeconds: number[]
  chunkTargetsBytes: number[]
  bytesPerSecond: number
}

interface ProgressivePlanFallback {
  mode: 'fallback'
  reason: ProgressiveSkipReason
  budget: ChunkCallBudget | null
}

type ProgressivePlanDecision = ProgressivePlanReady | ProgressivePlanFallback

function isValidDurationSeconds(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function readSynchsafeInt(view: Uint8Array, start: number): number {
  return (
    ((view[start] ?? 0) << 21) |
    ((view[start + 1] ?? 0) << 14) |
    ((view[start + 2] ?? 0) << 7) |
    (view[start + 3] ?? 0)
  )
}

function isLikelyMp3FrameHeader(view: Uint8Array, index: number): boolean {
  if (index + 3 >= view.length) return false
  const b0 = view[index]
  const b1 = view[index + 1]
  const b2 = view[index + 2]

  if (b0 !== 0xff || (b1 & 0xe0) !== 0xe0) return false

  const versionId = (b1 >> 3) & 0b11
  const layer = (b1 >> 1) & 0b11
  if (versionId === 0b01 || layer === 0b00) return false

  const bitrateIndex = (b2 >> 4) & 0b1111
  const sampleRateIndex = (b2 >> 2) & 0b11
  if (bitrateIndex === 0 || bitrateIndex === 0b1111 || sampleRateIndex === 0b11) return false

  return true
}

async function hasMp3FrameHeader(blob: Blob): Promise<boolean> {
  // Probe only the head slice to avoid pulling large audio into memory.
  const headSlice = blob.slice(0, MP3_PROBE_MAX_BYTES) as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>
  }

  let probe: Uint8Array
  try {
    if (typeof headSlice.arrayBuffer === 'function') {
      probe = new Uint8Array(await headSlice.arrayBuffer())
    } else {
      const blobWithArrayBuffer = blob as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }
      if (typeof blobWithArrayBuffer.arrayBuffer !== 'function') return false
      const full = new Uint8Array(await blobWithArrayBuffer.arrayBuffer())
      probe = full.subarray(0, Math.min(MP3_PROBE_MAX_BYTES, full.length))
    }
  } catch {
    return false
  }
  if (probe.length < 4) return false

  let searchStart = 0
  if (probe.length >= 10 && probe[0] === 0x49 && probe[1] === 0x44 && probe[2] === 0x33) {
    const id3Size = readSynchsafeInt(probe, 6)
    searchStart = Math.min(probe.length - 1, 10 + id3Size)
  }

  const searchEnd = Math.min(probe.length - 1, searchStart + MP3_FRAME_SEARCH_AFTER_ID3_BYTES)
  for (let i = searchStart; i < searchEnd; i++) {
    if (isLikelyMp3FrameHeader(probe, i)) return true
  }

  return false
}

async function isFrameSafeMp3Source(blob: Blob): Promise<boolean> {
  const type = blob.type.trim().toLowerCase()
  if (MP3_MIME_TYPES.has(type)) return true
  if (!GENERIC_BINARY_MIME_TYPES.has(type)) return false
  return hasMp3FrameHeader(blob)
}

function toChunkCallBudget(totalDurationSeconds: number): ChunkCallBudget {
  const baselineCalls = Math.ceil(totalDurationSeconds / STEADY_CHUNK_SECONDS)
  const maxExtraCalls = Math.min(4, Math.max(2, Math.ceil(baselineCalls * 0.5)))
  const hardCallBudget = Math.min(ABSOLUTE_MAX_CALLS, baselineCalls + maxExtraCalls)
  return { baselineCalls, maxExtraCalls, hardCallBudget }
}

function assertAsrProviderEnabled(provider: ASRProvider): void {
  if (isAsrProviderEnabled(provider, getAppConfig())) return
  throw new ASRClientError('ASR provider disabled by runtime config', 'client_error')
}

export function buildChunkDurationPlan(totalDurationSeconds: number): number[] {
  if (!isValidDurationSeconds(totalDurationSeconds)) return []
  if (totalDurationSeconds <= SHORT_AUDIO_BYPASS_SECONDS) return [totalDurationSeconds]

  const { baselineCalls, hardCallBudget } = toChunkCallBudget(totalDurationSeconds)
  if (baselineCalls >= ABSOLUTE_MAX_CALLS) return []

  const plan: number[] = []
  let remaining = totalDurationSeconds

  for (const rampSeconds of RAMP_SEQUENCE_SECONDS) {
    if (remaining <= 0) break
    const chunkSeconds = Math.min(rampSeconds, remaining)
    const projectedChunkCount =
      plan.length + 1 + Math.ceil(Math.max(0, remaining - chunkSeconds) / STEADY_CHUNK_SECONDS)
    if (projectedChunkCount > hardCallBudget) break
    plan.push(chunkSeconds)
    remaining -= chunkSeconds
  }

  while (remaining > 0) {
    plan.push(Math.min(STEADY_CHUNK_SECONDS, remaining))
    remaining -= STEADY_CHUNK_SECONDS
  }

  return plan
}

function clampChunkBytes(value: number): number {
  return Math.min(ASR_MAX_BLOB_BYTES, Math.max(1, value))
}

function scaleChunkTargetsForBudget(options: {
  originalTargets: number[]
  actualChunkCount: number
  hardCallBudget: number
}): { scale: number; scaledTargets: number[] } {
  const safeBudget = Math.max(1, options.hardCallBudget)
  const scale = options.actualChunkCount / safeBudget
  return {
    scale,
    scaledTargets: options.originalTargets.map((target) =>
      clampChunkBytes(Math.floor(target * scale))
    ),
  }
}

function resolveLegacyMaxChunkSize(blob: Blob, expectedDurationSeconds?: number): number {
  let maxChunkSize = ASR_MAX_BLOB_BYTES
  if (
    isValidDurationSeconds(expectedDurationSeconds) &&
    expectedDurationSeconds > 900 &&
    blob.size > 0
  ) {
    const bytesPerSecond = blob.size / expectedDurationSeconds
    const targetChunkSize = Math.max(1, Math.floor(bytesPerSecond * 600))
    maxChunkSize = Math.min(maxChunkSize, targetChunkSize)
  }
  return maxChunkSize
}

function enforceAbsoluteChunkCallCap(options: {
  chunkCount: number
  mode: ChunkPlanMode
  fallbackReason?: ProgressiveSkipReason
}): void {
  const { chunkCount, mode, fallbackReason } = options
  if (chunkCount <= ABSOLUTE_MAX_CALLS) return

  log('[asr] chunk plan rejected', {
    reason: 'absolute_call_cap_exceeded',
    mode,
    fallbackReason,
    chunkCount,
    absoluteMaxCalls: ABSOLUTE_MAX_CALLS,
  })

  throw new ASRClientError(
    `Audio exceeds ASR absolute chunk cap (${chunkCount} > ${ABSOLUTE_MAX_CALLS})`,
    'file_too_large'
  )
}

async function decideProgressivePlan(
  blob: Blob,
  expectedDurationSeconds: number | undefined
): Promise<ProgressivePlanDecision> {
  if (!isValidDurationSeconds(expectedDurationSeconds)) {
    return { mode: 'fallback', reason: 'missing_duration', budget: null }
  }
  if (!(await isFrameSafeMp3Source(blob))) {
    return { mode: 'fallback', reason: 'non_frame_safe_source', budget: null }
  }

  const budget = toChunkCallBudget(expectedDurationSeconds)
  if (budget.baselineCalls >= ABSOLUTE_MAX_CALLS) {
    return { mode: 'fallback', reason: 'baseline_at_cap', budget }
  }

  const planSeconds = buildChunkDurationPlan(expectedDurationSeconds)
  if (planSeconds.length === 0) {
    return { mode: 'fallback', reason: 'empty_plan', budget }
  }

  const bytesPerSecond = blob.size / expectedDurationSeconds
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return { mode: 'fallback', reason: 'invalid_bytes_per_second', budget }
  }

  const minCallsByByteCap = Math.ceil(blob.size / ASR_MAX_BLOB_BYTES)
  if (minCallsByByteCap > budget.hardCallBudget) {
    return { mode: 'fallback', reason: 'byte_floor_exceeds_budget', budget }
  }

  const chunkTargetsBytes = planSeconds.map((seconds) =>
    clampChunkBytes(Math.floor(seconds * bytesPerSecond))
  )

  return {
    mode: 'progressive',
    budget,
    planSeconds,
    chunkTargetsBytes,
    bytesPerSecond,
  }
}

export async function transcribeAudioWithRetry(options: {
  blob: Blob
  apiKey: string
  provider: ASRProvider
  model: string
  expectedDurationSeconds?: number
  preferProgressive?: boolean
  signal?: AbortSignal
  onProgress?: (partialCues: ASRCue[]) => void
}): Promise<ASRTranscriptionResult> {
  const {
    blob,
    apiKey,
    provider,
    model,
    expectedDurationSeconds,
    preferProgressive = true,
    signal,
    onProgress,
  } = options
  assertAsrProviderEnabled(provider)
  const providerConfig = getAsrProviderConfig(provider)

  const progressiveDecision = preferProgressive
    ? await decideProgressivePlan(blob, expectedDurationSeconds)
    : ({ mode: 'fallback', reason: 'progressive_disabled', budget: null } as const)
  let chunks: Blob[] | null = null
  let chunkPlanMode: ChunkPlanMode = 'legacy'
  let fallbackReason: ProgressiveSkipReason | undefined

  if (progressiveDecision.mode === 'progressive') {
    const progressiveChunks = await splitMp3BlobWithTargetSizes(
      blob,
      progressiveDecision.chunkTargetsBytes
    )
    const withinBudget =
      progressiveChunks.length <= progressiveDecision.budget.hardCallBudget &&
      progressiveChunks.length <= ABSOLUTE_MAX_CALLS

    if (withinBudget) {
      chunks = progressiveChunks
      chunkPlanMode = 'progressive'
      log('[asr] progressive chunk plan', {
        plannedDurationsSeconds: progressiveDecision.planSeconds.map((value) =>
          Number(value.toFixed(3))
        ),
        plannedChunkCount: progressiveDecision.planSeconds.length,
        actualChunkCount: progressiveChunks.length,
        baselineCalls: progressiveDecision.budget.baselineCalls,
        maxExtraCalls: progressiveDecision.budget.maxExtraCalls,
        hardCallBudget: progressiveDecision.budget.hardCallBudget,
        absoluteMaxCalls: ABSOLUTE_MAX_CALLS,
        firstChunkDurationSeconds: Number(progressiveDecision.planSeconds[0].toFixed(3)),
        firstChunkBytes: progressiveDecision.chunkTargetsBytes[0],
        bytesPerSecond: Number(progressiveDecision.bytesPerSecond.toFixed(3)),
      })
    } else {
      const { scale, scaledTargets } = scaleChunkTargetsForBudget({
        originalTargets: progressiveDecision.chunkTargetsBytes,
        actualChunkCount: progressiveChunks.length,
        hardCallBudget: progressiveDecision.budget.hardCallBudget,
      })
      const retryChunks = await splitMp3BlobWithTargetSizes(blob, scaledTargets)
      const retryWithinBudget =
        retryChunks.length <= progressiveDecision.budget.hardCallBudget &&
        retryChunks.length <= ABSOLUTE_MAX_CALLS

      if (retryWithinBudget) {
        chunks = retryChunks
        chunkPlanMode = 'progressive'
        log('[asr] progressive chunk plan converged', {
          baselineCalls: progressiveDecision.budget.baselineCalls,
          maxExtraCalls: progressiveDecision.budget.maxExtraCalls,
          hardCallBudget: progressiveDecision.budget.hardCallBudget,
          absoluteMaxCalls: ABSOLUTE_MAX_CALLS,
          firstPassChunkCount: progressiveChunks.length,
          secondPassChunkCount: retryChunks.length,
          retryScale: Number(scale.toFixed(3)),
          firstChunkBytes: scaledTargets[0],
        })
      } else {
        fallbackReason = 'split_result_exceeds_budget'
        log('[asr] progressive chunk plan skipped', {
          reason: 'split_result_exceeds_budget',
          baselineCalls: progressiveDecision.budget.baselineCalls,
          maxExtraCalls: progressiveDecision.budget.maxExtraCalls,
          hardCallBudget: progressiveDecision.budget.hardCallBudget,
          absoluteMaxCalls: ABSOLUTE_MAX_CALLS,
          firstPassChunkCount: progressiveChunks.length,
          secondPassChunkCount: retryChunks.length,
          retryScale: Number(scale.toFixed(3)),
        })
      }
    }
  } else {
    fallbackReason = progressiveDecision.reason
    log('[asr] progressive chunk plan skipped', {
      reason: progressiveDecision.reason,
      baselineCalls: progressiveDecision.budget?.baselineCalls,
      maxExtraCalls: progressiveDecision.budget?.maxExtraCalls,
      hardCallBudget: progressiveDecision.budget?.hardCallBudget,
      absoluteMaxCalls: ABSOLUTE_MAX_CALLS,
    })
  }

  if (!chunks) {
    const maxChunkSize = resolveLegacyMaxChunkSize(blob, expectedDurationSeconds)
    chunks = await splitMp3Blob(blob, maxChunkSize)
  }

  enforceAbsoluteChunkCallCap({
    chunkCount: chunks.length,
    mode: chunkPlanMode,
    fallbackReason,
  })

  const allCues: ASRCue[][] = []
  const allDurations: number[] = []

  for (let i = 0; i < chunks.length; i++) {
    if (signal?.aborted) throw new ASRClientError('ASR request aborted', 'aborted')

    const chunk = chunks[i]

    const estimatedChunkDuration =
      expectedDurationSeconds && blob.size > 0
        ? (chunk.size / blob.size) * expectedDurationSeconds
        : 0

    log(`[asr] sending chunk ${i + 1}/${chunks.length}`, {
      sizeBytes: chunk.size,
      durationSeconds: Math.round(estimatedChunkDuration),
    })

    const transcribeOnce = () => {
      if (providerConfig.transport === 'openai-compatible') {
        return transcribeWithOpenAiCompatible({
          blob: chunk,
          apiKey,
          model,
          providerConfig,
          signal,
        })
      }
      if (providerConfig.transport === 'qwen-chat-completions') {
        return transcribeWithQwen({
          blob: chunk,
          apiKey,
          model,
          providerConfig,
          signal,
        })
      }
      if (providerConfig.transport === 'deepgram-native') {
        return transcribeWithDeepgram({
          blob: chunk,
          apiKey,
          model,
          providerConfig,
          signal,
        })
      }
      if (providerConfig.transport === 'volcengine-asr') {
        return transcribeWithVolcengine({
          blob: chunk,
          apiKey,
          model,
          providerConfig,
          signal,
        })
      }
      throw new ASRClientError(`Unsupported ASR provider: ${provider}`, 'client_error')
    }

    let rateLimitRetries = 0
    let serverRetries = 0

    let result: ASRTranscriptionResult
    try {
      result = await executeWithRetry(transcribeOnce, {
        signal,
        classifyError: (error: unknown) => {
          const asrError =
            error instanceof ASRClientError
              ? error
              : new ASRClientError('ASR request failed', 'network_error')

          if (asrError.code === 'aborted') return { retry: false, delayMs: 0 }

          // Immediately abort on extreme timeouts
          if (asrError.retryAfterMs && asrError.retryAfterMs > 60000) {
            return { retry: false, delayMs: 0 }
          }

          if (asrError.code === 'rate_limited' && rateLimitRetries < 1) {
            // Retry 429 only if waiting period is <= 15s
            if (asrError.retryAfterMs !== undefined && asrError.retryAfterMs > 15000) {
              return { retry: false, delayMs: 0 }
            }
            const delayMs =
              asrError.retryAfterMs && asrError.retryAfterMs > 0 ? asrError.retryAfterMs : 2000
            rateLimitRetries += 1
            return { retry: true, delayMs, reason: 'rate_limited' }
          }

          if (asrError.code === 'service_unavailable' && serverRetries < 1) {
            // Retry 5xx only if chunk is reasonably small (<= 600s)
            if (expectedDurationSeconds && estimatedChunkDuration > 600) {
              return { retry: false, delayMs: 0 }
            }

            const delayMs =
              asrError.retryAfterMs && asrError.retryAfterMs > 0 ? asrError.retryAfterMs : 3000
            serverRetries += 1
            return { retry: true, delayMs, reason: 'service_unavailable' }
          }

          return { retry: false, delayMs: 0 }
        },
      })
    } catch (error: unknown) {
      if (
        signal?.aborted ||
        (error instanceof Error && error.name === 'AbortError') ||
        (error instanceof Error && error.message.includes('Abort'))
      ) {
        throw new ASRClientError('ASR request aborted', 'aborted')
      }
      throw error
    }

    allCues.push(result.cues)
    let chunkDuration =
      result.durationSeconds ??
      (result.cues.length > 0 ? Math.max(...result.cues.map((c: { end: number }) => c.end)) : 0)

    // Fallback for Qwen or providers that return 0 timestamps
    if (chunkDuration === 0 && estimatedChunkDuration > 0) {
      chunkDuration = estimatedChunkDuration

      // Patch zero-length cue correctly if the ASR provided none
      if (result.cues.length === 1 && result.cues[0].start === 0 && result.cues[0].end === 0) {
        result.cues[0].end = chunkDuration
      }
    }

    allDurations.push(chunkDuration)

    // Trigger progressive rendering callback
    if (onProgress) {
      onProgress(mergeAsrCues(allCues, allDurations))
    }
  }

  // 2. Merge results (Instruction 125)
  return {
    cues: mergeAsrCues(allCues, allDurations),
    provider,
    model,
    durationSeconds: allDurations.reduce((sum, d) => sum + d, 0),
  }
}

export async function verifyAsrKey(options: {
  apiKey: string
  provider: ASRProvider
  signal?: AbortSignal
}): Promise<boolean> {
  const { apiKey, provider, signal } = options
  assertAsrProviderEnabled(provider)
  const providerConfig = getAsrProviderConfig(provider)
  if (providerConfig.transport === 'openai-compatible') {
    return verifyOpenAiCompatibleKey({ apiKey, providerConfig, signal })
  }
  if (providerConfig.transport === 'qwen-chat-completions') {
    return verifyQwenKey({ apiKey, providerConfig, signal })
  }
  if (providerConfig.transport === 'deepgram-native') {
    return verifyDeepgramKey({ apiKey, providerConfig, signal })
  }
  if (providerConfig.transport === 'volcengine-asr') {
    return verifyVolcengineKey({ apiKey, providerConfig, signal })
  }
  throw new ASRClientError(`Unsupported ASR provider: ${provider}`, 'client_error')
}
