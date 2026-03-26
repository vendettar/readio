import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getLookupCalloutSide, getLookupCalloutStyle } from '../lookupGeometry'
import { LookupCallout, RangeActionMenu, WordContextMenu } from '../SelectionUI'

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string) => key,
    }),
  }
})

const originalViewport = {
  innerWidth: window.innerWidth,
  innerHeight: window.innerHeight,
}
const originalResizeObserver = globalThis.ResizeObserver

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function setViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  })
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  })
}

const mockOwner = {
  ownerCueKey: 'test-cue',
  ownerCueStartMs: 1000,
  ownerKind: 'word' as const,
  ownerTokenInstanceId: 'test-id',
}

describe('SelectionUI positioning', () => {
  beforeEach(() => {
    setViewport(originalViewport.innerWidth, originalViewport.innerHeight)
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver
  })

  afterEach(() => {
    setViewport(originalViewport.innerWidth, originalViewport.innerHeight)
    if (originalResizeObserver) {
      globalThis.ResizeObserver = originalResizeObserver
      return
    }
    delete (globalThis as { ResizeObserver?: typeof ResizeObserver }).ResizeObserver
  })

  it('WordContextMenu prioritizes top placement and uses stable rect for words', async () => {
    setViewport(1024, 768)
    const pos = {
      x: 500,
      y: 400,
      rect: {
        left: 450,
        top: 390,
        right: 550,
        bottom: 410,
        width: 100,
        height: 20,
      },
    }
    render(
      <WordContextMenu
        position={pos}
        selectedText="example"
        menuMode="word"
        surfaceId={1}
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const menu = await screen.findByTestId('word-context-menu')
    // Floating UI sets data-side for placement info.
    expect(menu.getAttribute('data-side')).toMatch(/^top/)
  })

  it('WordContextMenu uses pointer coordinates for line mode', async () => {
    setViewport(1024, 768)
    const pos = {
      x: 200,
      y: 300,
      rect: {
        left: 0,
        top: 250,
        right: 1000,
        bottom: 350,
        width: 1000,
        height: 100,
      },
    }
    render(
      <WordContextMenu
        surfaceId={1}
        position={pos}
        selectedText="line text"
        menuMode="line"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const menu = await screen.findByTestId('word-context-menu')
    expect(menu.getAttribute('data-side')).toMatch(/^top/)
  })

  it('closes WordContextMenu on scroll like an outside interaction', async () => {
    const onClose = vi.fn()
    const pos = { x: 500, y: 400 }
    render(
      <WordContextMenu
        position={pos}
        selectedText="example"
        menuMode="word"
        surfaceId={1}
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    await screen.findByTestId('word-context-menu')
    window.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })

    window.dispatchEvent(new Event('resize'))
    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('closes RangeActionMenu on scroll like an outside interaction', async () => {
    const onClose = vi.fn()
    const pos = { x: 500, y: 400 }
    render(
      <RangeActionMenu
        surfaceId={1}
        position={pos}
        selectedText="range example"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={onClose}
      />
    )

    await screen.findByTestId('range-action-menu')
    window.dispatchEvent(new Event('scroll'))

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('closes LookupCallout on viewport resize like an outside interaction', async () => {
    const onClose = vi.fn()
    const pos = {
      x: 480,
      y: 360,
      rect: {
        left: 430,
        top: 340,
        right: 530,
        bottom: 372,
        width: 100,
        height: 32,
      },
    }
    render(
      <LookupCallout
        surfaceId={1}
        position={pos}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={onClose}
      />
    )

    await screen.findByTestId('lookup-callout')
    window.dispatchEvent(new Event('resize'))

    await vi.waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1)
    })
  })

  it('renders a directional arrow in WordContextMenu and RangeActionMenu', async () => {
    setViewport(1024, 768)
    const pos = { x: 500, y: 400 }

    // 1. Test WordContextMenu at top (normal orientation)
    const { unmount: unmountWord } = render(
      <WordContextMenu
        position={pos}
        selectedText="example"
        menuMode="word"
        surfaceId={1}
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const wordMenu = await screen.findByTestId('word-context-menu')
    const wordArrow = wordMenu.querySelector('.rotate-45')
    expect(wordArrow).toBeTruthy()
    expect(wordArrow?.className).toContain('border-t-0')
    expect(wordArrow?.className).toContain('border-l-0')
    unmountWord()

    // 2. Test RangeActionMenu (basic rendering)
    const { unmount: unmountRange } = render(
      <RangeActionMenu
        surfaceId={1}
        position={pos}
        selectedText="range example"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )
    const rangeMenu = await screen.findByTestId('range-action-menu')
    const rangeArrow = rangeMenu.querySelector('.rotate-45')
    expect(rangeArrow).toBeTruthy()
    expect(rangeArrow?.className).toContain('bg-popover')
    expect(rangeMenu.className).toContain('overflow-visible')
    unmountRange()

    // 3. Test flip scenario (bottom placement)
    const spy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        const testId = this.getAttribute('data-testid')
        if (testId === 'range-action-menu') {
          return {
            width: 200,
            height: 100,
            top: 0,
            left: 0,
            right: 200,
            bottom: 100,
            x: 0,
            y: 0,
            toJSON: () => {},
          } as DOMRect
        }
        if (testId === 'range-menu-anchor') {
          return {
            width: 100,
            height: 10,
            top: 0,
            left: 450,
            right: 550,
            bottom: 10,
            x: 450,
            y: 0,
            toJSON: () => {},
          } as DOMRect
        }
        if (this.tagName === 'HTML' || this.tagName === 'BODY') {
          return {
            width: 1024,
            height: 150,
            top: 0,
            left: 0,
            right: 1024,
            bottom: 150,
            x: 0,
            y: 0,
            toJSON: () => {},
          } as DOMRect
        }
        return {
          width: 0,
          height: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          x: 0,
          y: 0,
          toJSON: () => {},
        } as DOMRect
      })

    const vhSpy = vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(150)
    setViewport(1024, 150)

    const flipPos = { x: 500, y: 0 }
    render(
      <RangeActionMenu
        surfaceId={1}
        position={flipPos}
        selectedText="flip example"
        owner={mockOwner}
        onCopy={vi.fn()}
        onSearch={vi.fn()}
        onLookup={vi.fn()}
        onClose={vi.fn()}
      />
    )

    const flipMenu = await screen.findByTestId('range-action-menu')

    await vi.waitFor(
      () => {
        expect(flipMenu.getAttribute('data-side')).toBe('bottom')
      },
      { timeout: 3000 }
    )

    const flipArrow = flipMenu.querySelector('.rotate-45')
    expect(flipArrow?.className).toContain('border-b-0')
    expect(flipArrow?.className).toContain('border-r-0')

    spy.mockRestore()
    vhSpy.mockRestore()
  })

  it('prefers the left side of the clicked word when enough horizontal space exists', () => {
    const side = getLookupCalloutSide(
      {
        x: 480,
        y: 360,
        rect: {
          left: 430,
          top: 340,
          right: 530,
          bottom: 372,
          width: 100,
          height: 32,
        },
      },
      { width: 1024, height: 768 }
    )
    expect(side).toBe('left')
  })

  it('falls back to the right side when the left side does not have enough space', () => {
    const side = getLookupCalloutSide(
      {
        x: 140,
        y: 360,
        rect: {
          left: 90,
          top: 340,
          right: 170,
          bottom: 372,
          width: 80,
          height: 32,
        },
      },
      { width: 1024, height: 768 }
    )
    expect(side).toBe('right')
  })

  it('prefers the top side when horizontal sides are unavailable and there is room above', () => {
    const side = getLookupCalloutSide(
      {
        x: 200,
        y: 620,
        rect: {
          left: 140,
          top: 600,
          right: 220,
          bottom: 632,
          width: 80,
          height: 32,
        },
      },
      { width: 420, height: 900 }
    )
    expect(side).toBe('top')
  })

  it('uses the bottom side when there is not enough room above', () => {
    const side = getLookupCalloutSide(
      {
        x: 200,
        y: 40,
        rect: {
          left: 140,
          top: 24,
          right: 220,
          bottom: 56,
          width: 80,
          height: 32,
        },
      },
      { width: 420, height: 768 }
    )
    expect(side).toBe('bottom')
  })

  it('chooses the side with more vertical room when neither top nor bottom fully fits', () => {
    const side = getLookupCalloutSide(
      {
        x: 200,
        y: 260,
        rect: {
          left: 140,
          top: 240,
          right: 220,
          bottom: 272,
          width: 80,
          height: 32,
        },
      },
      { width: 420, height: 560 }
    )
    expect(side).toBe('bottom')
  })

  it('renders the lookup popover on the left side when the left side has room', () => {
    const pos = {
      x: 480,
      y: 360,
      rect: {
        left: 430,
        top: 340,
        right: 530,
        bottom: 372,
        width: 100,
        height: 32,
      },
    }
    render(
      <LookupCallout
        surfaceId={1}
        position={pos}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />
    )

    const anchor = screen.getByTestId('lookup-anchor')
    const dialog = screen.getByRole('dialog', { name: 'lookUp' })

    expect(anchor.style.left).toBe('430px')
    expect(anchor.style.top).toBe('340px')
    expect(anchor.style.width).toBe('100px')
    expect(anchor.style.height).toBe('32px')
    expect(dialog.getAttribute('data-side')).toBe('left')
    expect(document.body.contains(dialog)).toBe(true)
    expect(document.body.contains(anchor)).toBe(true)
  })

  it('renders the lookup popover on the right side when the left side does not have room', () => {
    const pos = {
      x: 140,
      y: 360,
      rect: {
        left: 90,
        top: 340,
        right: 170,
        bottom: 372,
        width: 80,
        height: 32,
      },
    }
    render(
      <LookupCallout
        surfaceId={1}
        position={pos}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />
    )

    const dialog = screen.getByRole('dialog', { name: 'lookUp' })
    expect(dialog.getAttribute('data-side')).toBe('right')
  })

  it('clamps top placement horizontally to stay within the viewport', () => {
    const style = getLookupCalloutStyle(
      {
        x: 40,
        y: 420,
        rect: {
          left: 16,
          top: 400,
          right: 64,
          bottom: 432,
          width: 48,
          height: 32,
        },
      },
      'top',
      { width: 360, height: 800 }
    )
    expect(style.left).toBe('170px')
    expect(style.top).toBe('392px')
    expect(style.transform).toBe('translate(-50%, -100%)')
  })

  it('clamps side placement vertically to stay within the viewport', () => {
    const style = getLookupCalloutStyle(
      {
        x: 520,
        y: 40,
        rect: {
          left: 500,
          top: 20,
          right: 540,
          bottom: 52,
          width: 40,
          height: 32,
        },
      },
      'right',
      { width: 1280, height: 720 }
    )
    expect(style.left).toBe('548px')
    expect(style.top).toBe('202px')
    expect(style.transform).toBe('translate(0, -50%)')
  })

  it('renders the lookup popover into document.body to avoid transformed container drift', () => {
    const container = document.createElement('div')
    container.style.transform = 'translateZ(0)'
    document.body.appendChild(container)

    const pos = { x: 200, y: 360 }
    render(
      <LookupCallout
        surfaceId={1}
        position={pos}
        word="example"
        loading={false}
        errorKey={null}
        result={null}
        owner={mockOwner}
        onClose={vi.fn()}
      />,
      { container }
    )

    const dialog = screen.getByRole('dialog', { name: 'lookUp' })
    const anchor = screen.getByTestId('lookup-anchor')

    expect(document.body.contains(dialog)).toBe(true)
    expect(document.body.contains(anchor)).toBe(true)
    expect(container.contains(dialog)).toBe(false)
    expect(container.contains(anchor)).toBe(false)
    container.remove()
  })
})
