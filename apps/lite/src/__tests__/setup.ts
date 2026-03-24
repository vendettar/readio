// src/__tests__/setup.ts
import 'fake-indexeddb/auto'
import { afterAll, afterEach, beforeAll, vi } from 'vitest'

type SetupServerApi = Awaited<ReturnType<typeof import('msw/node')['setupServer']>>
let serverImpl: SetupServerApi | null = null
export const server = {
  listen: (...args: Parameters<SetupServerApi['listen']>) => serverImpl?.listen(...args),
  close: (...args: Parameters<SetupServerApi['close']>) => serverImpl?.close(...args),
  resetHandlers: (...args: Parameters<SetupServerApi['resetHandlers']>) =>
    serverImpl?.resetHandlers(...args),
  use: (...args: Parameters<SetupServerApi['use']>) => serverImpl?.use(...args),
}

// Mock localStorage first, before loading MSW.
// In Node 22+, MSW reads global localStorage on import; if Node's internal
// localStorage backend is unconfigured, it emits noisy warnings.
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: localStorageMock,
})

// Start server before all tests
beforeAll(async () => {
  const [{ setupServer }, { handlers }] = await Promise.all([
    import('msw/node'),
    import('./handlers'),
  ])
  serverImpl = setupServer(...handlers)
  serverImpl.listen({ onUnhandledRequest: 'error' })
})

//  Close server after all tests
afterAll(() => {
  serverImpl?.close()
  serverImpl = null
})

// Reset handlers after each test `important for test isolation`
afterEach(() => {
  serverImpl?.resetHandlers()
})

// Mock matchMedia for theme tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
})

// Mock HTMLMediaElement (Audio/Video)
// JSDOM doesn't implement these, so we mock them globally to prevent errors
Object.defineProperty(HTMLMediaElement.prototype, 'play', {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
})
Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
  configurable: true,
  value: vi.fn(),
})
Object.defineProperty(HTMLMediaElement.prototype, 'load', {
  configurable: true,
  value: vi.fn(),
})

// Mock URL.createObjectURL/revokeObjectURL
Object.defineProperty(window.URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:mock-url'),
})
Object.defineProperty(window.URL, 'revokeObjectURL', {
  value: vi.fn(),
})

// Mock CSS Highlights API to prevent unsupported-feature warning noise in JSDOM
class MockHighlight {
  add = vi.fn()
  clear = vi.fn()
}

Object.defineProperty(globalThis, 'Highlight', {
  configurable: true,
  value: MockHighlight,
})

Object.defineProperty(globalThis, 'CSS', {
  configurable: true,
  value: {
    highlights: {
      set: vi.fn(),
      delete: vi.fn(),
    },
  },
})
