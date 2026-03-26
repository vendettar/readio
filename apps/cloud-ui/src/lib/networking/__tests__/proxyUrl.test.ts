import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../runtimeConfig', () => ({
  getAppConfig: vi.fn(),
}))

import { getAppConfig } from '../../runtimeConfig'
import { buildProxyUrl, getCorsProxyConfig } from '../proxyUrl'

describe('networking/proxyUrl', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('builds proxy URL for template, prefix, and base forms', () => {
    const target = 'https://example.com/feed.xml'
    const encoded = encodeURIComponent(target)

    expect(buildProxyUrl('https://proxy.dev/?url={url}', target)).toBe(
      `https://proxy.dev/?url=${encoded}`
    )
    expect(buildProxyUrl('https://proxy.dev/?url=', target)).toBe(
      `https://proxy.dev/?url=${encoded}`
    )
    expect(buildProxyUrl('https://proxy.dev', target)).toBe(`https://proxy.dev?url=${encoded}`)
  })

  it('returns custom proxy config with normalized URL', () => {
    vi.mocked(getAppConfig).mockReturnValue({
      CORS_PROXY_URL: 'https://custom.proxy///',
    } as never)

    expect(getCorsProxyConfig()).toEqual({
      proxyUrl: 'https://custom.proxy',
      authHeader: '',
      authValue: '',
    })
  })

  it('returns empty proxyUrl when custom is empty', () => {
    vi.mocked(getAppConfig).mockReturnValue({
      CORS_PROXY_URL: '',
    } as never)

    expect(getCorsProxyConfig()).toEqual({
      proxyUrl: '',
      authHeader: '',
      authValue: '',
    })
  })
})
