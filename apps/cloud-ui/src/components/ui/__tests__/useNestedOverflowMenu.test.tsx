import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { type OutsideInteractionBehavior, useNestedOverflowMenu } from '../useNestedOverflowMenu'

function NestedMenuHarness({
  outsideClick,
  outsideInteractionBehavior = 'dismiss-only',
}: {
  outsideClick: () => void
  outsideInteractionBehavior?: OutsideInteractionBehavior
}) {
  const { closeMenu, handleOpenChange, isMenuOpen, menuContentRef, setStep, step, triggerRef } =
    useNestedOverflowMenu<'menu' | 'export'>({
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
})
