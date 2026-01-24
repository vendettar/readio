import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { Buffer } from 'buffer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RootErrorBoundary } from './components/RootErrorBoundary'
import { TooltipProvider } from './components/ui/tooltip'
import './index.css'
import './lib/i18n'
import { router } from './router'

// Polyfill Buffer for browser compatibility (required by music-metadata-browser)
// Must happen before modules that depend on it are loaded if they are dynamic,
// but generally better at top.
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer
}

// Note: legacy interactions.css and theme-tokens.css are being consolidated/removed

// TanStack Query client configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 30 * 60 * 1000, // 30 minutes (garbage collection)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// Register E2E test harness (only in DEV or TEST)
if (import.meta.env.DEV || import.meta.env.VITE_E2E === 'true' || import.meta.env.MODE === 'test') {
  import('./testHarness').then(({ registerTestHarness }) => {
    registerTestHarness(router, queryClient)
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RootErrorBoundary>
        <TooltipProvider>
          <RouterProvider router={router} />
        </TooltipProvider>
      </RootErrorBoundary>
    </QueryClientProvider>
  </StrictMode>
)
