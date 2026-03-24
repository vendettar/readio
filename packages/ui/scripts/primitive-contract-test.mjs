import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { Button, Input, cn } from '../dist/src/index.js'

test('cn merges class lists with tailwind precedence', () => {
  assert.equal(cn('px-2', false, undefined, 'px-4', 'text-sm'), 'px-4 text-sm')
})

test('Button preserves variant and size contract', () => {
  const html = renderToStaticMarkup(
    React.createElement(Button, { variant: 'outline', size: 'sm' }, 'Outline')
  )

  assert.match(html, /border-input/)
  assert.match(html, /h-8/)
  assert.doesNotMatch(html, /ui-button/)
})

test('Button preserves asChild contract', () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Button,
      { asChild: true, variant: 'ghost' },
      React.createElement('a', { href: '/podcasts/1' }, 'Open')
    )
  )

  assert.match(html, /^<a\b/)
  assert.doesNotMatch(html, /\stype=/)
  assert.match(html, /hover:bg-accent/)
})

test('Input preserves base interaction contract', () => {
  const html = renderToStaticMarkup(
    React.createElement(Input, { type: 'search', placeholder: 'Search podcasts' })
  )

  assert.match(html, /border-input/)
  assert.match(html, /focus-visible:ring-1/)
  assert.doesNotMatch(html, /ui-input/)
})
