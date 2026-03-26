import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearNamespace, clearStorage, removeItem, setJson } from '../storage'

function createThrowingStorage(): Storage {
  return {
    get length() {
      return 1
    },
    clear: () => {
      throw new Error('clear failed')
    },
    getItem: () => null,
    key: () => {
      throw new Error('key failed')
    },
    removeItem: () => {
      throw new Error('remove failed')
    },
    setItem: () => {
      throw new Error('set failed')
    },
  }
}

describe('storage helper failure visibility', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs dev warning when setJson fails and returns false', () => {
    const storage = createThrowingStorage()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const ok = setJson('test-key', { ok: true }, storage)

    expect(ok).toBe(false)
    expect(warnSpy).toHaveBeenCalledWith(
      '[storage] operation_failed',
      expect.objectContaining({
        operation: 'setJson',
        key: 'test-key',
      })
    )
  })

  it('logs dev warning when removeItem fails', () => {
    const storage = createThrowingStorage()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    removeItem('gone-key', storage)

    expect(warnSpy).toHaveBeenCalledWith(
      '[storage] operation_failed',
      expect.objectContaining({
        operation: 'removeItem',
        key: 'gone-key',
      })
    )
  })

  it('logs dev warning for clearStorage and clearNamespace failures', () => {
    const storage = createThrowingStorage()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    clearStorage(storage)
    clearNamespace('ns:', storage)

    expect(warnSpy).toHaveBeenCalledWith(
      '[storage] operation_failed',
      expect.objectContaining({
        operation: 'clearStorage',
      })
    )
    expect(warnSpy).toHaveBeenCalledWith(
      '[storage] operation_failed',
      expect.objectContaining({
        operation: 'clearNamespace',
        prefix: 'ns:',
      })
    )
  })
})
