import { describe, expect, it } from 'vitest'
import {
  isValidTabSyncMessage,
  shouldIgnoreTabSyncMessage,
} from '../tabSyncRuntime'

describe('tabSyncRuntime', () => {
  it('validates the tab sync message contract', () => {
    expect(
      isValidTabSyncMessage({
        type: 'PLAYING',
        senderId: 'tab-1',
        timestamp: Date.now(),
      })
    ).toBe(true)

    expect(
      isValidTabSyncMessage({
        type: 'PAUSED',
        senderId: 'tab-1',
        timestamp: Date.now(),
      })
    ).toBe(false)

    expect(isValidTabSyncMessage(null)).toBe(false)
  })

  it('ignores self-sent or stale messages only', () => {
    const now = Date.now()

    expect(
      shouldIgnoreTabSyncMessage(
        {
          type: 'PLAYING',
          senderId: 'tab-1',
          timestamp: now,
        },
        'tab-1',
        now
      )
    ).toBe(true)

    expect(
      shouldIgnoreTabSyncMessage(
        {
          type: 'PLAYING',
          senderId: 'tab-2',
          timestamp: now - 3000,
        },
        'tab-1',
        now
      )
    ).toBe(true)

    expect(
      shouldIgnoreTabSyncMessage(
        {
          type: 'PLAYING',
          senderId: 'tab-2',
          timestamp: now,
        },
        'tab-1',
        now
      )
    ).toBe(false)
  })
})
