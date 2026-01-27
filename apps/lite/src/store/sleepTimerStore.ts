import { create } from 'zustand'
import { usePlayerStore } from './playerStore'

interface SleepTimerState {
  remainingSeconds: number | null
  isEndOfEpisode: boolean
  startTimer: (minutes: number) => void
  startEndOfEpisode: () => void
  cancelTimer: () => void
  reset: () => void
}

let tickerIntervalId: ReturnType<typeof setInterval> | null = null

const stopTicker = () => {
  if (tickerIntervalId) {
    clearInterval(tickerIntervalId)
    tickerIntervalId = null
  }
}

export const useSleepTimerStore = create<SleepTimerState>((set, get) => ({
  remainingSeconds: null,
  isEndOfEpisode: false,

  startTimer: (minutes: number) => {
    stopTicker()
    const seconds = minutes * 60
    set({ remainingSeconds: seconds, isEndOfEpisode: false })

    tickerIntervalId = setInterval(() => {
      const current = get().remainingSeconds
      if (current === null) {
        stopTicker()
        return
      }

      if (current <= 1) {
        stopTicker()
        set({ remainingSeconds: null, isEndOfEpisode: false })
        usePlayerStore.getState().pause()
      } else {
        set({ remainingSeconds: current - 1 })
      }
    }, 1000)
  },

  startEndOfEpisode: () => {
    stopTicker()
    set({ isEndOfEpisode: true, remainingSeconds: null })
  },

  cancelTimer: () => {
    stopTicker()
    set({ remainingSeconds: null, isEndOfEpisode: false })
  },

  reset: () => {
    stopTicker()
    set({ remainingSeconds: null, isEndOfEpisode: false })
  },
}))
