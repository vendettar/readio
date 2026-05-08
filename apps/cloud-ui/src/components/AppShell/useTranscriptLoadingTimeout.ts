import { useEffect, useState } from 'react'
import { TRANSCRIPT_LOADING_TIMEOUT_MS } from './readingContentCta'

interface TranscriptLoadingTimeoutState {
  key: string
  timedOut: boolean
}

export function useTranscriptLoadingTimeout(watchKey: string): boolean {
  const [timeoutState, setTimeoutState] = useState<TranscriptLoadingTimeoutState>({
    key: '',
    timedOut: false,
  })

  useEffect(() => {
    if (!watchKey) {
      setTimeoutState((state) =>
        state.key || state.timedOut ? { key: '', timedOut: false } : state
      )
      return
    }

    setTimeoutState((state) =>
      state.key === watchKey ? state : { key: watchKey, timedOut: false }
    )

    const timeoutId = window.setTimeout(() => {
      setTimeoutState((state) =>
        state.key === watchKey ? { key: watchKey, timedOut: true } : state
      )
    }, TRANSCRIPT_LOADING_TIMEOUT_MS)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [watchKey])

  return timeoutState.key === watchKey && timeoutState.timedOut
}
