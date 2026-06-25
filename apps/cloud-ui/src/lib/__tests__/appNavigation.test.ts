import { describe, expect, it, vi } from 'vitest'
import {
  APP_NAVIGATION_EVENT,
  parseAppNavigationRequest,
  requestAppNavigation,
} from '../appNavigation'

describe('appNavigation', () => {
  it('accepts allowed navigation requests', () => {
    expect(parseAppNavigationRequest({ to: '/settings' })).toEqual({ to: '/settings' })
    expect(parseAppNavigationRequest({ to: '/settings', hash: 'asr' })).toEqual({
      to: '/settings',
      hash: 'asr',
    })
  })

  it('rejects malformed or disallowed navigation requests', () => {
    expect(parseAppNavigationRequest(null)).toBeNull()
    expect(parseAppNavigationRequest('/settings')).toBeNull()
    expect(parseAppNavigationRequest({ to: '/downloads' })).toBeNull()
    expect(parseAppNavigationRequest({ to: '/settings', hash: 'profile' })).toBeNull()
    expect(parseAppNavigationRequest({ to: '/settings', hash: 1 })).toBeNull()
  })

  it('dispatches the compatibility event name and detail shape', () => {
    const listener = vi.fn()
    window.addEventListener(APP_NAVIGATION_EVENT, listener)

    requestAppNavigation({ to: '/settings', hash: 'asr' })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0]).toMatchObject({
      type: APP_NAVIGATION_EVENT,
      detail: { to: '/settings', hash: 'asr' },
    })
    window.removeEventListener(APP_NAVIGATION_EVENT, listener)
  })
})
