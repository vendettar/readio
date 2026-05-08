import { useEffect, useRef, useState } from 'react'
import { getAsrReadinessUpdatedEventName, isAsrReadyForGeneration } from '../../lib/asr/readiness'

export function useAsrGenerationReadiness(
  shouldEvaluateAsrReadiness: boolean
): boolean | null {
  const [asrGenerationReady, setAsrGenerationReady] = useState<boolean | null>(null)
  const [asrReadinessVersion, setAsrReadinessVersion] = useState(0)
  const asrReadinessVersionRef = useRef(0)

  useEffect(() => {
    const handleAsrReadinessUpdated = () => {
      asrReadinessVersionRef.current += 1
      setAsrReadinessVersion(asrReadinessVersionRef.current)
    }
    const asrReadinessEventName = getAsrReadinessUpdatedEventName()
    window.addEventListener(asrReadinessEventName, handleAsrReadinessUpdated)
    window.addEventListener('readio-settings-updated', handleAsrReadinessUpdated)
    return () => {
      window.removeEventListener(asrReadinessEventName, handleAsrReadinessUpdated)
      window.removeEventListener('readio-settings-updated', handleAsrReadinessUpdated)
    }
  }, [])

  useEffect(() => {
    let isCancelled = false
    const runVersion = asrReadinessVersion

    if (!shouldEvaluateAsrReadiness) {
      setAsrGenerationReady(null)
      return () => {
        isCancelled = true
      }
    }

    setAsrGenerationReady(null)

    void (async () => {
      const ready = await isAsrReadyForGeneration()
      if (!isCancelled && runVersion === asrReadinessVersionRef.current) {
        setAsrGenerationReady(ready)
      }
    })()

    return () => {
      isCancelled = true
    }
  }, [shouldEvaluateAsrReadiness, asrReadinessVersion])

  return asrGenerationReady
}
