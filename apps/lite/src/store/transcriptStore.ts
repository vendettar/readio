// src/store/transcriptStore.ts
import { create } from 'zustand'
import type { ASRCue } from '../lib/asr/types'

export const TRANSCRIPT_INGESTION_STATUS = {
  IDLE: 'idle',
  LOADING: 'loading',
  TRANSCRIBING: 'transcribing',
  FAILED: 'failed',
} as const
export type TranscriptIngestionStatus =
  (typeof TRANSCRIPT_INGESTION_STATUS)[keyof typeof TRANSCRIPT_INGESTION_STATUS]

interface TranscriptState {
  highlightedWord: string | null
  subtitles: ASRCue[]
  subtitlesLoaded: boolean
  transcriptIngestionStatus: TranscriptIngestionStatus
  transcriptIngestionError: { code: string; message: string } | null
  abortAsrController: AbortController | null
  asrActiveTrackKey: string | null
  partialAsrCues: ASRCue[] | null
  currentIndex: number

  setHighlightedWord: (word: string | null) => void
  setSubtitles: (subtitles: ASRCue[]) => void
  setTranscriptIngestionStatus: (status: TranscriptIngestionStatus) => void
  setTranscriptIngestionError: (error: { code: string; message: string } | null) => void
  setAbortAsrController: (controller: AbortController | null) => void
  setAsrActiveTrackKey: (trackKey: string | null) => void
  setPartialAsrCues: (cues: ASRCue[] | null) => void
  setCurrentIndex: (index: number) => void
  resetTranscript: () => void
}

const initialState = {
  highlightedWord: null as string | null,
  subtitles: [] as ASRCue[],
  subtitlesLoaded: false,
  transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
  transcriptIngestionError: null as { code: string; message: string } | null,
  abortAsrController: null as AbortController | null,
  asrActiveTrackKey: null as string | null,
  partialAsrCues: null as ASRCue[] | null,
  currentIndex: -1,
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  ...initialState,

  setHighlightedWord: (word) => set({ highlightedWord: word }),

  setSubtitles: (subtitles) =>
    set({
      subtitles,
      subtitlesLoaded: subtitles.length > 0,
      transcriptIngestionStatus: TRANSCRIPT_INGESTION_STATUS.IDLE,
      transcriptIngestionError: null,
      abortAsrController: null,
      asrActiveTrackKey: null,
      partialAsrCues: null,
      currentIndex: -1,
    }),

  setTranscriptIngestionStatus: (status) =>
    set((state) => ({
      transcriptIngestionStatus: status,
      transcriptIngestionError:
        status !== TRANSCRIPT_INGESTION_STATUS.FAILED ? null : state.transcriptIngestionError,
    })),

  setTranscriptIngestionError: (error) => set({ transcriptIngestionError: error }),
  setAbortAsrController: (controller) => set({ abortAsrController: controller }),
  setAsrActiveTrackKey: (trackKey) => set({ asrActiveTrackKey: trackKey }),
  setPartialAsrCues: (cues) => set({ partialAsrCues: cues }),
  setCurrentIndex: (index) => set({ currentIndex: index }),

  resetTranscript: () =>
    set((state) => {
      if (state.abortAsrController) {
        try {
          state.abortAsrController.abort()
        } catch {
          // Ignore errors
        }
      }
      return { ...initialState }
    }),
}))
