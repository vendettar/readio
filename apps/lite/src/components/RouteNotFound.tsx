import { FileQuestion } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { translate } from '../lib/i18nUtils'

export function RouteNotFound() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 rounded-full bg-muted p-2 text-muted-foreground">
            <FileQuestion className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{translate('routeNotFoundTitle')}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {translate('routeNotFoundDescription')}
            </p>
            <div className="mt-5">
              <Button onClick={() => location.assign('/')}>
                {translate('routeNotFoundGoHome')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
