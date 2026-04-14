import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { FileTrack } from '../../../lib/db/types'
import { TRACK_SOURCE } from '../../../lib/db/types'
import { FileDragPreview } from '../FileDragPreview'

describe('FileDragPreview', () => {
  const makeTrack = (id: string, name: string): FileTrack => ({
    id,
    name,
    folderId: null,
    audioId: `audio-${id}`,
    sizeBytes: 0,
    createdAt: 0,
    sourceType: TRACK_SOURCE.USER_UPLOAD,
  })

  it('renders comfortable density with width class', () => {
    render(
      <FileDragPreview
        activeDragItem={makeTrack('t1', 'Dragged')}
        density="comfortable"
        widthClassName="w-72"
      />
    )

    const wrapper = screen.getByText('Dragged').parentElement
    expect(wrapper?.className.includes('w-72')).toBe(true)
    expect(wrapper?.className.includes('p-3')).toBe(true)
  })

  it('renders compact density class set', () => {
    render(
      <FileDragPreview
        activeDragItem={makeTrack('t2', 'Compact')}
        density="compact"
        widthClassName="w-64"
      />
    )

    const wrapper = screen.getByText('Compact').parentElement
    expect(wrapper?.className.includes('w-64')).toBe(true)
    expect(wrapper?.className.includes('p-2.5')).toBe(true)
  })
})
