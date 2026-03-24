import { describe, expect, it } from 'vitest'
import { createTimeoutController, sleepWithAbort } from '../timeouts'

describe('networking/timeouts', () => {
  it('aborts when timeout elapses', async () => {
    const timeout = createTimeoutController(1)

    await new Promise((resolve) => setTimeout(resolve, 5))

    expect(timeout.controller.signal.aborted).toBe(true)
    expect(timeout.wasTimedOut()).toBe(true)
    timeout.cleanup()
  })

  it('aborts when parent signal aborts', () => {
    const parent = new AbortController()
    const timeout = createTimeoutController(1000, parent.signal)

    parent.abort()

    expect(timeout.controller.signal.aborted).toBe(true)
    expect(timeout.wasTimedOut()).toBe(false)
    timeout.cleanup()
  })

  it('sleepWithAbort resolves or rejects based on signal', async () => {
    await expect(sleepWithAbort(1)).resolves.toBeUndefined()

    const parent = new AbortController()
    const p = sleepWithAbort(1000, parent.signal)
    parent.abort()
    await expect(p).rejects.toBeTruthy()
  })
})
