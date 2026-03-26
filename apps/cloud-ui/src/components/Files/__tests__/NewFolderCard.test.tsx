import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NewFolderCard } from '../NewFolderCard'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

describe('NewFolderCard', () => {
  it('confirms on Enter, cancels on Escape, and confirms on blur', () => {
    const onChange = vi.fn()
    const onConfirm = vi.fn()
    const onCancel = vi.fn()

    render(
      <NewFolderCard
        value="Folder"
        onChange={onChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
        inputRef={{ current: null }}
        containerRef={{ current: null }}
      />
    )

    const input = screen.getByPlaceholderText('filesFolderName')

    fireEvent.change(input, { target: { value: 'Folder 2' } })
    expect(onChange).toHaveBeenCalledWith('Folder 2')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onConfirm).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledTimes(1)

    fireEvent.blur(input)
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })
})
