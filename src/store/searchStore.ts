// src/store/searchStore.ts
import { create } from 'zustand'

interface SearchState {
  query: string
  isOverlayOpen: boolean
  setQuery: (query: string) => void
  openOverlay: () => void
  closeOverlay: () => void
  clearSearch: () => void
}

export const useSearchStore = create<SearchState>((set) => ({
  query: '',
  isOverlayOpen: false,

  setQuery: (query: string) => set({ query, isOverlayOpen: query.length > 0 }),

  openOverlay: () => set({ isOverlayOpen: true }),

  closeOverlay: () => set({ isOverlayOpen: false }),

  clearSearch: () => set({ query: '', isOverlayOpen: false }),
}))
