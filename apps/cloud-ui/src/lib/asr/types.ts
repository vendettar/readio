/** Word-level timestamp from ASR provider */
export interface ASRWord {
  word: string
  start: number
  end: number
  confidence?: number
}

/** Extended cue with word-level detail and optional speaker */
export interface ASRCue {
  start: number
  end: number
  text: string
  words?: ASRWord[]
  speakerId?: string
}

/** Result of a single ASR transcription call */
export interface ASRTranscriptionResult {
  cues: ASRCue[]
  language?: string
  durationSeconds?: number
  provider: ASRProvider
  model: string
}

export const ASR_PROVIDER_IDS = ['groq', 'qwen', 'deepgram', 'volcengine'] as const
export type ASRProvider = (typeof ASR_PROVIDER_IDS)[number]

export type ASRClientErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'payload_too_large'
  | 'service_unavailable'
  | 'client_error'
  | 'network_error'
  | 'aborted'
  | 'file_too_large'

export class ASRClientError extends Error {
  code: ASRClientErrorCode
  status?: number
  retryAfterMs?: number
  rateLimitKind?: 'asph' | 'generic' | null

  constructor(
    message: string,
    code: ASRClientErrorCode,
    status?: number,
    retryAfterMs?: number,
    rateLimitKind?: 'asph' | 'generic' | null
  ) {
    super(message)
    this.name = 'ASRClientError'
    this.code = code
    this.status = status
    this.retryAfterMs = retryAfterMs
    this.rateLimitKind = rateLimitKind
  }
}
