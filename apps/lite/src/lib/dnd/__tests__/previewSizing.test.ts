import { describe, expect, it } from 'vitest'
import { getDragPreviewWidthClass } from '../previewSizing'

describe('getDragPreviewWidthClass', () => {
  it('returns comfortable width class', () => {
    expect(getDragPreviewWidthClass('comfortable')).toBe('w-72')
  })

  it('returns compact width class', () => {
    expect(getDragPreviewWidthClass('compact')).toBe('w-64')
  })
})
