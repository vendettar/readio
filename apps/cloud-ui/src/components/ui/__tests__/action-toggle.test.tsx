import { fireEvent, render, screen } from '@testing-library/react'
import { Check, Plus } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'
import { ActionToggle } from '../action-toggle'

describe('ActionToggle', () => {
  it('switches aria label based on active state and triggers callback', () => {
    const onToggle = vi.fn()
    const { rerender } = render(
      <ActionToggle
        active={false}
        onToggle={onToggle}
        activeIcon={Check}
        inactiveIcon={Plus}
        activeAriaLabel="unsubscribe"
        inactiveAriaLabel="subscribe"
        inactiveLabel="Subscribe"
      />
    )

    const inactiveButton = screen.getByLabelText('subscribe')
    expect(inactiveButton.textContent).toContain('Subscribe')
    const inactiveIcons = inactiveButton.querySelectorAll('svg')
    expect(inactiveIcons[0]?.className.baseVal).toContain('opacity-100')
    expect(inactiveIcons[1]?.className.baseVal).toContain('opacity-0')
    fireEvent.click(inactiveButton)
    expect(onToggle).toHaveBeenCalledTimes(1)

    rerender(
      <ActionToggle
        active
        onToggle={onToggle}
        activeIcon={Check}
        inactiveIcon={Plus}
        activeAriaLabel="unsubscribe"
        inactiveAriaLabel="subscribe"
        inactiveLabel="Subscribe"
      />
    )

    const activeButton = screen.getByLabelText('unsubscribe')
    expect(activeButton.textContent).not.toContain('Subscribe')
    const activeIcons = activeButton.querySelectorAll('svg')
    expect(activeIcons[0]?.className.baseVal).toContain('opacity-0')
    expect(activeIcons[1]?.className.baseVal).toContain('opacity-100')
  })
})
