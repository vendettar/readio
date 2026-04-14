import { fireEvent, render } from '@testing-library/react'
import type React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ASRCue } from '../../../lib/asr/types'
import type { SelectionState } from '../../../lib/selection'
import * as textModule from '../../../lib/text'
import { useTranscriptStore } from '../../../store/transcriptStore'
import { TranscriptView } from '../TranscriptView'

let mockLanguage = 'zh-CN'

const { lookupWordMock, openWordMenuMock, useSelectionMock } = vi.hoisted(() => ({
  lookupWordMock: vi.fn().mockResolvedValue(undefined),
  openWordMenuMock: vi.fn(),
  useSelectionMock: vi.fn(),
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

vi.mock('../../../hooks/useSelection', () => ({
  useSelection: useSelectionMock,
}))

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
  SelectionUI: () => null,
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

describe('TranscriptView i18n tokenization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLanguage = 'zh-CN'
    useTranscriptStore.setState({ highlightedWord: null })
    useSelectionMock.mockReturnValue({
      state: baseSelectionState,
      copyText: vi.fn(),
      searchWeb: vi.fn(),
      openWordMenu: openWordMenuMock,
      lookupWord: lookupWordMock,
      lookupFromMenu: vi.fn(),
      closeUI: vi.fn(),
    })
  })

  it('keeps lookup + context-menu behavior on CJK tokens and applies highlight', () => {
    const { container } = renderTranscript([{ start: 0, end: 2, text: '今天天气很好。' }])

    const interactiveWords = container.querySelectorAll('[data-lookup-word="true"]')
    expect(interactiveWords.length).toBeGreaterThan(0)

    fireEvent.click(interactiveWords[0])
    expect(lookupWordMock).toHaveBeenCalledTimes(1)
    expect(openWordMenuMock).not.toHaveBeenCalled()
    expect(interactiveWords[0].className).toContain('bg-primary/20')

    fireEvent.contextMenu(interactiveWords[0])
    expect(openWordMenuMock).toHaveBeenCalledTimes(1)
  })

  it('updates tokenization language on rerender without stale locale', () => {
    const tokenizeSpy = vi.spyOn(textModule, 'tokenize')
    const subtitles: ASRCue[] = [
      { start: 0, end: 2, text: 'Readio 支持 English 和中文 mixed tokens.' },
    ]
    const { rerender } = render(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={0}
        onJumpToSubtitle={vi.fn()}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const tokenLanguages = tokenizeSpy.mock.calls.map(([, language]) => language)
    expect(tokenLanguages).toContain('zh-CN')

    mockLanguage = 'en'
    rerender(
      <TranscriptView
        subtitles={subtitles}
        currentIndex={0}
        onJumpToSubtitle={vi.fn()}
        isFollowing={false}
        onFollowingChange={vi.fn()}
        zoomScale={1}
      />
    )

    const updatedTokenLanguages = tokenizeSpy.mock.calls.map(([, language]) => language)
    expect(updatedTokenLanguages).toContain('en')
  })
})

function renderTranscript(subtitles: ASRCue[]) {
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
