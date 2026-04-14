import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('cloud runtime defaults contract', () => {
  beforeEach(() => {
    vi.resetModules()
    window.__READIO_ENV__ = undefined
  })

  it('documents and falls back migrated discovery runtime defaults as backend-owned same-origin endpoints', async () => {
    expect(existsSync(resolve(process.cwd(), 'public/env.js'))).toBe(false)
    expect(existsSync(resolve(process.cwd(), 'public/env.local.js.example'))).toBe(false)

    const { DEFAULTS } = await import('../runtimeConfig.defaults')
    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(DEFAULTS.RSS_FEED_BASE_URL).toMatch(/\/api\/v1\/discovery$/)
    expect(DEFAULTS.RSS_FEED_BASE_URL).toContain('http://localhost:3000')
    expect(DEFAULTS.RSS_FEED_BASE_URL).not.toContain('rss.applemarketingtools.com')
    expect(DEFAULTS.RSS_FEED_BASE_URL).not.toContain('rss.marketingtools.apple.com')

    expect(config.RSS_FEED_BASE_URL).toBe(DEFAULTS.RSS_FEED_BASE_URL)
    expect(window.__READIO_ENV__).toBeUndefined()
  })
})
