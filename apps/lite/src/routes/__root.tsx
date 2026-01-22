// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { Toaster } from 'sonner'
import { AppShell } from '../components/AppShell'
import { GlobalAudioController } from '../components/AppShell/GlobalAudioController'
import { useAppInitialization } from '../hooks/useAppInitialization'
import { useFileHandler } from '../hooks/useFileHandler'

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

  // Initialize app-level data (subscriptions, favorites)
  useAppInitialization()

  // Apply ready class to body when mounted
  useEffect(() => {
    document.body.classList.add('ready')
  }, [])

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
