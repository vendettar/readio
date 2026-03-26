export const PLAYBACK_REQUEST_MODE = {
  DEFAULT: 'default',
  STREAM_WITHOUT_TRANSCRIPT: 'stream_without_transcript',
} as const

export type PlaybackRequestMode = (typeof PLAYBACK_REQUEST_MODE)[keyof typeof PLAYBACK_REQUEST_MODE]
