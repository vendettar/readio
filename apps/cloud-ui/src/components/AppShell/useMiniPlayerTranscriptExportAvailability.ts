import { useEffect, useState } from 'react'
import { resolveCurrentPlaybackExportContext } from '../../lib/player/playbackExport'

const EXPORT_TRANSCRIPT_DISABLED_BY_DEFAULT = true

export function useMiniPlayerTranscriptExportAvailability(
  hasActiveTrack: boolean,
  playbackContextKey: string
): boolean {
  const [exportTranscriptDisabled, setExportTranscriptDisabled] = useState(
    EXPORT_TRANSCRIPT_DISABLED_BY_DEFAULT
  )

  useEffect(() => {
    if (!hasActiveTrack) {
      setExportTranscriptDisabled(EXPORT_TRANSCRIPT_DISABLED_BY_DEFAULT)
      return
    }

    let cancelled = false

    void resolveCurrentPlaybackExportContext()
      .then((context) => {
        if (cancelled) return
        setExportTranscriptDisabled(!context?.canExportTranscript)
      })
      .catch(() => {
        if (!cancelled) {
          setExportTranscriptDisabled(EXPORT_TRANSCRIPT_DISABLED_BY_DEFAULT)
        }
      })

    return () => {
      cancelled = true
    }
  }, [hasActiveTrack, playbackContextKey])

  return !hasActiveTrack || exportTranscriptDisabled
}
