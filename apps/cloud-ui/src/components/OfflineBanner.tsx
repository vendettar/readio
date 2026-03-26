import { WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

/**
 * Offline banner displayed when the user is offline (Instruction 124).
 * Shows a persistent inline banner rather than a toast to avoid dismissal.
 */
export function OfflineBanner() {
  const { isOnline } = useNetworkStatus()
  const { t } = useTranslation()

  if (isOnline) return null

  return (
    <div
      aria-live="polite"
      className="flex items-center gap-2.5 px-4 py-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium"
    >
      <WifiOff size={16} strokeWidth={2.5} className="flex-shrink-0" />
      <span>{t('offlineBannerText')}</span>
    </div>
  )
}
