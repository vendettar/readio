import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageShell } from '../PageShell'

describe('PageShell Contract', () => {
  it('enforces max-width and horizontal padding correctly', () => {
    render(
      <PageShell>
        <div data-testid="content">Test Content</div>
      </PageShell>
    )
    const content = screen.getByTestId('content')
    const container = content.parentElement
    expect(container?.className).toContain('max-w-content')
    expect(container?.className).toContain('px-page')
  })

  it('delegates scrolling to AppShell (no nested overflow-y-auto)', () => {
    render(
      <PageShell>
        <div data-testid="content">Test Content</div>
      </PageShell>
    )
    const content = screen.getByTestId('content')
    const container = content.parentElement
    expect(container?.className).not.toContain('overflow-y-auto')
  })
})
