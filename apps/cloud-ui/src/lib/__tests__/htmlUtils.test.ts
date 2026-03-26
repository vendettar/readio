import { describe, expect, it } from 'vitest'
import { sanitizeHtml } from '../htmlUtils'

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
