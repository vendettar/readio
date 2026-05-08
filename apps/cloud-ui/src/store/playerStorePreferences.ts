import { getJson, setJson } from '../lib/storage'

const STORAGE_KEY_VOLUME = 'readio_volume'
const STORAGE_KEY_RATE = 'readio_playback_rate'

function clampVolume(volume: number): number {
  return Math.max(0, Math.min(1, volume))
}

function clampPlaybackRate(rate: number): number {
  return Math.max(0.1, Math.min(4, rate))
}

export function readInitialPlayerVolume(): number {
  const stored = getJson<number>(STORAGE_KEY_VOLUME)
  if (typeof stored !== 'number' || Number.isNaN(stored)) return 0.8
  return clampVolume(stored)
}

export function readInitialPlayerPlaybackRate(): number {
  const stored = getJson<number>(STORAGE_KEY_RATE)
  if (typeof stored !== 'number' || Number.isNaN(stored)) return 1
  return clampPlaybackRate(stored)
}

export function persistPlayerVolume(volume: number): number {
  const nextVolume = clampVolume(volume)
  setJson(STORAGE_KEY_VOLUME, nextVolume)
  return nextVolume
}

export function persistPlayerPlaybackRate(rate: number): number {
  const nextRate = clampPlaybackRate(rate)
  setJson(STORAGE_KEY_RATE, nextRate)
  return nextRate
}
