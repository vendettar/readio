// src/store/themeStore.ts
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getJson } from '../libs/storage'

export type Theme = 'light' | 'dark'
export const ACCENT_OPTIONS = [
  { name: 'zinc', swatchClassName: 'bg-zinc-500' },
  { name: 'red', swatchClassName: 'bg-red-500' },
  { name: 'orange', swatchClassName: 'bg-orange-500' },
  { name: 'amber', swatchClassName: 'bg-amber-500' },
  { name: 'green', swatchClassName: 'bg-green-500' },
  { name: 'teal', swatchClassName: 'bg-teal-500' },
  { name: 'blue', swatchClassName: 'bg-blue-500' },
  { name: 'indigo', swatchClassName: 'bg-indigo-500' },
  { name: 'purple', swatchClassName: 'bg-purple-500' },
  { name: 'pink', swatchClassName: 'bg-pink-500' },
] as const

export const ACCENTS = ACCENT_OPTIONS.map((a) => a.name) as ReadonlyArray<
  (typeof ACCENT_OPTIONS)[number]['name']
>
export type Accent = (typeof ACCENT_OPTIONS)[number]['name']
export const DEFAULT_ACCENT: Accent = 'blue'
export type ReadingBg = 'default' | 'sepia' | 'dark' | 'dim' | 'paper' | 'slate'

interface ThemeState {
  theme: Theme
  accent: Accent
  readingBg: ReadingBg
  toggleTheme: () => void
  setTheme: (theme: Theme) => void
  setAccent: (accent: Accent) => void
  setReadingBg: (bg: ReadingBg) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      accent: DEFAULT_ACCENT,
      readingBg: 'default',

      toggleTheme: () => {
        const newTheme = get().theme === 'light' ? 'dark' : 'light'
        set({ theme: newTheme })
        applyTheme(newTheme)
      },

      setTheme: (theme: Theme) => {
        set({ theme })
        applyTheme(theme)
      },

      setAccent: (accent: Accent) => {
        const normalized = normalizeAccent(accent)
        set({ accent: normalized })
        applyAccent(normalized)
      },

      setReadingBg: (bg: ReadingBg) => {
        set({ readingBg: bg })
        applyReadingBg(bg)
      },
    }),
    {
      name: 'readio-theme',
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyTheme(state.theme)
          const normalizedAccent = normalizeAccent(state.accent)
          if (normalizedAccent !== state.accent) {
            state.setAccent(normalizedAccent)
          } else {
            applyAccent(state.accent)
          }
          applyReadingBg(state.readingBg)
        }
      },
    }
  )
)

function normalizeAccent(value: unknown): Accent {
  return ACCENTS.includes(value as Accent) ? (value as Accent) : DEFAULT_ACCENT
}

function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (theme === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

function applyAccent(accent: Accent) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.accent = accent
}

function applyReadingBg(bg: ReadingBg) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.readingBg = bg
}

// Initialize theme on app load
if (typeof window !== 'undefined') {
  const stored = getJson<{ state: ThemeState }>('readio-theme')
  if (stored?.state) {
    applyTheme(stored.state.theme)
    applyAccent(normalizeAccent(stored.state.accent))
    applyReadingBg(stored.state.readingBg)
  }
}
