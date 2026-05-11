import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OpsPage from '@/routeComponents/OpsPage'

describe('OpsPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
    window.__READIO_ENV__ = {
      VITE_API_BASE_URL: 'https://api-pre.readio.top',
      VITE_GRAFANA_FARO_ENV: 'preproduction',
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.__READIO_ENV__ = undefined
  })

  it('renders a Grafana logs entry instead of an admin token client', () => {
    render(<OpsPage />)

    expect(screen.getByRole('heading', { name: 'Production logs moved' })).not.toBeNull()
    expect(screen.getByText('{service="readio-cloud", env="preproduction"}')).not.toBeNull()
    expect(screen.getByText(/api-pre\.readio\.top/)).not.toBeNull()
    expect(screen.getByRole('link', { name: /Open Grafana/i })).not.toBeNull()
    expect(screen.queryByPlaceholderText('Bearer token')).toBeNull()
    expect(screen.queryByRole('button', { name: /Use token/i })).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })
})
