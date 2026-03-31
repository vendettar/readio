import { CLOUD_BACKEND_FALLBACK_CLASSES, FetchError, fetchWithFallback } from './fetchUtils'

export const PREFETCH_ARM_THRESHOLD_SECONDS = 20
export const PREFETCH_REARM_THRESHOLD_SECONDS = 25
export const PREFETCH_BASE_INTERVAL_MS = 9_000
export const PREFETCH_MAX_BACKOFF_MS = 36_000
export const PREFETCH_MIN_BYTES = 256 * 1024
export const PREFETCH_MAX_BYTES = 2 * 1024 * 1024
export const PREFETCH_DEFAULT_WINDOW_SECONDS = 30
export const PREFETCH_SLOW3G_WINDOW_SECONDS = 15
export const PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC = 64 * 1024
export const PREFETCH_MIN_SAMPLES = 3

interface NetworkInformationLike {
  saveData?: boolean
  effectiveType?: string
}

interface PrefetchWindow {
  aheadSeconds: number
  tailSeconds: number
}

interface AudioPrefetchDeps {
  fetchImpl?: typeof fetch
  now?: () => number
  getConnection?: () => NetworkInformationLike | undefined
}

interface PrefetchRequestInput {
  sourceId: string
  sourceUrl: string
  audio: HTMLAudioElement
}

interface PrefetchState {
  sourceId: string | null
  inflightCount: number
  lastAttemptAt: number
  consecutiveFailures: number
  armed: boolean
  recentBitrateEstimate: number
}

function parseUnsatisfiedContentRange(header: string | null): number | null {
  if (!header) return null
  const match = /^bytes\s+\*\/(\d+)$/i.exec(header.trim())
  if (!match) return null
  const total = Number(match[1])
  return Number.isFinite(total) && total > 0 ? total : null
}

function parseContentRange(
  header: string | null
): { start: number; end: number; total: number | null } | null {
  if (!header) return null
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(header.trim())
  if (!match) return null
  const start = Number(match[1])
  const end = Number(match[2])
  const total = match[3] === '*' ? null : Number(match[3])

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) {
    return null
  }

  if (total !== null && (!Number.isFinite(total) || total <= end)) {
    return null
  }

  return { start, end, total }
}

function normalizeBitrate(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC
  }
  return value
}

function clampBytesTarget(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return PREFETCH_MIN_BYTES
  return Math.max(PREFETCH_MIN_BYTES, Math.min(PREFETCH_MAX_BYTES, Math.floor(value)))
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

function parseTotalBytesHint(url: string): number | null {
  try {
    const parsed = new URL(url)
    const raw = parsed.searchParams.get('x-total-bytes')
    if (!raw) return null
    const total = Number(raw)
    return Number.isFinite(total) && total > 0 ? Math.floor(total) : null
  } catch {
    return null
  }
}

function getBufferedWindow(audio: HTMLAudioElement): PrefetchWindow | null {
  const { buffered, currentTime } = audio
  if (!buffered || buffered.length === 0) return null

  for (let index = 0; index < buffered.length; index += 1) {
    const start = buffered.start(index)
    const end = buffered.end(index)
    if (currentTime >= start && currentTime <= end) {
      return {
        aheadSeconds: Math.max(0, end - currentTime),
        tailSeconds: Math.max(0, end),
      }
    }
  }

  return null
}

function getNetworkProfile(connection: NetworkInformationLike | undefined): {
  disabled: boolean
  windowSeconds: number
} {
  if (!connection) {
    return { disabled: false, windowSeconds: PREFETCH_DEFAULT_WINDOW_SECONDS }
  }

  if (connection.saveData) {
    return { disabled: true, windowSeconds: PREFETCH_DEFAULT_WINDOW_SECONDS }
  }

  const effectiveType = connection.effectiveType?.toLowerCase()
  if (effectiveType === '2g') {
    return { disabled: true, windowSeconds: PREFETCH_DEFAULT_WINDOW_SECONDS }
  }
  if (effectiveType === '3g') {
    return { disabled: false, windowSeconds: PREFETCH_SLOW3G_WINDOW_SECONDS }
  }

  return { disabled: false, windowSeconds: PREFETCH_DEFAULT_WINDOW_SECONDS }
}

export class AudioPrefetchScheduler {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly getConnection: () => NetworkInformationLike | undefined

  private sourceId: string | null = null
  private inflight: { key: string; sourceId: string; controller: AbortController } | null = null
  private inflightKeys = new Set<string>()
  private lastAttemptAt = 0
  private consecutiveFailures = 0
  private armed = true
  private bitrateSamples: number[] = []
  private lastRangeEndByte: number | null = null
  private knownTotalBytes: number | null = null
  private reachedEOF = false

  constructor(deps: AudioPrefetchDeps = {}) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.now = deps.now ?? (() => Date.now())
    this.getConnection =
      deps.getConnection ??
      (() => {
        if (typeof navigator === 'undefined') return undefined
        return (navigator as Navigator & { connection?: NetworkInformationLike }).connection
      })
  }

  resetForSource(sourceId: string): void {
    if (this.sourceId === sourceId) return
    this.abortAndReset(sourceId)
  }

  teardown(): void {
    this.abortAndReset(null)
  }

  getState(): PrefetchState {
    return {
      sourceId: this.sourceId,
      inflightCount: this.inflight ? 1 : 0,
      lastAttemptAt: this.lastAttemptAt,
      consecutiveFailures: this.consecutiveFailures,
      armed: this.armed,
      recentBitrateEstimate: this.getBitrateEstimate(),
    }
  }

  async maybePrefetch({ sourceId, sourceUrl, audio }: PrefetchRequestInput): Promise<void> {
    if (!isHttpUrl(sourceUrl)) return
    this.resetForSource(sourceId)
    if (this.reachedEOF) return

    const window = getBufferedWindow(audio)
    if (!window) return

    if (!this.armed) {
      if (window.aheadSeconds >= PREFETCH_REARM_THRESHOLD_SECONDS) {
        this.armed = true
      }
      return
    }

    if (window.aheadSeconds >= PREFETCH_ARM_THRESHOLD_SECONDS) return

    const profile = getNetworkProfile(this.getConnection())
    if (profile.disabled) return

    if (this.inflight) return

    const requiredInterval = Math.min(
      PREFETCH_MAX_BACKOFF_MS,
      PREFETCH_BASE_INTERVAL_MS * 2 ** Math.min(this.consecutiveFailures, 2)
    )

    const nowMs = this.now()
    if (this.lastAttemptAt > 0 && nowMs - this.lastAttemptAt < requiredInterval) return

    const bitrate = this.getBitrateEstimate()
    const bytesTarget = clampBytesTarget(bitrate * profile.windowSeconds)

    let rangeStart = Math.floor(window.tailSeconds * bitrate) + 1
    if (!Number.isFinite(rangeStart) || rangeStart < 0) rangeStart = 0

    if (this.lastRangeEndByte !== null && rangeStart <= this.lastRangeEndByte) {
      rangeStart = this.lastRangeEndByte + 1
    }

    const totalBytes = this.knownTotalBytes ?? parseTotalBytesHint(sourceUrl)
    if (this.knownTotalBytes === null && totalBytes !== null) {
      this.knownTotalBytes = totalBytes
    }

    if (totalBytes !== null && rangeStart >= totalBytes) {
      this.markEOF(totalBytes)
      return
    }

    let rangeEnd = rangeStart + bytesTarget - 1

    // Clamp range end to known file size to avoid 416 on short files
    if (totalBytes !== null && rangeEnd >= totalBytes) {
      rangeEnd = totalBytes - 1
    }

    const dedupeKey = `${sourceId}:${rangeStart}:${rangeEnd}`

    if (this.inflightKeys.has(dedupeKey)) return

    this.lastAttemptAt = nowMs
    this.armed = false

    const controller = new AbortController()
    this.inflight = { key: dedupeKey, sourceId, controller }
    this.inflightKeys.add(dedupeKey)

    try {
      const response = await fetchWithFallback<Response>(sourceUrl, {
        signal: controller.signal,
        headers: {
          Range: `bytes=${rangeStart}-${rangeEnd}`,
        },
        method: 'GET',
        raw: true,
        purpose: 'AudioPrefetch',
        fetchImpl: this.fetchImpl,
        cloudBackendFallbackClass: CLOUD_BACKEND_FALLBACK_CLASSES.AUDIO_PREFETCH_RANGE,
      })

      // Ignore stale completion without mutating active-source scheduler state.
      if (this.sourceId !== sourceId) return

      if (response.status === 416) {
        this.markEOF(parseUnsatisfiedContentRange(response.headers.get('content-range')))
        return
      }

      if (response.status !== 206) {
        controller.abort()
        this.markFailure()
        return
      }

      const contentRange = parseContentRange(response.headers.get('content-range'))
      if (!contentRange) {
        controller.abort()
        this.markFailure()
        return
      }

      if (contentRange.total !== null) {
        this.knownTotalBytes = contentRange.total
      }
      this.lastRangeEndByte = Math.max(this.lastRangeEndByte ?? 0, contentRange.end)

      const bytesTransferred = contentRange.end - contentRange.start + 1
      const derivedBitrate =
        contentRange.total && Number.isFinite(audio.duration) && audio.duration > 0
          ? contentRange.total / audio.duration
          : bytesTransferred / Math.max(profile.windowSeconds, 1)

      this.pushBitrateSample(derivedBitrate)
      this.consecutiveFailures = 0
    } catch (error) {
      // Silent failure by design.
      if (this.sourceId === sourceId) {
        if (error instanceof FetchError && error.status === 416) {
          this.markEOF(null)
          return
        }
        this.markFailure()
      }
    } finally {
      if (this.inflight?.key === dedupeKey) {
        this.inflight = null
      }
      this.inflightKeys.delete(dedupeKey)
    }
  }

  private abortAndReset(nextSourceId: string | null): void {
    this.inflight?.controller.abort()
    this.inflight = null
    this.inflightKeys.clear()

    this.sourceId = nextSourceId
    this.lastAttemptAt = 0
    this.consecutiveFailures = 0
    this.armed = true
    this.lastRangeEndByte = null
    this.knownTotalBytes = null
    this.reachedEOF = false
    this.bitrateSamples = []
  }

  private pushBitrateSample(sample: number): void {
    const normalized = normalizeBitrate(sample)
    this.bitrateSamples.push(normalized)
    if (this.bitrateSamples.length > 5) {
      this.bitrateSamples.shift()
    }
  }

  private getBitrateEstimate(): number {
    if (this.bitrateSamples.length < PREFETCH_MIN_SAMPLES) {
      return PREFETCH_FALLBACK_BITRATE_BYTES_PER_SEC
    }
    const sum = this.bitrateSamples.reduce((acc, value) => acc + normalizeBitrate(value), 0)
    return normalizeBitrate(sum / this.bitrateSamples.length)
  }

  private markFailure(): void {
    this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 2)
  }

  private markEOF(totalBytes: number | null): void {
    if (totalBytes !== null) {
      this.knownTotalBytes = totalBytes
      this.lastRangeEndByte = totalBytes - 1
    }
    this.reachedEOF = true
    this.armed = false
    this.consecutiveFailures = 0
  }
}

export function __test__audioPrefetch() {
  return {
    parseContentRange,
    clampBytesTarget,
    getNetworkProfile,
    getBufferedWindow,
    normalizeBitrate,
    isHttpUrl,
  }
}
