import { useSleepTimerStore } from '../store/sleepTimerStore'

export function useSleepTimer() {
  const remainingSeconds = useSleepTimerStore((s) => s.remainingSeconds)
  const isEndOfEpisode = useSleepTimerStore((s) => s.isEndOfEpisode)
  const startTimer = useSleepTimerStore((s) => s.startTimer)
  const startEndOfEpisode = useSleepTimerStore((s) => s.startEndOfEpisode)
  const cancelTimer = useSleepTimerStore((s) => s.cancelTimer)

  return {
    isActive: remainingSeconds !== null || isEndOfEpisode,
    remainingSeconds,
    isEndOfEpisode,
    startTimer,
    startEndOfEpisode,
    cancelTimer,
  }
}
