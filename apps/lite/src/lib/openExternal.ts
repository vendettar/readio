import { logError } from './logger'

/**
 * Open external URL in a new tab/window with security best practices
 * @param url URL to open
 * @param target Target window name (default: '_blank')
 */
export function openExternal(url: string, target: string = '_blank'): void {
  try {
    window.open(url, target, 'noopener,noreferrer')
  } catch (error) {
    logError('[openExternal] Failed to open URL:', url, error)
  }
}
