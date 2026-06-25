import { describe, expect, it } from 'vitest'
import { sanitizeHtml, stripHtml } from '../htmlUtils'

describe('htmlUtils - sanitizeHtml', () => {
  it('should strip <style> tags', () => {
    const dirty = '<div>Hello<style>body { background: red; }</style></div>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('<style>')
    expect(clean).not.toContain('background: red')
    expect(clean).toBe('<div>Hello</div>')
  })

  it('should strip <script> tags', () => {
    const dirty = '<div>Hello<script>alert("xss")</script></div>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('<script>')
    expect(clean).toBe('<div>Hello</div>')
  })

  it('should strip inline style attributes', () => {
    const dirty = '<div style="color: red; position: fixed;">Hello</div>'
    const clean = sanitizeHtml(dirty)
    expect(clean).not.toContain('style=')
    expect(clean).not.toContain('color: red')
    expect(clean).toBe('<div>Hello</div>')
  })

  it('should allow safe tags and attributes', () => {
    const dirty = '<p><a href="https://example.com">Link</a> <strong>Bold</strong></p>'
    const clean = sanitizeHtml(dirty)
    expect(clean).toContain('<p>')
    expect(clean).toContain('<a href="https://example.com"')
    expect(clean).toContain('<strong>Bold</strong>')
  })

  it('should add target="_blank" and rel="noopener noreferrer" to links', () => {
    const dirty = '<a href="https://example.com">Link</a>'
    const clean = sanitizeHtml(dirty)
    expect(clean).toContain('target="_blank"')
    expect(clean).toContain('rel="noopener noreferrer"')
  })
})

describe('htmlUtils - stripHtml', () => {
  it('extracts text after removing unsafe HTML and event attributes', () => {
    const dirty =
      'Safe <img src=x onerror="alert(1)"> text <script>alert("xss")</script><style>body{color:red}</style><link rel="stylesheet" href="evil.css">'

    expect(stripHtml(dirty)).toBe('Safe text')
  })

  it('decodes HTML entities while returning plain text', () => {
    expect(stripHtml('<p>Tom &amp; Jerry&nbsp; &lt;3</p>')).toBe('Tom & Jerry <3')
  })

  it('preserves semantic line breaks without keeping markup', () => {
    const dirty = '<p>One<br>Two</p><div>Three</div><ul><li>Four</li></ul>'

    expect(stripHtml(dirty, { preserveLineBreaks: true })).toBe('One\nTwo\n\nThree\nFour')
  })

  it('handles malformed HTML safely', () => {
    const dirty = '<p>Open <strong>tag<img src=x onerror=alert(1)> tail'

    expect(stripHtml(dirty)).toBe('Open tag tail')
  })
})
