// src/components/Transcript/TranscriptErrorFallback.tsx
// Error fallback UI for TranscriptView with copy debug info button

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UI_FEEDBACK_DURATION } from '../../constants/app'
import { logError } from '../../lib/logger'
import { Button } from '../ui/button'

interface TranscriptErrorFallbackProps {
  error: Error
  reset: () => void
}

export function TranscriptErrorFallback({ error, reset }: TranscriptErrorFallbackProps) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopyDebug = useCallback(async () => {
    const debugInfo = [
      `Readio Transcript Error`,
      `Time: ${new Date().toISOString()}`,
      `Error: ${error.name}: ${error.message}`,
      `Stack: ${error.stack || 'N/A'}`,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n')

    try {
      await navigator.clipboard.writeText(debugInfo)
      setCopied(true)
      setTimeout(() => setCopied(false), UI_FEEDBACK_DURATION)
    } catch {
      // Clipboard may be blocked
      logError('[TranscriptErrorFallback] Failed to copy debug info', error)
    }
  }, [error])

  // Log technical details to console
  logError('[TranscriptView] Render error:', error)

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="text-lg font-semibold mb-2 text-foreground">{t('transcriptErrorTitle')}</div>
      <div className="text-sm text-muted-foreground mb-4">{t('transcriptErrorHint')}</div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={reset}>
          {t('errorBoundaryTryRecover')}
        </Button>
        <Button variant="outline" onClick={handleCopyDebug}>
          {copied ? t('ariaCopied') : t('transcriptCopyDebug')}
        </Button>
      </div>
    </div>
  )
}
