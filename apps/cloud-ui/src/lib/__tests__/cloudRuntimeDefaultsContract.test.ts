import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('cloud runtime defaults contract', () => {
  beforeEach(() => {
    vi.resetModules()
    window.__READIO_ENV__ = undefined
  })

  it('documents and falls back migrated discovery runtime defaults as backend-owned same-origin endpoints', async () => {
    const envJs = readFileSync(resolve(process.cwd(), 'public/env.js'), 'utf8')

    expect(envJs).toContain('backend-owned and same-origin')
    expect(envJs).toContain('READIO_DISCOVERY_SEARCH_URL: `${window.location.origin}/api/v1/discovery/search`')
    expect(envJs).toContain('READIO_DISCOVERY_LOOKUP_URL: `${window.location.origin}/api/v1/discovery/lookup`')
    expect(envJs).toContain('READIO_RSS_FEED_BASE_URL: `${window.location.origin}/api/v1/discovery`')

    expect(envJs).not.toContain('https://itunes.apple.com/search')
    expect(envJs).not.toContain('https://itunes.apple.com/lookup')
    expect(envJs).not.toContain('https://rss.applemarketingtools.com/api/v2')
    expect(envJs).not.toContain('https://rss.marketingtools.apple.com/api/v2')

    const { DEFAULTS } = await import('../runtimeConfig.defaults')
    const { getAppConfig } = await import('../runtimeConfig')
    const config = getAppConfig()

    expect(DEFAULTS.DISCOVERY_SEARCH_URL).toMatch(/\/api\/v1\/discovery\/search$/)
    expect(DEFAULTS.DISCOVERY_LOOKUP_URL).toMatch(/\/api\/v1\/discovery\/lookup$/)
    expect(DEFAULTS.RSS_FEED_BASE_URL).toMatch(/\/api\/v1\/discovery$/)
    expect(DEFAULTS.DISCOVERY_SEARCH_URL).not.toContain('itunes.apple.com')
    expect(DEFAULTS.DISCOVERY_LOOKUP_URL).not.toContain('itunes.apple.com')
    expect(DEFAULTS.RSS_FEED_BASE_URL).not.toContain('rss.applemarketingtools.com')
    expect(DEFAULTS.RSS_FEED_BASE_URL).not.toContain('rss.marketingtools.apple.com')

    expect(config.DISCOVERY_SEARCH_URL).toBe(DEFAULTS.DISCOVERY_SEARCH_URL)
    expect(config.DISCOVERY_LOOKUP_URL).toBe(DEFAULTS.DISCOVERY_LOOKUP_URL)
    expect(config.RSS_FEED_BASE_URL).toBe(DEFAULTS.RSS_FEED_BASE_URL)
  })
})
