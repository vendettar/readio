import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EpisodeListSkeleton } from '../EpisodeListSkeleton'

vi.mock('../EpisodeRowSkeleton', () => ({
  EpisodeRowSkeleton: () => <div data-testid="episode-skeleton" />,
}))

describe('EpisodeListSkeleton', () => {
  it('renders the correct number of skeletons', () => {
    render(<EpisodeListSkeleton count={5} label="Loading" />)
    const skeletons = screen.getAllByTestId('episode-skeleton')
    expect(skeletons).toHaveLength(5)
  })

  it('defaults to announcing the loading state via aria-live', () => {
    render(<EpisodeListSkeleton label="Loading episodes" />)
    const container = screen.getByLabelText('Loading episodes')
    expect(container.tagName).toBe('OUTPUT')
    expect(container.getAttribute('aria-busy')).toBe('true')
    expect(container.getAttribute('aria-live')).toBe('polite')
  })

  it('allows suppressing the loading announcement via the announce prop', () => {
    render(<EpisodeListSkeleton label="Loading episodes" announce={false} />)
    const container = screen.getByLabelText('Loading episodes')
    expect(container.tagName).toBe('OUTPUT')
    expect(container.getAttribute('aria-busy')).toBe('true')
    expect(container.getAttribute('aria-live')).toBe('off')
  })

  it('renders with a custom class name', () => {
    render(<EpisodeListSkeleton label="Loading" className="my-custom-class" />)
    const container = screen.getByLabelText('Loading')
    expect(container.classList.contains('my-custom-class')).toBe(true)
  })
})
