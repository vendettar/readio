import { fireEvent, render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CarouselShell } from '../CarouselShell'

const navSpy = vi.fn()

vi.mock('../CarouselNavigation', () => ({
  CarouselNavigation: (props: Record<string, unknown>) => {
    navSpy(props)
    return <div data-testid="carousel-nav" />
  },
}))

describe('CarouselShell', () => {
  it('binds ref and applies css width variable', () => {
    const ref = createRef<HTMLDivElement>()

    render(
      <CarouselShell
        scrollRef={ref}
        onScrollUpdate={vi.fn()}
        cssVarName="--item-width"
        itemWidth={240}
        viewportClassName="viewport"
        canScrollLeft={false}
        canScrollRight={false}
        onNavigate={vi.fn()}
      >
        <div>item</div>
      </CarouselShell>
    )

    expect(ref.current).toBeTruthy()
    expect(ref.current?.className.includes('viewport')).toBe(true)
    expect((ref.current?.parentElement as HTMLElement).style.getPropertyValue('--item-width')).toBe(
      '240px'
    )
  })

  it('updates on scroll and conditionally renders navigation', () => {
    const onScrollUpdate = vi.fn()

    const { rerender } = render(
      <CarouselShell
        scrollRef={createRef<HTMLDivElement>()}
        onScrollUpdate={onScrollUpdate}
        cssVarName="--column-width"
        itemWidth={320}
        viewportClassName="viewport"
        canScrollLeft
        canScrollRight
        onNavigate={vi.fn()}
        showNavigation={false}
      >
        <div>item</div>
      </CarouselShell>
    )

    expect(screen.queryByTestId('carousel-nav')).toBeNull()
    fireEvent.scroll(screen.getByText('item').parentElement as HTMLElement)
    expect(onScrollUpdate).toHaveBeenCalledTimes(1)

    rerender(
      <CarouselShell
        scrollRef={createRef<HTMLDivElement>()}
        onScrollUpdate={onScrollUpdate}
        cssVarName="--column-width"
        itemWidth={320}
        viewportClassName="viewport"
        canScrollLeft
        canScrollRight
        onNavigate={vi.fn()}
      >
        <div>item</div>
      </CarouselShell>
    )

    expect(screen.queryByTestId('carousel-nav')).not.toBeNull()
    expect(navSpy).toHaveBeenCalled()
  })
})
