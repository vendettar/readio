import { useEffect } from 'react'
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals'
import { log } from '../lib/logger'

/**
 * Hook to report Core Web Vitals to the local diagnostic logger.
 */
export function useReportWebVitals() {
  useEffect(() => {
    // Only report in production or if explicitly enabled
    if (import.meta.env.DEV) return

    const report = ({
      name,
      value,
      delta,
      id,
    }: {
      name: string
      value: number
      delta: number
      id: string
    }) => {
      log('log', `[Web Vitals] ${name}`, {
        id,
        value: Math.round(name === 'CLS' ? value * 1000 : value),
        delta: Math.round(name === 'CLS' ? delta * 1000 : delta),
      })
    }

    onCLS(report)
    onINP(report)
    onLCP(report)
    onFCP(report)
    onTTFB(report)
  }, [])
}
