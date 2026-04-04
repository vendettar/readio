import { LoaderCircle } from 'lucide-react'
import { translate } from '../lib/i18nUtils'

export function RoutePending() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center px-6 py-12">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-sm">
        <LoaderCircle className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">{translate('routePendingLoading')}</span>
      </div>
    </div>
  )
}
