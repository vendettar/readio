// src/components/Transcript/TranscriptErrorFallback.tsx
// Error fallback UI for TranscriptView with copy debug info button

import { useCallback, useState } from 'react'
import { useI18n } from '../../hooks/useI18n'
import { Button } from '../ui/button'

interface TranscriptErrorFallbackProps {
  error: Error
  reset: () => void
}

export function TranscriptErrorFallback({ error, reset }: TranscriptErrorFallbackProps) {
  const { t } = useI18n()
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
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard may be blocked
      console.error('[TranscriptErrorFallback] Failed to copy debug info')
    }
  }, [error])

  // Log technical details to console
  console.error('[TranscriptView] Render error:', error)

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
