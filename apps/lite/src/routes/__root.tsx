// src/routes/__root.tsx
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { createContext, useCallback, useContext, useEffect, useRef } from 'react'
import { AppShell } from '../components/AppShell'
import { ToastContainer } from '../components/Toast'
import { useAppInitialization } from '../hooks/useAppInitialization'
import { useFileHandler } from '../hooks/useFileHandler'
import { useSession } from '../hooks/useSession'
import { warn } from '../lib/logger'
import { usePlayerStore } from '../store/playerStore'

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
  const audioRef = useRef<HTMLAudioElement>(null)
  const { handleFileChange } = useFileHandler()
  const { restoreProgress } = useSession()

  // Initialize app-level data (subscriptions, favorites)
  useAppInitialization()

  const {
    audioUrl,
    updateProgress,
    setDuration,
    isPlaying,
    volume,
    playbackRate,
    pendingSeek,
    clearPendingSeek,
  } = usePlayerStore()

  // Apply ready class to body when mounted
  useEffect(() => {
    document.body.classList.add('ready')
  }, [])

  // audio event handlers - persistent across routes
  // Must include audioUrl in deps so listeners attach when audio element is created
  // biome-ignore lint/correctness/useExhaustiveDependencies: Re-attach listeners when audio source changes
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    // Use updateProgress for throttled DB persistence
    const onTimeUpdate = () => updateProgress(audio.currentTime)
    const onDurationChange = () => setDuration(audio.duration)
    const onPlay = () => usePlayerStore.getState().play()
    const onPause = () => usePlayerStore.getState().pause()

    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('durationchange', onDurationChange)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('durationchange', onDurationChange)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [updateProgress, setDuration, audioUrl])

  // Restore session progress when a new audio source is loaded
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    const onLoadedMetadata = () => {
      restoreProgress(audio)
    }

    audio.addEventListener('loadedmetadata', onLoadedMetadata, { once: true })
    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [audioUrl, restoreProgress])

  // Sync play state
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return

    if (isPlaying) {
      audio.play().catch((err) => {
        warn('[Player] play() failed', { error: err, audioUrl })
        usePlayerStore.getState().pause()
      })
    } else {
      audio.pause()
    }
  }, [isPlaying, audioUrl])

  // Monitor pendingSeek and sync to audio element
  useEffect(() => {
    if (pendingSeek !== null && audioRef.current) {
      audioRef.current.currentTime = pendingSeek
      clearPendingSeek()
    }
  }, [pendingSeek, clearPendingSeek])

  // Sync volume to audio element
  // biome-ignore lint/correctness/useExhaustiveDependencies: Sync volume when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
    }
  }, [volume, audioUrl])

  // Sync playback rate to audio element
  // biome-ignore lint/correctness/useExhaustiveDependencies: Sync playback rate when audio source changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate
    }
  }, [playbackRate, audioUrl])

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
      {/* audio element is persistent across all routes */}
      {audioUrl && <audio ref={audioRef} src={audioUrl} />}

      <AppShell>
        <Outlet />
      </AppShell>

      <ToastContainer />
    </FilePickerContext.Provider>
  )
}

export const Route = createRootRoute({
  component: RootLayout,
})
