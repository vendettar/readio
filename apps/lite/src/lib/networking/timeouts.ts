export function createTimeoutController(
  timeoutMs: number,
  externalSignal?: AbortSignal
): {
  controller: AbortController
  wasTimedOut: () => boolean
  cleanup: () => void
} {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const onAbort = () => controller.abort()
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort()
    } else {
      externalSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  return {
    controller,
    wasTimedOut: () => timedOut,
    cleanup: () => {
      clearTimeout(timeoutId)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onAbort)
      }
    },
  }
}

export async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      const abortErr = new Error('AbortError')
      abortErr.name = 'AbortError'
      reject(signal.reason || abortErr)
      return
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    function onAbort() {
      clearTimeout(timer)
      const abortErr = new Error('AbortError')
      abortErr.name = 'AbortError'
      reject(signal?.reason || abortErr)
    }

    signal?.addEventListener('abort', onAbort, { once: true })
  })
}
