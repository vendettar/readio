import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { reportError } from '../lib/errorReporter'
import { translate } from '../lib/i18nUtils'
import { logError } from '../lib/logger'

interface RouteErrorFallbackProps {
  error: Error
  reset: () => void
}

export function RouteErrorFallback({ error, reset }: RouteErrorFallbackProps) {
  useEffect(() => {
    logError('[RouteErrorFallback]', error, { componentStack: '[route-error-fallback]' })
    reportError(error, { componentStack: '[route-error-fallback]' })
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-full bg-destructive/10 p-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{translate('routeErrorTitle')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {translate('routeErrorDescription')}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" onClick={reset}>
                {translate('routeErrorTryAgain')}
              </Button>
              <Button variant="outline" onClick={() => location.reload()}>
                {translate('routeErrorReload')}
              </Button>
              <Button onClick={() => location.assign('/')}>{translate('routeErrorGoHome')}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
