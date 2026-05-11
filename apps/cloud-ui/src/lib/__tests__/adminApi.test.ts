import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('adminApi', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('keeps admin requests same-origin even when backend URL config exists', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ entries: [], total: 0, buffer_capacity: 100 }), { status: 200 })
    )

    const { fetchAdminLogs } = await import('../adminApi')
    await fetchAdminLogs('token-1', { level: 'ERROR', route: '/api/v1/discovery', limit: 50 })

    expect(fetch).toHaveBeenCalledWith(
      `${window.location.origin}/admin/logs?level=ERROR&route=%2Fapi%2Fv1%2Fdiscovery&limit=50`,
      expect.objectContaining({
        headers: expect.any(Headers),
      })
    )

    const [, init] = vi.mocked(fetch).mock.calls[0] ?? []
    expect((init as RequestInit).headers).toBeInstanceOf(Headers)
    expect(((init as RequestInit).headers as Headers).get('Authorization')).toBe('Bearer token-1')
  })
})
