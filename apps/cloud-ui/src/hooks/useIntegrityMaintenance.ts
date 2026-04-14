import { useCallback, useRef, useState } from 'react'
import { type IntegrityCheckReport, runIntegrityCheck } from '../lib/retention'
import { toast } from '../lib/toast'

interface UseIntegrityMaintenanceResult {
  isRunning: boolean
  lastReport: IntegrityCheckReport | null
  runNow: () => Promise<void>
}

export function useIntegrityMaintenance(): UseIntegrityMaintenanceResult {
  const [isRunning, setIsRunning] = useState(false)
  const [lastReport, setLastReport] = useState<IntegrityCheckReport | null>(null)
  const inFlightRef = useRef<Promise<void> | null>(null)

  const runNow = useCallback(async () => {
    if (inFlightRef.current) {
      return inFlightRef.current
    }

    const task = (async () => {
      setIsRunning(true)
      try {
        const report = await runIntegrityCheck()
        setLastReport(report)

        if (report.totalRepairs > 0) {
          toast.successKey('toastMaintenanceRepaired', { count: report.totalRepairs })
          return
        }

        toast.infoKey('toastMaintenanceNoIssues')
      } catch (_err) {
        toast.errorKey('toastMaintenanceFailed')
      } finally {
        setIsRunning(false)
        inFlightRef.current = null
      }
    })()

    inFlightRef.current = task
    return task
  }, [])

  return { isRunning, lastReport, runNow }
}
