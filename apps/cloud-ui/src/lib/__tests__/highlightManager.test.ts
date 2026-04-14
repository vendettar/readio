import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  clearLookupHighlights,
  destroyLookupHighlight,
  highlightWordInSubtitles,
  initLookupHighlight,
} from '../highlightManager'

class MockHighlight {
  private ranges = new Set<Range>()

  add(range: Range) {
    this.ranges.add(range)
  }

  clear() {
    this.ranges.clear()
  }
}

describe('highlightManager', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'Highlight', {
      configurable: true,
      value: MockHighlight,
    })
    Object.defineProperty(globalThis, 'CSS', {
      configurable: true,
      value: {
        highlights: new Map<string, unknown>(),
      },
    })

    document.body.innerHTML = ''
    expect(initLookupHighlight()).toBe(true)
    clearLookupHighlights()
  })

  afterEach(() => {
    destroyLookupHighlight()
    document.body.innerHTML = ''
  })

  it('highlights matches in nested .subtitle-text span nodes', () => {
    document.body.innerHTML = `
      <div class="subtitle-text">
        <span>Hello </span><span>world</span><span> hello</span>
      </div>
    `

    const count = highlightWordInSubtitles('hello')
    expect(count).toBe(2)
  })

  it('matches case-insensitively across multiple text nodes', () => {
    document.body.innerHTML = `
      <div class="subtitle-text"><span>He</span><span>llo</span><span> there HELLO</span></div>
    `

    const count = highlightWordInSubtitles('hello')
    expect(count).toBe(2)
  })

  it('does not skip matches across multiple subtitle elements', () => {
    document.body.innerHTML = `
      <div class="subtitle-text">hello first</div>
      <div class="subtitle-text">hello second</div>
    `

    const count = highlightWordInSubtitles('hello')
    expect(count).toBe(2)
  })

  it('respects word boundaries and avoids punctuation over-match', () => {
    document.body.innerHTML = '<div class="subtitle-text">cat scatter cat.</div>'

    const count = highlightWordInSubtitles('cat')
    expect(count).toBe(2)
  })
})
