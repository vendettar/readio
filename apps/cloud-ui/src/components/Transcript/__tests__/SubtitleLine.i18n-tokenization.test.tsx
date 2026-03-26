import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import * as textModule from '../../../lib/text'
import { SubtitleLine } from '../SubtitleLine'

function createRect(): DOMRect {
  return {
    x: 0,
    y: 0,
    width: 40,
    height: 16,
    top: 0,
    right: 40,
    bottom: 16,
    left: 0,
    toJSON: () => ({}),
  } as DOMRect
}

describe('SubtitleLine i18n tokenization', () => {
  it('dispatches lookup for CJK interactive tokens', () => {
    const onWordLookup = vi.fn()
    const onWordContextMenu = vi.fn()
    const { container } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="test-cue"
        start={0}
        text="今天天气很好。"
        language="zh-CN"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={vi.fn()}
        onWordLookup={onWordLookup}
        onWordContextMenu={onWordContextMenu}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const interactiveWords = container.querySelectorAll('[data-lookup-word="true"]')
    expect(interactiveWords.length).toBeGreaterThan(0)
    Object.defineProperty(interactiveWords[0], 'getBoundingClientRect', {
      value: () => createRect(),
    })

    fireEvent.click(interactiveWords[0])

    expect(onWordLookup).toHaveBeenCalledTimes(1)
    expect(onWordLookup).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.objectContaining({
        ownerCueKey: 'test-cue',
        ownerKind: 'word',
      })
    )
    expect(onWordContextMenu).not.toHaveBeenCalled()
  })

  it('memoizes tokenization by subtitle text and language', () => {
    const tokenizeSpy = vi.spyOn(textModule, 'tokenize')
    const { rerender } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="memo-cue"
        start={0}
        text="Readio 支持 English 和中文 mixed tokens."
        language="zh"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={vi.fn()}
        onWordLookup={vi.fn()}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    expect(tokenizeSpy).toHaveBeenCalledTimes(1)
    expect(tokenizeSpy).toHaveBeenLastCalledWith('Readio 支持 English 和中文 mixed tokens.', 'zh')

    rerender(
      <SubtitleLine
        lineIndex={0}
        cueKey="memo-cue"
        start={0}
        text="Readio 支持 English 和中文 mixed tokens."
        language="zh"
        isActive={true}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={vi.fn()}
        onWordLookup={vi.fn()}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )
    expect(tokenizeSpy).toHaveBeenCalledTimes(1)

    rerender(
      <SubtitleLine
        lineIndex={0}
        cueKey="memo-cue"
        start={0}
        text="Readio 支持 English 和中文 mixed tokens."
        language="en"
        isActive={true}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={vi.fn()}
        onWordLookup={vi.fn()}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )
    expect(tokenizeSpy).toHaveBeenCalledTimes(2)
    expect(tokenizeSpy).toHaveBeenLastCalledWith('Readio 支持 English 和中文 mixed tokens.', 'en')
  })

  it('supports keyboard activation for cue jump', () => {
    const onJumpToSubtitle = vi.fn()
    const { container, getByRole } = render(
      <SubtitleLine
        lineIndex={1}
        cueKey="keyboard-cue"
        start={12}
        text="Keyboard jump line"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={onJumpToSubtitle}
        onWordLookup={vi.fn()}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const lineContainer = container.querySelector('.subtitle-line') as HTMLDivElement
    expect(lineContainer.getAttribute('role')).toBeNull()

    const lineButton = getByRole('button', { name: 'Keyboard jump line' })
    expect(lineButton).toBeTruthy()
    expect(lineButton.tagName).toBe('BUTTON')

    fireEvent.keyDown(lineButton, { key: 'Enter' })
    fireEvent.keyDown(lineButton, { key: ' ', code: 'Space' })

    expect(onJumpToSubtitle).toHaveBeenCalledTimes(2)
  })

  it('keeps the line body directly hit-testable for selection while preserving click-to-jump', () => {
    const onJumpToSubtitle = vi.fn()
    const onWordLookup = vi.fn()
    const { container } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="line-body-hit-target"
        start={0}
        text="Hello world"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={onJumpToSubtitle}
        onWordLookup={onWordLookup}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const line = container.querySelector('.subtitle-line') as HTMLDivElement
    const paragraph = line.querySelector('.subtitle-text') as HTMLParagraphElement
    const lineActionButton = line.querySelector(
      '[data-line-action-button="true"]'
    ) as HTMLButtonElement

    expect(lineActionButton).toBeTruthy()
    expect(lineActionButton.className).not.toContain('inset-0')

    fireEvent.click(paragraph)

    expect(onJumpToSubtitle).toHaveBeenCalledTimes(1)
    expect(onWordLookup).not.toHaveBeenCalled()
  })

  it('supports keyboard activation for interactive words', () => {
    const onWordLookup = vi.fn()
    const onJumpToSubtitle = vi.fn()
    const { container } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="keyboard-word"
        start={20}
        text="hello world"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={onJumpToSubtitle}
        onWordLookup={onWordLookup}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const firstWord = container.querySelector('[data-lookup-word="true"]') as HTMLElement
    expect(firstWord).toBeTruthy()
    expect(firstWord.getAttribute('aria-label')).toBeNull()
    Object.defineProperty(firstWord, 'getBoundingClientRect', {
      value: () => createRect(),
    })

    fireEvent.keyDown(firstWord, { key: 'Enter' })
    fireEvent.keyDown(firstWord, { key: ' ', code: 'Space' })

    expect(onWordLookup).toHaveBeenCalledTimes(2)
    expect(onWordLookup).toHaveBeenNthCalledWith(
      1,
      'hello',
      expect.any(Object),
      expect.objectContaining({
        ownerCueKey: 'keyboard-word',
        ownerKind: 'word',
      })
    )
    expect(onJumpToSubtitle).not.toHaveBeenCalled()
  })

  it('allows semantic line-button focus/activation without regressing word click or context menu behavior', () => {
    const onJumpToSubtitle = vi.fn()
    const onWordLookup = vi.fn()
    const onWordContextMenu = vi.fn()
    const { container, getByRole } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="line-button-focus-contract"
        start={40}
        text="Hello world"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={onJumpToSubtitle}
        onWordLookup={onWordLookup}
        onWordContextMenu={onWordContextMenu}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const lineButton = getByRole('button', { name: 'Hello world' })
    const word = container.querySelector('[data-lookup-word="true"]') as HTMLElement

    expect(lineButton).toBeTruthy()
    expect(word).toBeTruthy()

    lineButton.focus()
    expect(document.activeElement).toBe(lineButton)

    fireEvent.keyDown(lineButton, { key: 'Enter' })
    expect(onJumpToSubtitle).toHaveBeenCalledTimes(1)

    Object.defineProperty(word, 'getBoundingClientRect', {
      value: () => createRect(),
    })

    fireEvent.click(word)
    expect(onWordLookup).toHaveBeenCalledTimes(1)
    expect(onJumpToSubtitle).toHaveBeenCalledTimes(1)

    const contextMenuEvent = new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 8,
    })
    word.dispatchEvent(contextMenuEvent)

    expect(onWordContextMenu).toHaveBeenCalledTimes(1)
    expect(onJumpToSubtitle).toHaveBeenCalledTimes(1)
  })

  it('keeps accessible naming on the line button while word tokens expose only token text', () => {
    const { container, getByRole, queryByLabelText } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="accessible-name-contract"
        start={50}
        text="Hello world"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={vi.fn()}
        onWordLookup={vi.fn()}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const lineButton = getByRole('button', { name: 'Hello world' })
    const word = container.querySelector('[data-lookup-word="true"]') as HTMLElement

    expect(lineButton).toBeTruthy()
    expect(word.textContent).toBe('Hello')
    expect(queryByLabelText('Hello')).toBeNull()
    expect(queryByLabelText('Hello world')).toBe(lineButton)
    expect(word.getAttribute('aria-label')).toBeNull()
  })

  it('keeps word click lookup isolated from line click activation', () => {
    const onWordLookup = vi.fn()
    const onJumpToSubtitle = vi.fn()
    const { container } = render(
      <SubtitleLine
        lineIndex={0}
        cueKey="word-click-isolation"
        start={30}
        text="hello world"
        language="en"
        isActive={false}
        isHoverLocked={false}
        isPinnedHover={false}
        onJumpToSubtitle={onJumpToSubtitle}
        onWordLookup={onWordLookup}
        onWordContextMenu={vi.fn()}
        onHoverChange={vi.fn()}
        wasDraggingRef={{ current: false }}
      />
    )

    const firstWord = container.querySelector('[data-lookup-word="true"]') as HTMLElement
    expect(firstWord).toBeTruthy()
    Object.defineProperty(firstWord, 'getBoundingClientRect', {
      value: () => createRect(),
    })

    fireEvent.click(firstWord)

    expect(onWordLookup).toHaveBeenCalledTimes(1)
    expect(onJumpToSubtitle).not.toHaveBeenCalled()
  })
})
