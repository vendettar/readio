import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { cn } from '@/lib/utils'

import { Button } from '../button'
import { Input } from '../input'

describe('shared primitive contract', () => {
  it('Lite button path uses the shared Button primitive contract', () => {
    render(
      <Button variant="secondary" size="sm">
        Save
      </Button>
    )

    const button = screen.getByRole('button', { name: 'Save' })
    expect(button.className).toContain('bg-secondary')
    expect(button.className).toContain('h-8')
    expect(button.className).not.toContain('ui-button')
  })

  it('Lite input path uses the shared Input primitive contract', () => {
    render(<Input placeholder="Search library" />)

    const input = screen.getByPlaceholderText('Search library')
    expect(input.className).toContain('border-input')
    expect(input.className).toContain('focus-visible:ring-1')
    expect(input.className).not.toContain('ui-input')
  })

  it('Lite cn path delegates to the shared merge contract', () => {
    expect(cn('px-2', 'px-4', false, undefined, 'text-sm')).toBe('px-4 text-sm')
  })
})
