import { useCallback, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '../hooks/useI18n'
import { reportError } from '../lib/errorReporter'
import { logError } from '../lib/logger'
import { ErrorBoundary } from './ErrorBoundary'

const IS_DEV = import.meta.env.DEV

export function RootErrorBoundary({ children }: { children: React.ReactNode }) {
  const { t } = useI18n()
  const [lastErrorText, setLastErrorText] = useState('')

  const handleReload = useCallback(() => {
    location.reload()
  }, [])

  const handleCopy = useCallback(async () => {
    if (!lastErrorText) return
    try {
      await navigator.clipboard.writeText(lastErrorText)
    } catch {
      // ignore (clipboard may be blocked)
    }
  }, [lastErrorText])

  const fallback = useMemo(() => {
    return ({ error, reset }: { error: Error; reset: () => void }) => {
      return (
        <div className="max-w-2xl mx-auto my-12 p-5 rounded-xl border border-border bg-card shadow-sm">
          <div className="font-bold text-lg mb-2">{t('errorBoundaryTitle')}</div>
          <div className="text-muted-foreground text-sm mb-3">{t('errorBoundaryHint')}</div>
          <div className="flex gap-2.5 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleReload}>
              {t('errorBoundaryReload')}
            </Button>
            <Button variant="outline" size="sm" onClick={reset}>
              {t('errorBoundaryTryRecover')}
            </Button>
          </div>

          {/* Keep technical diagnostics out of user-facing UI in production. */}
          {IS_DEV && (
            <div className="mt-3">
              <details>
                <summary className="cursor-pointer text-muted-foreground">
                  {t('errorBoundaryDiagnostics')}
                </summary>
                <div className="mt-2.5 font-mono text-xs whitespace-pre-wrap break-words p-3 rounded-lg bg-foreground/[0.06]">
                  {error.name}: {error.message}
                </div>
                <div className="mt-2.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCopy}
                    disabled={!lastErrorText}
                    title={t('errorBoundaryCopyHint')}
                  >
                    {t('errorBoundaryCopy')}
                  </Button>
                </div>
              </details>
            </div>
          )}
        </div>
      )
    }
  }, [handleCopy, handleReload, lastErrorText, t])

  return (
    <ErrorBoundary
      fallback={fallback}
      onError={(error, info) => {
        const text = [
          `Readio crashed at ${new Date().toISOString()}`,
          '',
          `${error.name}: ${error.message}`,
          '',
          info.componentStack || '',
        ].join('\n')
        setLastErrorText(text)
        logError('[ErrorBoundary]', error, info)
        // Call configured error reporter (no-op by default)
        reportError(error, info)
      }}
    >
      {children}
    </ErrorBoundary>
  )
}
