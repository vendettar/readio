import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageShell } from '../PageShell'

describe('PageShell Contract', () => {
  it('enforces max-width and horizontal padding correctly', () => {
    render(
      <PageShell>
        <div data-testid="content">Content</div>
      </PageShell>
    )
    const container = screen.getByTestId('content').parentElement
    expect(container?.className).toContain('max-w-content')
    expect(container?.className).toContain('px-page')
  })

  it('provides bottom padding to clear the mini-player', () => {
    render(
      <PageShell>
        <div data-testid="content">Content</div>
      </PageShell>
    )
    const container = screen.getByTestId('content').parentElement
    expect(container?.className).toContain('pb-32')
  })

  it('delegates scrolling to AppShell (no nested overflow-y-auto)', () => {
    const { container } = render(<PageShell>Content</PageShell>)
    const shellRoot = container.firstChild as HTMLElement
    expect(shellRoot.className).toContain('flex-col')
    expect(shellRoot.className).not.toContain('overflow-y-auto')
  })
})
