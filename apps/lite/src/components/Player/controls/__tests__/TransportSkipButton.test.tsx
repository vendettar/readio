import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TransportSkipButton } from '../TransportSkipButton'

describe('TransportSkipButton', () => {
  it('renders aria labels for back/forward controls', () => {
    const noop = vi.fn()
    const { rerender } = render(
      <TransportSkipButton direction="back" onClick={noop} ariaLabel="skipBack10s" />
    )
    expect(screen.getByLabelText('skipBack10s')).toBeTruthy()

    rerender(<TransportSkipButton direction="forward" onClick={noop} ariaLabel="skipForward10s" />)
    expect(screen.getByLabelText('skipForward10s')).toBeTruthy()
  })

  it('dispatches click callback', () => {
    const onClick = vi.fn()
    render(<TransportSkipButton direction="back" onClick={onClick} ariaLabel="skipBack10s" />)

    fireEvent.click(screen.getByLabelText('skipBack10s'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
