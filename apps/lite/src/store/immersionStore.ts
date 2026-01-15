// src/store/immersionStore.ts
import { create } from 'zustand'

interface ImmersionState {
  isImmersed: boolean
  enterImmersion: () => void
  exitImmersion: () => void
}

export const useImmersionStore = create<ImmersionState>((set) => ({
  isImmersed: false,
  enterImmersion: () => set({ isImmersed: true }),
  exitImmersion: () => set({ isImmersed: false }),
}))
