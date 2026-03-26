import { create } from 'zustand'

export type SurfaceMode = 'mini' | 'docked' | 'full'

interface PlayerSurfaceState {
  mode: SurfaceMode
  hasPlayableContext: boolean
  canDockedRestore: boolean

  // Actions
  toMini: () => void
  toDocked: () => void
  toFull: () => void

  // Capability updators
  setPlayableContext: (hasContext: boolean) => void
  setDockedRestoreAvailable: (available: boolean) => void

  // Reset
  reset: () => void
}

const initialState = {
  mode: 'mini' as SurfaceMode,
  hasPlayableContext: false,
  canDockedRestore: false,
}

export const usePlayerSurfaceStore = create<PlayerSurfaceState>((set, get) => ({
  ...initialState,

  toMini: () => {
    // Always allowed
    set({ mode: 'mini' })
  },

  toDocked: () => {
    const { canDockedRestore, hasPlayableContext } = get()
    // Guard: Only allow if context exists or restore is available
    if (canDockedRestore || hasPlayableContext) {
      set({ mode: 'docked' })
    }
  },

  toFull: () => {
    // Always allowed (MiniPlayer ensures audio is loaded)
    set({ mode: 'full' })
  },

  setPlayableContext: (hasContext) => {
    if (hasContext) {
      set({ hasPlayableContext: true, canDockedRestore: true })
    } else {
      // If losing context, check if we need to force mini
      const { mode } = get()
      if (mode !== 'mini') {
        set({ hasPlayableContext: false, canDockedRestore: false, mode: 'mini' })
      } else {
        set({ hasPlayableContext: false, canDockedRestore: false })
      }
    }
  },

  setDockedRestoreAvailable: (available) => {
    set((state) => {
      // If becoming unavailable while docked, collapse to mini
      if (!available && state.mode === 'docked') {
        return { canDockedRestore: false, mode: 'mini' }
      }
      return { canDockedRestore: available }
    })
  },

  reset: () => set(initialState),
}))
