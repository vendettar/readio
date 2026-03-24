import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { RenameInput } from '../RenameInput'

describe('RenameInput', () => {
  it('renders conflict popover when conflict error is active', () => {
    render(
      <RenameInput
        value="Track A"
        setValue={vi.fn()}
        errorKind="conflict"
        conflictMessage="Name conflict"
        inputRef={createRef<HTMLInputElement>()}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        onBlurConfirm={vi.fn()}
        onKeyDown={vi.fn()}
      />
    )

    expect(screen.queryByText('Name conflict')).not.toBeNull()
  })

  it('confirm/cancel button handlers fire and confirm is single-fire against blur', () => {
    const onConfirm = vi.fn()
    const onCancel = vi.fn()
    const onBlurConfirm = vi.fn()

    render(
      <RenameInput
        value="Track A"
        setValue={vi.fn()}
        errorKind={null}
        conflictMessage="Name conflict"
        inputRef={createRef<HTMLInputElement>()}
        onConfirm={onConfirm}
        onCancel={onCancel}
        onBlurConfirm={onBlurConfirm}
        onKeyDown={vi.fn()}
      />
    )

    const input = screen.getByRole('textbox')
    const buttons = screen.getAllByRole('button')
    const confirmBtn = buttons[0]
    const cancelBtn = buttons[1]

    fireEvent.mouseDown(confirmBtn)
    fireEvent.blur(input)
    fireEvent.click(confirmBtn)
    expect(onBlurConfirm).toHaveBeenCalledTimes(0)
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.mouseDown(cancelBtn)
    fireEvent.click(cancelBtn)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})
