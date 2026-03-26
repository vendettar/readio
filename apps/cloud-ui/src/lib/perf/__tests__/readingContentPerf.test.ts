import { describe, expect, it } from 'vitest'
import {
  createReadingContentTransitionSample,
  isReadingContentTransitionOverBudget,
  READING_CONTENT_TRANSITION_BUDGET_MS,
} from '../readingContentPerf'

describe('readingContentPerf', () => {
  it('uses a deterministic default budget', () => {
    expect(READING_CONTENT_TRANSITION_BUDGET_MS).toBe(120)
  })

  it('detects over-budget transitions', () => {
    expect(isReadingContentTransitionOverBudget(130)).toBe(true)
    expect(isReadingContentTransitionOverBudget(100)).toBe(false)
  })

  it('builds a transition sample with default budget', () => {
    expect(
      createReadingContentTransitionSample({
        fromMode: 'docked',
        toMode: 'full',
        durationMs: 95,
      })
    ).toEqual({
      fromMode: 'docked',
      toMode: 'full',
      durationMs: 95,
      budgetMs: 120,
    })
  })
})
