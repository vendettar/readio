export const READING_CONTENT_TRANSITION_BUDGET_MS = 120

export interface ReadingContentTransitionSample {
  fromMode: 'docked' | 'full'
  toMode: 'docked' | 'full'
  durationMs: number
  budgetMs: number
}

export function isReadingContentTransitionOverBudget(
  durationMs: number,
  budgetMs = READING_CONTENT_TRANSITION_BUDGET_MS
): boolean {
  return durationMs > budgetMs
}

export function createReadingContentTransitionSample(input: {
  fromMode: 'docked' | 'full'
  toMode: 'docked' | 'full'
  durationMs: number
  budgetMs?: number
}): ReadingContentTransitionSample {
  return {
    fromMode: input.fromMode,
    toMode: input.toMode,
    durationMs: input.durationMs,
    budgetMs: input.budgetMs ?? READING_CONTENT_TRANSITION_BUDGET_MS,
  }
}
