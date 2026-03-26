import { createRootRoute, Outlet, useRouter } from '@tanstack/react-router'
import { AnimatePresence } from 'framer-motion'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react'
import { Toaster } from 'sonner'
import { AppShell, BootLoader } from '../components/AppShell'
import { GlobalAudioController } from '../components/AppShell/GlobalAudioController'
import { HiddenFileInput } from '../components/ui/hidden-file-input'
import { useAppInitialization } from '../hooks/useAppInitialization'
import { useFileHandler } from '../hooks/useFileHandler'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
import { useReportWebVitals } from '../hooks/usePerformance'
import { usePwaUpdate } from '../hooks/usePwaUpdate'
import { logError } from '../lib/logger'
import { toast } from '../lib/toast'

// FilePickerContext to avoid document.getElementById
const FilePickerContext = createContext<{ triggerFilePicker: () => void } | null>(null)

export function useFilePicker() {
  const context = useContext(FilePickerContext)
  if (!context) {
    throw new Error('useFilePicker must be used within RootLayout')
  }
  return context
}

function RootLayout() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { handleFileChange } = useFileHandler()

  // Handle global navigation requests from non-component code
  useEffect(() => {
    const handleNavigate = (event: Event) => {
      const customEvent = event as CustomEvent<{ to: string; hash?: string }>
      if (customEvent.detail) {
        void router.navigate(customEvent.detail)
      }
    }
    window.addEventListener('readio:navigate', handleNavigate)
    return () => window.removeEventListener('readio:navigate', handleNavigate)
  }, [router])

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts()

  // Initialize PWA update lifecycle
  usePwaUpdate()

  // Initialize performance metrics report
  useReportWebVitals()

  // Initialize app-level data (subscriptions, favorites)
  const { isReady, isHydrated } = useAppInitialization()

  // Network offline toast
  const { isOnline } = useNetworkStatus()
  const prevOnlineRef = useRef<boolean>(true)

  useEffect(() => {
    // Show toast only when transition from online to offline
    if (prevOnlineRef.current && !isOnline) {
      toast.errorKey('offline.error', {}, { id: 'offline-error' })
    }
    prevOnlineRef.current = isOnline
  }, [isOnline])

  // Sync body classes with hydration/ready state
  useEffect(() => {
    if (isHydrated) {
      document.body.classList.add('hydrated')
    }
    if (isReady) {
      document.body.classList.add('ready')
    }
  }, [isHydrated, isReady])

  // Global listeners (Drag & Drop, Error Handling)
  useEffect(() => {
    const isInsideEnabledFileDropzone = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false
      const dropzone = target.closest<HTMLElement>('[data-file-dropzone="true"]')
      return dropzone?.dataset.fileDropzoneEnabled === 'true'
    }

    const hasFilePayload = (event: DragEvent): boolean => {
      const types = event.dataTransfer?.types
      if (!types) return false
      return Array.from(types).includes('Files')
    }

    const preventUnhandledFileDrop = (event: DragEvent) => {
      if (!hasFilePayload(event)) return
      if (isInsideEnabledFileDropzone(event.target)) return
      event.preventDefault()
    }

    const handleWindowError = (event: ErrorEvent) => {
      logError('[Global] Uncaught Error:', event.error || event.message)
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      logError('[Global] Unhandled Rejection:', event.reason)
    }

    window.addEventListener('dragover', preventUnhandledFileDrop)
    window.addEventListener('drop', preventUnhandledFileDrop)
    window.addEventListener('error', handleWindowError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('dragover', preventUnhandledFileDrop)
      window.removeEventListener('drop', preventUnhandledFileDrop)
      window.removeEventListener('error', handleWindowError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

  // FilePicker callback for children to trigger file selection
  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const filePickerContextValue = useMemo(() => ({ triggerFilePicker }), [triggerFilePicker])

  return (
    <FilePickerContext.Provider value={filePickerContextValue}>
      <HiddenFileInput
        ref={fileInputRef}
        id="fileInput"
        multiple
        accept="audio/*,.srt,.vtt"
        onChange={handleFileChange}
      />

      <AnimatePresence>{!isReady && <BootLoader key="boot-loader" />}</AnimatePresence>

      {/* GlobalAudioController is isolated to prevent root layout re-renders */}
      <GlobalAudioController />

      <AppShell>
        <Outlet />
      </AppShell>

      <Toaster richColors position="bottom-right" />
    </FilePickerContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
