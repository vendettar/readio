import type { CSSProperties, ReactNode, RefObject } from 'react'
import { cn } from '../../lib/utils'
import { CarouselNavigation } from './CarouselNavigation'

interface CarouselShellProps {
  scrollRef: RefObject<HTMLDivElement | null>
  onScrollUpdate: () => void
  cssVarName: '--item-width' | '--column-width'
  itemWidth: number
  viewportClassName: string
  wrapperClassName?: string
  showNavigation?: boolean
  canScrollLeft: boolean
  canScrollRight: boolean
  onNavigate: (direction: 'left' | 'right') => void
  navTopClassName?: string
  navHeightClassName?: string
  navParentGroupName?: 'carousel' | 'grid'
  children: ReactNode
}

export function CarouselShell({
  scrollRef,
  onScrollUpdate,
  cssVarName,
  itemWidth,
  viewportClassName,
  wrapperClassName,
  showNavigation = true,
  canScrollLeft,
  canScrollRight,
  onNavigate,
  navTopClassName,
  navHeightClassName,
  navParentGroupName,
  children,
}: CarouselShellProps) {
  return (
    <div
      className={cn('relative', wrapperClassName)}
      style={{ [cssVarName]: `${itemWidth}px` } as CSSProperties}
    >
      <div ref={scrollRef} onScroll={onScrollUpdate} className={viewportClassName}>
        {children}
      </div>

      {showNavigation && (
        <CarouselNavigation
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          onScroll={onNavigate}
          topClassName={navTopClassName}
          heightClassName={navHeightClassName}
          parentGroupName={navParentGroupName}
        />
      )}
    </div>
  )
}
