// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { AnimatePresence } from 'framer-motion'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import { AppShell, BootLoader } from '../components/AppShell'
import { GlobalAudioController } from '../components/AppShell/GlobalAudioController'
import { useAppInitialization } from '../hooks/useAppInitialization'
import { useFileHandler } from '../hooks/useFileHandler'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useNetworkStatus } from '../hooks/useNetworkStatus'
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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { handleFileChange } = useFileHandler()

  // Initialize global keyboard shortcuts
  useKeyboardShortcuts()

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

  // FilePicker callback for children to trigger file selection
  const triggerFilePicker = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  return (
    <FilePickerContext.Provider value={{ triggerFilePicker }}>
      <input
        ref={fileInputRef}
        type="file"
        id="fileInput"
        multiple
        accept="audio/*,.srt,.vtt"
        onChange={handleFileChange}
        className="hidden"
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
