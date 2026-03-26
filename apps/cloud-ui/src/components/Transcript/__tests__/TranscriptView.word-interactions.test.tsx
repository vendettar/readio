import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ASRCue } from '../../../lib/asr/types'
import type { SelectionState } from '../../../lib/selection'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { TranscriptView } from '../TranscriptView'

let mockLanguage = 'en'

const {
  lookupWordMock,
  openWordMenuMock,
  openLineMenuMock,
  selectionHookMock,
  fetchDefinitionMock,
  applyLookupHighlightForWordMock,
  selectionUIPropsRef,
  delegateToRealUseSelectionRef,
} = vi.hoisted(() => ({
  lookupWordMock: vi.fn().mockResolvedValue(undefined),
  openWordMenuMock: vi.fn(),
  openLineMenuMock: vi.fn(),
  selectionHookMock: vi.fn(),
  fetchDefinitionMock: vi.fn(),
  applyLookupHighlightForWordMock: vi.fn(),
  selectionUIPropsRef: {
    current: null as null | {
      onClose?: (options?: unknown) => void
      state?: SelectionState
      onLookup?: () => void
    },
  },
  delegateToRealUseSelectionRef: { current: false },
}))

vi.mock('react-i18next', async () => {
  const actual = await vi.importActual<typeof import('react-i18next')>('react-i18next')
  return {
    ...actual,
    useTranslation: () => ({
      i18n: {
        language: mockLanguage,
        resolvedLanguage: mockLanguage,
      },
    }),
  }
})

vi.mock('../../../lib/selection', async () => {
  const actual =
    await vi.importActual<typeof import('../../../lib/selection')>('../../../lib/selection')
  return {
    ...actual,
    fetchDefinition: fetchDefinitionMock,
  }
})

vi.mock('../../../hooks/useSelection', async () => {
  const actual = await vi.importActual<typeof import('../../../hooks/useSelection')>(
    '../../../hooks/useSelection'
  )
  return {
    useSelection: (
      ...args: Parameters<typeof actual.useSelection>
    ): ReturnType<typeof actual.useSelection> => {
      const selectionImpl = delegateToRealUseSelectionRef.current
        ? actual.useSelection
        : selectionHookMock
      return selectionImpl(...args)
    },
  }
})

vi.mock('../../../lib/selection/dictCache', async () => {
  const actual = await vi.importActual<typeof import('../../../lib/selection/dictCache')>(
    '../../../lib/selection/dictCache'
  )
  return {
    ...actual,
    applyLookupHighlightForWord: applyLookupHighlightForWordMock,
  }
})

interface VirtuosoMockProps<T> {
  data?: T[]
  itemContent: (index: number, item: T) => React.ReactNode
  components?: {
    Header?: () => React.ReactNode
    Footer?: () => React.ReactNode
  }
  className?: string
}

vi.mock('react-virtuoso', () => ({
  Virtuoso: ({ data = [], itemContent, components, className }: VirtuosoMockProps<ASRCue>) => (
    <div data-testid="virtuoso" className={className}>
      {components?.Header?.()}
      {data.map((item: ASRCue, index: number) => (
        <div key={`${item.start}-${item.end}-${item.text.slice(0, 16)}`}>
          {itemContent(index, item)}
        </div>
      ))}
      {components?.Footer?.()}
    </div>
  ),
}))

vi.mock('../../Selection', () => ({
  SelectionUI: (props: { onClose?: (options?: unknown) => void }) => {
    selectionUIPropsRef.current = props
    return null
  },
}))

vi.mock('../../ui/error-boundary', () => ({
  ComponentErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('../../../lib/errorReporter', () => ({
  reportError: vi.fn(),
}))

const baseSelectionState: SelectionState = {
  surface: { type: 'none' },
  lookupLoading: false,
  lookupErrorKey: null,
  lookupResult: null,
}

describe('TranscriptView word interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLanguage = 'en'
    selectionUIPropsRef.current = null
    delegateToRealUseSelectionRef.current = false
    fetchDefinitionMock.mockResolvedValue({
      word: 'hello',
      phonetic: '',
      phonetics: [],
      meanings: [
        {
          partOfSpeech: 'interjection',
          definitions: [{ definition: 'A greeting.' }],
        },
      ],
    })
    selectionHookMock.mockReturnValue({
      state: baseSelectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    })
  })

  afterEach(() => {
    act(() => {
      window.getSelection()?.removeAllRanges()
      useTranscriptStore.setState({ highlightedWord: null })
    })
  })

  it('left-click word dispatches lookup exactly once without fallback duplicate', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    expect(word.tagName).toBe('SPAN')
    const subtitleText = word.closest('.subtitle-text') as HTMLElement
    expect(subtitleText.className).not.toContain('pointer-events-none')
    // Mock getBoundingClientRect since the test environment returns all 0s
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    expect(lookupWordMock).toHaveBeenCalledTimes(1)
    expect(lookupWordMock).toHaveBeenCalledWith(
      'hello',
      125, // x (left + width/2)
      88, // y (top - 12)
      expect.anything(),
      expect.anything()
    )
    expect(openWordMenuMock).not.toHaveBeenCalled()
  })

  it('unsupported transcript language opens dedicated lookupDictionaryNotConfigured state from word click', async () => {
    mockLanguage = 'zh-CN'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupResult).toBeNull()
    })

    expect(lookupWordMock).not.toHaveBeenCalled()
    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('zh-TW transcript language still resolves to lookupDictionaryNotConfigured from word click', async () => {
    mockLanguage = 'zh-TW'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupResult).toBeNull()
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('zh-HK transcript language still resolves to lookupDictionaryNotConfigured from word click', async () => {
    mockLanguage = 'zh-HK'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupResult).toBeNull()
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('unsupported transcript language reaches lookupDictionaryNotConfigured from word menu Look Up path', async () => {
    mockLanguage = 'zh-CN'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 110,
      clientY: 105,
    })

    await act(async () => {
      word.dispatchEvent(event)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('contextMenu')
      expect(selectionUIPropsRef.current?.state?.surface.type).not.toBe('lookup')
      expect(selectionUIPropsRef.current?.onLookup).toBeTypeOf('function')
    })

    await act(async () => {
      selectionUIPropsRef.current?.onLookup?.()
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).not.toBe('lookupNotFound')
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).not.toBe('errorNetwork')
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupResult).toBeNull()
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()

    await act(async () => {
      selectionUIPropsRef.current?.onClose?.({ reason: 'dismiss', surface: 'lookup' })
    })

    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()
  })

  it('en-US transcript language continues through the English lookup path from word click', async () => {
    mockLanguage = 'en-US'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).not.toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBeNull()
      expect(selectionUIPropsRef.current?.state?.lookupResult?.word).toBe('hello')
    })
  })

  it('en-GB transcript language continues through the English lookup path from word click', async () => {
    mockLanguage = 'en-GB'
    delegateToRealUseSelectionRef.current = true

    renderTranscript()

    const word = screen.getByText('Hello')
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(word)
    })

    await waitFor(() => {
      expect(selectionUIPropsRef.current?.state?.surface.type).toBe('lookup')
      expect(selectionUIPropsRef.current?.state?.lookupLoading).toBe(false)
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).not.toBe(
        'lookupDictionaryNotConfigured'
      )
      expect(selectionUIPropsRef.current?.state?.lookupErrorKey).toBeNull()
      expect(selectionUIPropsRef.current?.state?.lookupResult?.word).toBe('hello')
    })
  })

  it('right-click word opens word menu with selected word text', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    expect(word.tagName).toBe('SPAN')
    const subtitleText = word.closest('.subtitle-text') as HTMLElement
    expect(subtitleText.className).not.toContain('pointer-events-none')
    // Mock getBoundingClientRect since the test environment returns all 0s
    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 110,
      clientY: 105,
    })

    await act(async () => {
      word.dispatchEvent(event)
    })

    expect(openWordMenuMock).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
    expect(openWordMenuMock).toHaveBeenCalledWith(
      'hello',
      125, // x (left + width/2)
      100, // y (top)
      expect.anything(),
      expect.anything()
    )
    expect(lookupWordMock).not.toHaveBeenCalled()
  })

  it('right-click on line whitespace opens line menu instead of selected-text menu', async () => {
    renderTranscript()

    const line = screen.getByText('Hello').closest('.subtitle-line') as HTMLDivElement
    const paragraph = line.querySelector('.subtitle-text') as HTMLParagraphElement

    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 240,
      height: 48,
      right: 340,
      bottom: 148,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 105,
      clientY: 112,
    })

    await act(async () => {
      paragraph.dispatchEvent(event)
    })

    expect(event.defaultPrevented).toBe(true)
    expect(openLineMenuMock).toHaveBeenCalledTimes(1)
    expect(openWordMenuMock).not.toHaveBeenCalled()
    expect(openLineMenuMock).toHaveBeenCalledWith(
      'Hello world',
      105,
      112,
      expect.anything(),
      expect.objectContaining({
        ownerCueKey: '0-2',
        ownerCueStartMs: 0,
        ownerKind: 'line',
      }),
      'line'
    )
  })

  it('line whitespace right-click does not open selected-text menu even if native selection exists inside a word', async () => {
    renderTranscript()

    const line = screen.getByText('Hello').closest('.subtitle-line') as HTMLDivElement
    const paragraph = line.querySelector('.subtitle-text') as HTMLParagraphElement
    const word = screen.getByText('Hello')

    const node = word.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 2)

    act(() => {
      const selection = window.getSelection()
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    vi.spyOn(line, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 240,
      height: 48,
      right: 340,
      bottom: 148,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 105,
      clientY: 112,
    })

    await act(async () => {
      paragraph.dispatchEvent(event)
    })

    expect(openLineMenuMock).toHaveBeenCalledTimes(1)
    expect(openWordMenuMock).not.toHaveBeenCalled()
    expect(openLineMenuMock).toHaveBeenLastCalledWith(
      'Hello world',
      105,
      112,
      expect.anything(),
      expect.objectContaining({
        ownerKind: 'line',
      }),
      'line'
    )
  })

  it('right-click word leaves native selection collapsed', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')

    vi.spyOn(word, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    act(() => {
      window.getSelection()?.removeAllRanges()
    })

    const event = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 110,
      clientY: 105,
    })

    await act(async () => {
      word.dispatchEvent(event)
    })

    expect(window.getSelection()?.isCollapsed ?? true).toBe(true)
    expect(openWordMenuMock).toHaveBeenCalledTimes(1)
  })

  it('with non-collapsed native selection, right-click does not dispatch word menu', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    const node = word.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 2)
    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.contextMenu(word)
    })

    expect(openWordMenuMock).not.toHaveBeenCalled()
  })

  it('with non-collapsed native selection, left-click does not dispatch lookup', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    const node = word.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 2)
    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.click(word)
    })

    expect(lookupWordMock).not.toHaveBeenCalled()
  })

  it('selection elsewhere on the page does not block transcript word lookup', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    const range = document.createRange()
    const externalNode = document.createTextNode('external')
    document.body.appendChild(externalNode)
    range.setStart(externalNode, 0)
    range.setEnd(externalNode, 5)

    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.click(word)
    })

    expect(lookupWordMock).toHaveBeenCalledTimes(1)
    document.body.removeChild(externalNode)
  })

  it('external page selection does not block word right-click menu', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    const externalNode = document.createTextNode('external')
    document.body.appendChild(externalNode)
    const range = document.createRange()
    range.setStart(externalNode, 0)
    range.setEnd(externalNode, 5)

    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.contextMenu(word)
    })

    expect(openWordMenuMock).toHaveBeenCalledTimes(1)
    document.body.removeChild(externalNode)
  })

  it('external page selection does not block subtitle line click-to-seek', async () => {
    const onJumpToSubtitle = vi.fn()
    const subtitles: ASRCue[] = [{ start: 0, end: 2, text: 'Hello world' }]
    render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={0}
        onJumpToSubtitle={onJumpToSubtitle}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const line = screen.getByText('Hello').closest('.subtitle-line')!
    const externalNode = document.createTextNode('external')
    document.body.appendChild(externalNode)
    const range = document.createRange()
    range.setStart(externalNode, 0)
    range.setEnd(externalNode, 5)

    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.click(line)
    })

    expect(onJumpToSubtitle).toHaveBeenCalledTimes(1)
    document.body.removeChild(externalNode)
  })

  it('transcript-owned selection still blocks word right-click menu', async () => {
    renderTranscript()

    const word = screen.getByText('Hello')
    const node = word.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 2)

    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.contextMenu(word)
    })

    expect(openWordMenuMock).not.toHaveBeenCalled()
    expect(openLineMenuMock).not.toHaveBeenCalled()
  })

  it('transcript-owned selection still blocks line click-to-seek', async () => {
    const onJumpToSubtitle = vi.fn()
    const subtitles: ASRCue[] = [{ start: 0, end: 2, text: 'Hello world' }]
    render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={0}
        onJumpToSubtitle={onJumpToSubtitle}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const line = screen.getByText('Hello').closest('.subtitle-line')!
    const word = screen.getByText('Hello')
    const node = word.firstChild as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 2)

    const selection = window.getSelection()
    act(() => {
      selection?.removeAllRanges()
      selection?.addRange(range)
    })

    await act(async () => {
      fireEvent.click(line)
    })

    expect(onJumpToSubtitle).not.toHaveBeenCalled()
  })

  it('only applies selected background to the clicked duplicate word instance', async () => {
    renderTranscript('Hello Hello Hello')

    const words = screen.getAllByText('Hello')
    await act(async () => {
      fireEvent.click(words[1]!)
    })

    expect(words[1]?.className).toContain('bg-primary/20')
    expect(words[0]?.className).not.toContain('bg-primary/20')
    expect(words[2]?.className).not.toContain('bg-primary/20')
  })

  it('locks the hovered subtitle block while a selection surface is open', () => {
    const selectionState: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    selectionHookMock.mockImplementation(() => ({
      state: selectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    }))

    const subtitles: ASRCue[] = [
      { start: 0, end: 2, text: 'Hello world' },
      { start: 2, end: 4, text: 'Second line' },
    ]

    const { rerender } = render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={-1}
        onJumpToSubtitle={vi.fn()}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const firstLine = screen.getByText('Hello').closest('.subtitle-line')
    const secondLine = screen.getByText('Second').closest('.subtitle-line')

    expect(firstLine).not.toBeNull()
    expect(secondLine).not.toBeNull()

    act(() => {
      fireEvent.mouseEnter(firstLine!)
    })

    selectionState.surface = {
      surfaceId: 1,
      type: 'contextMenu',
      position: { x: 10, y: 10 },
      selectedText: 'Hello',
      menuMode: 'word',
      owner: {
        ownerCueKey: 'hello-world',
        ownerCueStartMs: 0,
        ownerKind: 'word',
      },
    }

    act(() => {
      rerender(
        <TranscriptView
          subtitles={subtitles}
          currentIndex={-1}
          onJumpToSubtitle={vi.fn()}
          isFollowing={false}
          onFollowingChange={vi.fn()}
          zoomScale={1}
        />
      )
    })

    expect(firstLine?.className).toContain('bg-accent/40')

    act(() => {
      fireEvent.mouseEnter(secondLine!)
    })

    expect(firstLine?.className).toContain('bg-accent/40')
    expect(secondLine?.className).not.toContain('bg-accent/40')
  })

  it('pins the hovered block to the surface source line instead of the last hovered line', () => {
    const selectionState: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    selectionHookMock.mockImplementation(() => ({
      state: selectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    }))

    const subtitles: ASRCue[] = [
      { start: 0, end: 2, text: 'Hello world' },
      { start: 2, end: 4, text: 'Second line' },
    ]

    const { rerender } = render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={-1}
        onJumpToSubtitle={vi.fn()}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const firstLine = screen.getByText('Hello').closest('.subtitle-line') as HTMLDivElement
    const secondLine = screen.getByText('Second').closest('.subtitle-line') as HTMLDivElement

    vi.spyOn(firstLine, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 300,
      bottom: 80,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    } as DOMRect)

    vi.spyOn(secondLine, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 100,
      left: 0,
      top: 100,
      right: 300,
      bottom: 180,
      width: 300,
      height: 80,
      toJSON: () => ({}),
    } as DOMRect)

    act(() => {
      fireEvent.mouseEnter(firstLine)
    })

    selectionState.surface = {
      surfaceId: 2,
      type: 'contextMenu',
      position: {
        x: 150,
        y: 120,
        rect: {
          left: 120,
          top: 120,
          right: 180,
          bottom: 140,
          width: 60,
          height: 20,
        },
      },
      selectedText: 'Second line',
      menuMode: 'line',
      owner: {
        ownerCueKey: 'second-line',
        ownerCueStartMs: 2,
        ownerKind: 'line',
      },
    }

    act(() => {
      rerender(
        <TranscriptView
          subtitles={subtitles}
          currentIndex={-1}
          onJumpToSubtitle={vi.fn()}
          isFollowing={false}
          onFollowingChange={vi.fn()}
          zoomScale={1}
        />
      )
    })

    expect(secondLine.className).toContain('bg-accent/40')
    expect(firstLine.className).not.toContain('bg-accent/40')
  })

  it('keeps line hover pinned after mouse leaves while line context menu is open', () => {
    const selectionState: SelectionState = {
      surface: { type: 'none' },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    selectionHookMock.mockImplementation(() => ({
      state: selectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    }))

    const subtitles: ASRCue[] = [{ start: 0, end: 2, text: 'Hello world' }]
    const { rerender } = render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={-1}
        onJumpToSubtitle={vi.fn()}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const line = screen.getByText('Hello').closest('.subtitle-line') as HTMLDivElement

    act(() => {
      fireEvent.mouseEnter(line)
    })

    selectionState.surface = {
      surfaceId: 3,
      type: 'contextMenu',
      position: { x: 105, y: 112 },
      selectedText: 'Hello world',
      menuMode: 'line',
      owner: {
        ownerCueKey: '0-2',
        ownerCueStartMs: 0,
        ownerKind: 'line',
      },
    }

    act(() => {
      rerender(
        <TranscriptView
          subtitles={subtitles}
          currentIndex={-1}
          onJumpToSubtitle={vi.fn()}
          isFollowing={false}
          onFollowingChange={vi.fn()}
          zoomScale={1}
        />
      )
    })

    act(() => {
      fireEvent.mouseLeave(line)
    })

    expect(line.className).toContain('bg-accent/40')
  })

  it('keeps transcript interactive while a context menu surface is open', () => {
    const selectionState: SelectionState = {
      surface: {
        surfaceId: 4,
        type: 'contextMenu',
        position: { x: 10, y: 10 },
        selectedText: 'Hello',
        menuMode: 'word',
        owner: {
          ownerCueKey: 'hello-world',
          ownerCueStartMs: 0,
          ownerKind: 'word',
        },
      },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    selectionHookMock.mockImplementation(() => ({
      state: selectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    }))

    renderTranscript()

    expect(screen.getByText('Hello').closest('#transcript-container')?.className).not.toContain(
      'pointer-events-none'
    )
  })

  it('makes the transcript inert while a lookup surface is open', () => {
    const selectionState: SelectionState = {
      surface: {
        surfaceId: 5,
        type: 'lookup',
        position: { x: 10, y: 10 },
        word: 'Hello',
        owner: {
          ownerCueKey: 'hello-world',
          ownerCueStartMs: 0,
          ownerKind: 'word',
        },
      },
      lookupLoading: false,
      lookupErrorKey: null,
      lookupResult: null,
    }

    selectionHookMock.mockImplementation(() => ({
      state: selectionState,
      wasDraggingRef: { current: false },
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      openLineMenu: openLineMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    }))

    renderTranscript()

    expect(screen.getByText('Hello').closest('#transcript-container')?.className).toContain(
      'pointer-events-none'
    )
  })

  it('delays same-word page highlighting until successful lookup callout closes', async () => {
    const actualSelectionHook = await vi.importActual<typeof import('../../../hooks/useSelection')>(
      '../../../hooks/useSelection'
    )
    selectionHookMock.mockImplementation(actualSelectionHook.useSelection)

    const selectionModule = await import('../../../lib/selection')
    const fetchDefinitionSpy = vi.spyOn(selectionModule, 'fetchDefinition').mockResolvedValue({
      word: 'hello',
      phonetic: '',
      meanings: [{ partOfSpeech: 'noun', definitions: [{ definition: 'A greeting' }] }],
    })

    renderTranscript('Hello Hello Hello')

    const words = screen.getAllByText('Hello')
    vi.spyOn(words[0] as HTMLElement, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      width: 50,
      height: 20,
      right: 150,
      bottom: 120,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    } as DOMRect)

    await act(async () => {
      fireEvent.click(words[0] as HTMLElement)
    })

    const transcriptContainer = document.querySelector('#transcript-container') as HTMLElement
    await waitFor(() => {
      expect(transcriptContainer.className).toContain('pointer-events-none')
    })
    expect(applyLookupHighlightForWordMock).not.toHaveBeenCalled()

    act(() => {
      selectionUIPropsRef.current?.onClose?.({ reason: 'dismiss', surface: 'lookup' })
    })

    expect(applyLookupHighlightForWordMock).toHaveBeenCalledTimes(1)
    expect(applyLookupHighlightForWordMock).toHaveBeenCalledWith('hello')

    fetchDefinitionSpy.mockRestore()
  })
})

function renderTranscript(text = 'Hello world') {
  const subtitles: ASRCue[] = [{ start: 0, end: 2, text }]
  return render(
    <TranscriptView
      subtitles={subtitles}
      currentIndex={0}
      onJumpToSubtitle={vi.fn()}
      isFollowing={false}
      onFollowingChange={vi.fn()}
      zoomScale={1}
    />
  )
}
