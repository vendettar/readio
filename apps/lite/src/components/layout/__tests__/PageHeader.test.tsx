import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { PageHeader } from '../PageHeader'

describe('PageHeader Contract', () => {
  it('renders primary title with line-clamp-2 to prevent overflow', () => {
    const longTitle =
      'A very long title that would definitely overflow if we do not truncate it properly using line-clamp-2'
    render(<PageHeader title={longTitle} />)
    const titleEl = screen.getByRole('heading', { level: 1 })
    expect(titleEl.className).toContain('line-clamp-2')
    expect(titleEl.className).not.toContain('ui-shell__title')
    expect(titleEl.textContent).toBe(longTitle)
  })

  it('renders subtitle with line-clamp-2 to prevent overflow', () => {
    const longSubtitle =
      'A very long subtitle that would definitely overflow if we do not truncate it properly using line-clamp-2'
    render(<PageHeader title="Test Title" subtitle={longSubtitle} />)
    // subtitle is a paragraph
    const subtitleEl = screen.getByText(longSubtitle)
    expect(subtitleEl.className).toContain('line-clamp-2')
    expect(subtitleEl.className).not.toContain('ui-shell__description')
  })

  it('allows actions container to wrap under pressure', () => {
    render(
      <PageHeader title="Test Title" actions={<div data-testid="action-btn">Action Button</div>} />
    )
    const actionContainer = screen.getByTestId('action-btn').parentElement
    expect(actionContainer?.className).toContain('flex-wrap')
  })
})
