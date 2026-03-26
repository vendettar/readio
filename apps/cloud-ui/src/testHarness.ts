import type { QueryClient } from '@tanstack/react-query'
import { DB, db as rawDb } from './lib/dexieDb'
import { log } from './lib/logger'
import type { router } from './router'

declare global {
  interface Window {
    __READIO_TEST__?: {
      router: typeof router
      queryClient: QueryClient
      db: typeof DB
      rawDb: typeof rawDb
      clearAppData: () => Promise<void>
    }
  }
}

/**
 * Registers global test helpers for E2E testing.
 * Only intended to be called in test or development environments.
 */
export function registerTestHarness(routerInstance: typeof router, queryClient: QueryClient) {
  // Use VITE_E2E or DEV mode to enable harness
  const isE2E = import.meta.env.VITE_E2E === 'true' || import.meta.env.MODE === 'test'

  if (isE2E || import.meta.env.DEV) {
    window.__READIO_TEST__ = {
      router: routerInstance,
      queryClient,
      db: DB,
      rawDb,
      clearAppData: async () => {
        try {
          localStorage.clear()
          sessionStorage.clear()
          queryClient.clear()
        } catch {
          /* ignore */
        }
        try {
          await DB.clearAllData()
        } catch {
          // best-effort
        }
      },
    }

    // Log registration for visibility in test logs
    log('[TestHarness] E2E test helpers registered on window.__READIO_TEST__')
  }
}
