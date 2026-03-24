import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ExpandableDescription } from '../expandable-description'

describe('ExpandableDescription', () => {
  it('renders plain mode using stripped content', () => {
    render(
      <ExpandableDescription
        content="<p>Hello <strong>World</strong></p>"
        mode="plain"
        expanded={false}
        onExpandedChange={vi.fn()}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('renders html mode with sanitized markup', () => {
    render(
      <ExpandableDescription
        content="<p>Hello <strong>World</strong><script>alert(1)</script></p>"
        mode="html"
        expanded
        onExpandedChange={vi.fn()}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    expect(screen.getByText('Hello')).toBeTruthy()
    expect(document.querySelector('script')).toBeNull()
  })

  it('fires expand/collapse callbacks with show more/less controls', () => {
    const onExpandedChange = vi.fn()
    const longContent = `${'Long content '.repeat(30)}<strong>end</strong>`
    const { rerender } = render(
      <ExpandableDescription
        content={longContent}
        mode="plain"
        expanded={false}
        onExpandedChange={onExpandedChange}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    fireEvent.click(screen.getByText('Show more'))
    expect(onExpandedChange).toHaveBeenCalledWith(true)

    rerender(
      <ExpandableDescription
        content={longContent}
        mode="plain"
        expanded
        onExpandedChange={onExpandedChange}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    fireEvent.click(screen.getByText('Show less'))
    expect(onExpandedChange).toHaveBeenCalledWith(false)
  })

  it('wires aria-expanded and aria-controls between toggle and content region', () => {
    const longContent = `${'Long content '.repeat(30)}<strong>end</strong>`
    const onExpandedChange = vi.fn()
    const { rerender } = render(
      <ExpandableDescription
        content={longContent}
        mode="plain"
        expanded={false}
        onExpandedChange={onExpandedChange}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    const showMoreButton = screen.getByRole('button', { name: 'Show more' })
    const contentRegionId = showMoreButton.getAttribute('aria-controls')
    expect(showMoreButton.getAttribute('aria-expanded')).toBe('false')
    expect(contentRegionId).toBeTruthy()
    expect(document.getElementById(contentRegionId ?? '')).toBeTruthy()

    rerender(
      <ExpandableDescription
        content={longContent}
        mode="plain"
        expanded
        onExpandedChange={onExpandedChange}
        showMoreLabel="Show more"
        showLessLabel="Show less"
      />
    )

    const showLessButton = screen.getByRole('button', { name: 'Show less' })
    expect(showLessButton.getAttribute('aria-expanded')).toBe('true')
    expect(showLessButton.getAttribute('aria-controls')).toBe(contentRegionId)
  })
})
