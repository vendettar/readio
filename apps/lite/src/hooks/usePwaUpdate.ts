import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { translate } from '../lib/i18nUtils'
import { log } from '../lib/logger'
import { toast } from '../lib/toast'

/**
 * Hook to manage PWA update lifecycle.
 * Notifies the user when a new version is available and allows them to refresh.
 */
export function usePwaUpdate() {
  const {
    needRefresh: [needRefresh, _setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(_r) {
      log('[PWA] Service Worker registered')
    },
    onRegisterError(error) {
      log('[PWA] Service Worker registration error', error)
    },
  })

  useEffect(() => {
    if (needRefresh) {
      log('[PWA] New content available, showing update toast')

      toast.infoKey(
        'pwa.updateAvailable',
        {},
        {
          id: 'pwa-update',
          duration: Number.POSITIVE_INFINITY,
          action: {
            label: translate('pwa.refreshNow'),
            onClick: () => {
              updateServiceWorker(true)
            },
          },
        }
      )
    }
  }, [needRefresh, updateServiceWorker])

  return { needRefresh, updateServiceWorker }
}
