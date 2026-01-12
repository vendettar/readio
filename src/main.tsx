import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nProvider } from './hooks/useI18n'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { DB } from './libs/dexieDb'
import { router } from './router'
import './index.css'
// Note: legacy interactions.css and theme-tokens.css are being consolidated/removed

// TanStack Query client configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000,   // 30 minutes (garbage collection)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

declare global {
  interface Window {
    __READIO_TEST__?: {
      router: typeof router;
      queryClient: typeof queryClient;
      clearAppData: () => Promise<void>;
    }
  }
}

if (import.meta.env.DEV) {
  window.__READIO_TEST__ = {
    router,
    queryClient,
    clearAppData: async () => {
      try {
        localStorage.clear();
        sessionStorage.clear();
        queryClient.clear();
      } catch { /* ignore */ }
      try {
        await DB.clearAllData();
      } catch {
        // best-effort
      }
    },
  };
}

import { TooltipProvider } from './components/ui/tooltip'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <RootErrorBoundary>
          <TooltipProvider>
            <RouterProvider router={router} />
          </TooltipProvider>
        </RootErrorBoundary>
      </I18nProvider>
    </QueryClientProvider>
  </StrictMode>,
)
