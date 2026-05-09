import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type OutsideInteractionBehavior, useNestedOverflowMenu } from '../useNestedOverflowMenu'

function NestedMenuHarness({
  closeOnNestedOutside = true,
  outsideClick,
  outsideInteractionBehavior = 'dismiss-only',
}: {
  closeOnNestedOutside?: boolean
  outsideClick: () => void
  outsideInteractionBehavior?: OutsideInteractionBehavior
}) {
  const { closeMenu, handleOpenChange, isMenuOpen, menuContentRef, setStep, step, triggerRef } =
    useNestedOverflowMenu<'menu' | 'export'>({
      closeOnNestedOutside,
      initialStep: 'menu',
      outsideInteractionBehavior,
    })

  return (
    <div>
      <button type="button" onClick={outsideClick}>
        outside
      </button>
      <button
        ref={triggerRef}
        type="button"
        aria-label="trigger"
        onClick={() => handleOpenChange(!isMenuOpen)}
      >
        trigger
      </button>
      {isMenuOpen ? (
        <div ref={menuContentRef}>
          {step === 'menu' ? (
            <button type="button" onClick={() => setStep('export')}>
              export
            </button>
          ) : (
            <button type="button" onClick={closeMenu}>
              nested
            </button>
          )}
        </div>
      ) : null}
      <div data-testid="is-open">{String(isMenuOpen)}</div>
      <div data-testid="step">{step}</div>
    </div>
  )
}

describe('useNestedOverflowMenu', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('closes nested menus without letting the first outside click hit the target', async () => {
    const outsideClick = vi.fn()
    render(<NestedMenuHarness outsideClick={outsideClick} />)

    fireEvent.click(screen.getByLabelText('trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('step').textContent).toBe('export')

    const outsideButton = screen.getByRole('button', { name: 'outside' })
    fireEvent.mouseDown(outsideButton)
    fireEvent.click(outsideButton)

    await waitFor(() => {
      expect(screen.getByTestId('is-open').textContent).toBe('false')
    })
    expect(screen.getByTestId('step').textContent).toBe('menu')
    expect(outsideClick).not.toHaveBeenCalled()
  })

  it('can close nested menus and allow the outside click target to receive the click', async () => {
    const outsideClick = vi.fn()
    render(
      <NestedMenuHarness
        outsideClick={outsideClick}
        outsideInteractionBehavior="dismiss-and-allow-click-through"
      />
    )

    fireEvent.click(screen.getByLabelText('trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('step').textContent).toBe('export')

    const outsideButton = screen.getByRole('button', { name: 'outside' })
    fireEvent.mouseDown(outsideButton)
    fireEvent.click(outsideButton)

    await waitFor(() => {
      expect(screen.getByTestId('is-open').textContent).toBe('false')
    })
    expect(screen.getByTestId('step').textContent).toBe('menu')
    expect(outsideClick).toHaveBeenCalledTimes(1)
  })

  it('returns to the initial step without closing when closeOnNestedOutside is false', async () => {
    const outsideClick = vi.fn()
    render(<NestedMenuHarness outsideClick={outsideClick} closeOnNestedOutside={false} />)

    fireEvent.click(screen.getByLabelText('trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    const outsideButton = screen.getByRole('button', { name: 'outside' })
    fireEvent.mouseDown(outsideButton)
    fireEvent.click(outsideButton)

    await waitFor(() => {
      expect(screen.getByTestId('step').textContent).toBe('menu')
    })
    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(outsideClick).not.toHaveBeenCalled()
  })

  it('does not treat the trigger as an outside interaction while nested content is open', () => {
    render(<NestedMenuHarness outsideClick={vi.fn()} closeOnNestedOutside={false} />)

    fireEvent.click(screen.getByLabelText('trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))
    fireEvent.mouseDown(screen.getByLabelText('trigger'))

    expect(screen.getByTestId('is-open').textContent).toBe('true')
    expect(screen.getByTestId('step').textContent).toBe('export')
  })

  it('cleans up suppression timers on unmount and does not leak click suppression afterward', () => {
    vi.useFakeTimers()
    const firstOutsideClick = vi.fn()
    const { unmount } = render(<NestedMenuHarness outsideClick={firstOutsideClick} />)

    fireEvent.click(screen.getByLabelText('trigger'))
    fireEvent.click(screen.getByRole('button', { name: 'export' }))

    const firstOutsideButton = screen.getByRole('button', { name: 'outside' })
    fireEvent.mouseDown(firstOutsideButton)
    fireEvent.click(firstOutsideButton)

    expect(screen.getByTestId('is-open').textContent).toBe('false')
    expect(firstOutsideClick).not.toHaveBeenCalled()

    unmount()
    vi.runOnlyPendingTimers()

    const secondOutsideClick = vi.fn()
    render(<NestedMenuHarness outsideClick={secondOutsideClick} />)
    fireEvent.click(screen.getByRole('button', { name: 'outside' }))

    expect(secondOutsideClick).toHaveBeenCalledTimes(1)
  })
})
