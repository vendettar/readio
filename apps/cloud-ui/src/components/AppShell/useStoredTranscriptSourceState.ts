import { useEffect, useState } from 'react'
import { hasStoredTranscriptSource } from '../../lib/remoteTranscript'
import {
  STORED_TRANSCRIPT_SOURCE_STATE,
  type StoredTranscriptSourceState,
} from './readingContentCta'

interface StoredTranscriptSourceLookupState {
  key: string
  state: StoredTranscriptSourceState
}

export function useStoredTranscriptSourceState(input: {
  targetAudioUrl: string
  localTrackId: string | null
  lookupKey: string
}): StoredTranscriptSourceState {
  const [lookupState, setLookupState] = useState<StoredTranscriptSourceLookupState>({
    key: '',
    state: STORED_TRANSCRIPT_SOURCE_STATE.UNKNOWN,
  })

  useEffect(() => {
    let isCancelled = false
    setLookupState({
      key: input.lookupKey,
      state: input.targetAudioUrl
        ? STORED_TRANSCRIPT_SOURCE_STATE.UNKNOWN
        : STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
    })

    if (!input.targetAudioUrl) {
      return () => {
        isCancelled = true
      }
    }

    void (async () => {
      try {
        const storedTranscriptSourceExists = await hasStoredTranscriptSource(
          input.targetAudioUrl,
          input.localTrackId
        )
        if (!isCancelled) {
          setLookupState({
            key: input.lookupKey,
            state: storedTranscriptSourceExists
              ? STORED_TRANSCRIPT_SOURCE_STATE.PRESENT
              : STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
          })
        }
      } catch {
        if (!isCancelled) {
          setLookupState({
            key: input.lookupKey,
            state: STORED_TRANSCRIPT_SOURCE_STATE.ABSENT,
          })
        }
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [input.localTrackId, input.lookupKey, input.targetAudioUrl])

  return lookupState.key === input.lookupKey
    ? lookupState.state
    : STORED_TRANSCRIPT_SOURCE_STATE.UNKNOWN
}
