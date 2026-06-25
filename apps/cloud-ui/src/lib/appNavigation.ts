export const APP_NAVIGATION_EVENT = 'readio:navigate'

export type AppNavigationRequest = {
  to: '/settings'
  hash?: 'asr'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function parseAppNavigationRequest(value: unknown): AppNavigationRequest | null {
  if (!isRecord(value)) return null
  if (value.to !== '/settings') return null
  if (value.hash !== undefined && value.hash !== 'asr') return null

  return value.hash === 'asr' ? { to: '/settings', hash: 'asr' } : { to: '/settings' }
}

export function requestAppNavigation(request: AppNavigationRequest): void {
  window.dispatchEvent(new CustomEvent(APP_NAVIGATION_EVENT, { detail: request }))
}
